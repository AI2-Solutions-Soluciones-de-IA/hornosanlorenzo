/**
 * Precios de oferta de «Este mes».
 *
 * Una noticia que enlaza un producto puede fijarle un precio de oferta (uno,
 * o uno por tamaño) y, si se quiere, una fecha de fin. Mientras la noticia
 * está publicada y la fecha no ha pasado, ese producto se vende a ese precio
 * en TODA la web: la carta, su ficha, la tarjeta de Este mes y, sobre todo,
 * el cobro (`priceOrder` lee los precios ya rebajados de
 * `productosParaPedido`). Así el cliente nunca ve un importe y paga otro.
 *
 * Lógica pura: la consulta vive en `~/lib/db/ofertas.ts` y aquí solo se
 * decide qué precio sale. El panel nunca pasa por aquí: edita el precio de
 * siempre, y si leyera el rebajado lo guardaría como si fuera el normal.
 */

/** La oferta de una noticia, como sale de la base de datos. */
export type OfertaNoticia = {
  /** Slug del producto enlazado. */
  slug: string;
  precioCents: number | null;
  /** Tamaño (`variant_id`) → precio de oferta. */
  variantes: Record<string, number>;
  /** Último día de la oferta (`YYYY-MM-DD`), o `null` si no caduca. */
  hasta: string | null;
};

/** Todas las ofertas vigentes de UN producto, ya juntas. */
export type OfertaProducto = Omit<OfertaNoticia, "slug">;

/** Lo que se añade a un producto rebajado, para tachar el precio de siempre. */
export type ConOferta = {
  precioAntesCents?: number;
  /** Solo si alguna oferta se aplica: `null` = sin fecha de fin. */
  ofertaHasta?: string | null;
};

const menor = (a: number | null | undefined, b: number | null | undefined) =>
  a == null ? (b ?? null) : b == null ? a : Math.min(a, b);

/**
 * Junta las ofertas por producto. Si dos noticias rebajan lo mismo, gana el
 * precio más bajo (tamaño a tamaño), que es lo que el cliente esperaría.
 * La fecha de fin es la más tardía, y ninguna si alguna no caduca.
 */
export function juntaOfertas(
  ofertas: OfertaNoticia[],
): Map<string, OfertaProducto> {
  const m = new Map<string, OfertaProducto>();
  for (const { slug, ...o } of ofertas) {
    const prev = m.get(slug);
    if (!prev) {
      m.set(slug, {
        precioCents: o.precioCents,
        variantes: { ...o.variantes },
        hasta: o.hasta,
      });
      continue;
    }
    prev.precioCents = menor(prev.precioCents, o.precioCents);
    for (const [id, c] of Object.entries(o.variantes))
      prev.variantes[id] = menor(prev.variantes[id], c) as number;
    prev.hasta =
      prev.hasta === null || o.hasta === null
        ? null
        : prev.hasta > o.hasta
          ? prev.hasta
          : o.hasta;
  }
  return m;
}

/**
 * Devuelve una copia del producto con la oferta aplicada. Solo rebaja: un
 * precio de oferta igual o mayor que el de siempre se ignora, y un producto
 * sin precio («a consultar») no gana uno por tener oferta.
 *
 * `idDe` saca el id de un tamaño: la carta lo llama `variantId` y la
 * tarjeta de Este mes, `id`.
 */
export function aplicaOferta<
  P extends { priceCents: number | null; variantes: { priceCents: number }[] },
>(
  producto: P,
  oferta: OfertaProducto | undefined,
  idDe: (v: P["variantes"][number]) => string,
): P & ConOferta {
  if (!oferta) return producto;
  let rebajado = false;
  const copia: P & ConOferta = { ...producto };

  if (
    producto.priceCents !== null &&
    oferta.precioCents !== null &&
    oferta.precioCents < producto.priceCents
  ) {
    copia.priceCents = oferta.precioCents;
    copia.precioAntesCents = producto.priceCents;
    rebajado = true;
  }
  copia.variantes = producto.variantes.map((v) => {
    const c = oferta.variantes[idDe(v)];
    if (c === undefined || c >= v.priceCents) return v;
    rebajado = true;
    return { ...v, priceCents: c, precioAntesCents: v.priceCents };
  });

  if (rebajado) copia.ofertaHasta = oferta.hasta;
  return copia;
}
