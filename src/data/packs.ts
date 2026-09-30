/**
 * Tipos y cuentas de los packs. La composición y el copy de la ficha viven en
 * la base de datos (`pack_definiciones` y `pack_piezas`, que edita el panel;
 * se leen con `~/lib/db/packs`, que devuelve exactamente `DefinicionPack`).
 * El nombre y el precio de cada pack están en su fila de `productos` (el
 * precio del pack sale de `price_cents` del propio pack, nunca de la
 * definición), y el de cada pieza, en la carta: un cambio de precio en la
 * carta se refleja solo en el «comprado suelto» y en el ahorro.
 *
 * Los siete packs con los que se arrancó (PACKS_SAN_LORENZO_FINALES,
 * 30-9-2026) están en `scripts/packs-iniciales.json`.
 */

/** Lo mínimo que estas cuentas necesitan saber de un producto de la carta. */
export type ProductoPieza = {
  slug: string;
  name: string;
  seccion: string | null;
  priceCents: number | null;
  consultar: boolean;
  activo: boolean;
  agotado: boolean;
  variantes: { variantId: string; label: string; priceCents: number }[];
};

export type PiezaFija = {
  tipo: "fija";
  slug: string;
  variantId?: string;
  /** Lo que se lee en la ficha: «24 bollos preñaos asturianos». */
  titulo: string;
  /** Segunda línea de la ficha, en pequeño. */
  descripcion: string;
  /** Solo la foto comestible del Pack Cumpleaños. */
  requiereFoto?: true;
  /**
   * Nombre con el que la pieza llega al pedido y a la hoja de producción, en
   * lugar de «<producto> · <variante>». Solo para la foto: `tarta-retrato` es
   * el suplemento de foto de las tartas y su variante de 15 € se llama
   * «Pequeña», que en un pack con plancha XL confundiría al obrador.
   */
  rotulo?: string;
};

export type HuecoEleccion = {
  tipo: "eleccion";
  /** Clave en `opciones` del carrito y del pedido. Estable: no se renombra. */
  id: string;
  titulo: string;
  descripcion: string;
  /** Etiqueta del desplegable: «Sabor de la empanada». */
  etiqueta: string;
  variantId?: string;
} & ({ seccion: string } | { slugs: readonly string[] });

export type Pieza = PiezaFija | HuecoEleccion;

export type DefinicionPack = {
  slug: string;
  /** Antetítulo de la ficha: «Cumpleaños en casa». */
  ocasion: string;
  personas: { min: number; max: number; texto: string };
  paraQuien: readonly string[];
  /** Consejo del obrador (conservación, horno). Opcional. */
  consejo?: string;
  piezas: readonly Pieza[];
};

const huecosDe = (def: DefinicionPack): HuecoEleccion[] =>
  def.piezas.filter((x): x is HuecoEleccion => x.tipo === "eleccion");

/** Todos los slugs que una definición puede necesitar leer de la carta, salvo los de sección. */
export function slugsFijos(def: DefinicionPack): string[] {
  const res = new Set<string>();
  for (const x of def.piezas) {
    if (x.tipo === "fija") res.add(x.slug);
    else if ("slugs" in x) x.slugs.forEach((s) => res.add(s));
  }
  return [...res];
}

export function seccionesDeHuecos(def: DefinicionPack): string[] {
  const res = new Set<string>();
  for (const h of huecosDe(def)) if ("seccion" in h) res.add(h.seccion);
  return [...res];
}

const vendible = (x: ProductoPieza | undefined): x is ProductoPieza =>
  !!x && x.activo && !x.agotado && !x.consultar && x.priceCents !== null;

/** Precio y etiqueta de un producto en la variante pedida; null si no la tiene. */
function enVariante(x: ProductoPieza, variantId?: string) {
  if (!variantId) {
    // Un producto con tamaños pedido sin tamaño es ambiguo: no vale.
    if (x.variantes.length > 0) return null;
    return { priceCents: x.priceCents!, label: null as string | null };
  }
  const v = x.variantes.find((v) => v.variantId === variantId);
  return v ? { priceCents: v.priceCents, label: v.label } : null;
}

function admitido(h: HuecoEleccion, x: ProductoPieza): boolean {
  return "slugs" in h ? h.slugs.includes(x.slug) : x.seccion === h.seccion;
}

export type Opcion = { slug: string; name: string; priceCents: number };

/** Productos elegibles para un hueco: activos, no agotados, con precio y con la variante pedida. */
export function opcionesDeHueco(h: HuecoEleccion, productos: readonly ProductoPieza[]): Opcion[] {
  const res: Opcion[] = [];
  for (const x of productos) {
    if (!admitido(h, x) || !vendible(x)) continue;
    const v = enVariante(x, h.variantId);
    if (v) res.push({ slug: x.slug, name: x.name, priceCents: v.priceCents });
  }
  return res;
}

export type PiezaResuelta = {
  slug: string;
  nombre: string;
  varianteLabel: string | null;
  /** Unidades de esa pieza por cada pack. Hoy siempre 1. */
  qty: number;
};

/**
 * Los mensajes son para el cliente y no nombran el pack: la definición no lo
 * conoce (su nombre vive en la ficha), `priceOrder` los envuelve con él.
 */
export class PackError extends Error {}

/**
 * Comprueba las elecciones contra la definición y devuelve el desglose.
 * Lanza PackError con mensaje presentable si falta un hueco, sobra uno, la
 * elección no es válida o una pieza fija no se puede vender hoy.
 */
export function resolverPack(
  def: DefinicionPack,
  productos: ReadonlyMap<string, ProductoPieza>,
  opciones: Readonly<Record<string, string>>,
): PiezaResuelta[] {
  const res: PiezaResuelta[] = [];
  for (const pieza of def.piezas) {
    if (pieza.tipo === "fija") {
      const x = productos.get(pieza.slug);
      const v = vendible(x) ? enVariante(x, pieza.variantId) : null;
      if (!x || !v) {
        throw new PackError(`no está disponible ahora mismo: falta «${x?.name ?? pieza.slug}».`);
      }
      res.push(
        pieza.rotulo
          ? { slug: x.slug, nombre: pieza.rotulo, varianteLabel: null, qty: 1 }
          : { slug: x.slug, nombre: x.name, varianteLabel: v.label, qty: 1 },
      );
      continue;
    }
    const elegido = opciones[pieza.id];
    if (!elegido) throw new PackError(`Elige ${pieza.etiqueta.toLowerCase()}.`);
    const x = productos.get(elegido);
    if (!x || !admitido(pieza, x)) throw new PackError("Elección no válida.");
    // Se lee el nombre antes: tras `vendible` (guarda de tipo) TypeScript da `x` por `never` en la rama de fallo.
    const nombre = x.name;
    if (!vendible(x)) throw new PackError(`«${nombre}» se ha agotado: elige otro.`);
    const v = enVariante(x, pieza.variantId);
    if (!v) throw new PackError("Elección no válida.");
    res.push({ slug: x.slug, nombre: x.name, varianteLabel: v.label, qty: 1 });
  }
  // Una clave que el pack no tiene es un cliente manipulado, no un descuido.
  const ids = new Set(huecosDe(def).map((h) => h.id));
  if (!Object.keys(opciones).every((k) => ids.has(k))) throw new PackError("Elección no válida.");
  return res;
}

/** Suma de las piezas al precio de carta; en un hueco, la opción más barata. null si falta alguna. */
export function precioSueltoCents(def: DefinicionPack, productos: readonly ProductoPieza[]): number | null {
  let total = 0;
  for (const pieza of def.piezas) {
    if (pieza.tipo === "fija") {
      const x = productos.find((p) => p.slug === pieza.slug);
      const v = x ? enVariante(x, pieza.variantId) : null;
      if (!v) return null;
      total += v.priceCents;
    } else {
      const precios = opcionesDeHueco(pieza, productos).map((o) => o.priceCents);
      if (precios.length === 0) return null;
      total += Math.min(...precios);
    }
  }
  return total;
}

/** % entero de ahorro, o null si no ahorra (≤ 0) o no se puede calcular. */
export function ahorroPct(precioPackCents: number, sueltoCents: number | null): number | null {
  if (sueltoCents === null || precioPackCents >= sueltoCents) return null;
  const pct = Math.round((1 - precioPackCents / sueltoCents) * 100);
  // Un ahorro que redondea a 0 % no se enseña: «−0 %» desanima más que no decir nada.
  return pct > 0 ? pct : null;
}

/** Precio por persona redondeado a 10 céntimos, en céntimos. */
export function precioPorPersonaCents(precioPackCents: number, def: DefinicionPack): number {
  return Math.round(precioPackCents / def.personas.max / 10) * 10;
}

/** Etiqueta legible de una pieza resuelta: «Empanada de carne · Entera 16–20 rac.» */
export function etiquetaPieza(p: PiezaResuelta): string {
  return p.varianteLabel ? `${p.nombre} · ${p.varianteLabel}` : p.nombre;
}
