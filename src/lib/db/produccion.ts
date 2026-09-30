import { pool } from "~/lib/db/pool";

/**
 * La hoja de producción: qué hornear y cuánto para un día de entrega (o
 * varios seguidos, `desde`–`hasta`),
 * agrupado por producto y desglosado por destino. Es lo que el obrador mira
 * cada mañana; `/admin/pedidos` lista pedido a pedido, esto suma.
 *
 * Único sitio con este SQL; hacia fuera, camelCase.
 *
 * Cuentan los pedidos cobrados y los anotados sin pago: los dos hay que
 * hornearlos. Un `iniciado` es un carrito abandonado y no se prepara.
 */

export type LineaProduccion = {
  slug: string | null;
  nombre: string;
  varianteLabel: string | null;
  /** Suma de `qty` en todos los pedidos del día. */
  unidades: number;
  /** En cuántos pedidos distintos aparece. */
  pedidos: number;
  /** Cuánto de esto va a cada destino; vacío si el pedido no dice modalidad. */
  porDestino: { destino: string; unidades: number }[];
};

export type HojaProduccion = {
  /** `YYYY-MM-DD`, tal cual se pidió. Un solo día: `desde === hasta`. */
  desde: string;
  hasta: string;
  totalPedidos: number;
  /** Ordenadas por nombre y luego por variante. */
  lineas: LineaProduccion[];
  porDestino: { destino: string; pedidos: number; unidades: number }[];
  /**
   * Pedidos de ese día que no dicen modalidad (reconstruidos desde Stripe,
   * migración 008). Sus unidades sí se suman a `lineas`, porque hay que
   * hornearlas, pero no se les inventa destino: se avisa y el obrador los
   * mira uno a uno en Pedidos.
   */
  sinDatos: number;
  /**
   * Los packs del día, para montar las cajas. Sus piezas ya están sumadas en
   * `lineas`; aquí solo se dice cuántas cajas de cada pack hay que preparar.
   */
  packs: { nombre: string; unidades: number; pedidos: number }[];
};

/**
 * Clave de destino: `recogida:<store_id>` o `domicilio`. Es la página quien
 * la traduce a nombre de tienda; aquí no se sabe nada de tiendas. NULL si el
 * pedido no dice modalidad: así se queda fuera de los desgloses sin
 * necesidad de inventar un valor.
 */
const DESTINO = `case p.mode
                   when 'recogida'  then 'recogida:' || coalesce(p.store_id, '')
                   when 'domicilio' then 'domicilio'
                 end`;
/** Los pedidos del día (o de los días del rango) que hay que hornear. */
const DEL_DIA =
  "p.fecha_entrega between $1::date and $2::date and p.estado in ('pagado', 'sin_pago')";

/**
 * Lo que hay que hornear: las líneas sueltas tal cual y, de cada pack, sus
 * piezas multiplicadas por las unidades del pack. La línea del pack en sí
 * no se hornea: sale aparte, en `packs`, para montar las cajas.
 */
const PIEZAS = `(
  select l.pedido_id, l.slug, l.nombre, l.variante_label, l.qty
    from lineas_pedido l
   where l.detalle is null
  union all
  select l.pedido_id, d.slug, d.nombre, d."varianteLabel", d.qty * l.qty
    from lineas_pedido l
   cross join lateral jsonb_to_recordset(l.detalle)
         as d(slug text, nombre text, "varianteLabel" text, qty int)
   where l.detalle is not null
)`;

const n = (v: unknown): number => Number(v ?? 0);

/** Sin `hasta`, un solo día. Un rango al revés se da la vuelta. */
export async function hojaProduccion(
  desdePedido: string,
  hastaPedido: string = desdePedido,
): Promise<HojaProduccion> {
  const [desde, hasta] =
    hastaPedido < desdePedido ? [hastaPedido, desdePedido] : [desdePedido, hastaPedido];
  const args = [desde, hasta];

  const [totales, productos, productoDestino, packs, destinos] = await Promise.all([
    pool.query(
      `select count(*)                                as total,
              count(*) filter (where p.mode is null)  as sin_datos
         from pedidos p
        where ${DEL_DIA}`,
      args,
    ),
    // `slug` entra en la agrupación aunque el obrador mire el nombre: una
    // línea reconstruida desde Stripe no trae slug y su nombre es el que
    // Stripe devolvió, así que no hay garantía de que sea el mismo producto.
    pool.query(
      `select l.slug, l.nombre, l.variante_label as "varianteLabel",
              sum(l.qty)                as unidades,
              count(distinct l.pedido_id) as pedidos
         from ${PIEZAS} l
         join pedidos p on p.id = l.pedido_id
        where ${DEL_DIA}
        group by l.slug, l.nombre, l.variante_label
        order by l.nombre, l.variante_label nulls first, l.slug nulls first`,
      args,
    ),
    pool.query(
      `select l.slug, l.nombre, l.variante_label as "varianteLabel",
              ${DESTINO} as destino,
              sum(l.qty) as unidades
         from ${PIEZAS} l
         join pedidos p on p.id = l.pedido_id
        where ${DEL_DIA} and p.mode is not null
        group by l.slug, l.nombre, l.variante_label, ${DESTINO}
        order by destino`,
      args,
    ),
    // Las cajas por montar: la línea del pack, no sus piezas.
    pool.query(
      `select l.nombre,
              sum(l.qty)                  as unidades,
              count(distinct l.pedido_id) as pedidos
         from lineas_pedido l
         join pedidos p on p.id = l.pedido_id
        where ${DEL_DIA} and l.detalle is not null
        group by l.nombre
        order by l.nombre`,
      args,
    ),
    // Un pedido sin líneas no existe (se crean en la misma transacción), así
    // que contar pedidos desde las líneas no deja ninguno fuera.
    pool.query(
      `select ${DESTINO}          as destino,
              count(distinct p.id) as pedidos,
              sum(l.qty)           as unidades
         from pedidos p
         join lineas_pedido l on l.pedido_id = p.id
        where ${DEL_DIA} and p.mode is not null
        group by ${DESTINO}
        order by destino`,
      args,
    ),
  ]);

  // Reparto de cada producto por destino, indexado por la misma clave que
  // agrupa la lista principal.
  const clave = (r: {
    slug: string | null;
    nombre: string;
    varianteLabel: string | null;
  }) => JSON.stringify([r.slug, r.nombre, r.varianteLabel]);
  const reparto = new Map<string, { destino: string; unidades: number }[]>();
  for (const r of productoDestino.rows) {
    const lista = reparto.get(clave(r)) ?? [];
    lista.push({ destino: r.destino, unidades: n(r.unidades) });
    reparto.set(clave(r), lista);
  }

  const t = totales.rows[0];
  return {
    desde,
    hasta,
    totalPedidos: n(t.total),
    lineas: productos.rows.map((r) => ({
      slug: r.slug,
      nombre: r.nombre,
      varianteLabel: r.varianteLabel,
      unidades: n(r.unidades),
      pedidos: n(r.pedidos),
      porDestino: reparto.get(clave(r)) ?? [],
    })),
    porDestino: destinos.rows.map((r) => ({
      destino: r.destino,
      pedidos: n(r.pedidos),
      unidades: n(r.unidades),
    })),
    sinDatos: n(t.sin_datos),
    packs: packs.rows.map((r) => ({
      nombre: r.nombre,
      unidades: n(r.unidades),
      pedidos: n(r.pedidos),
    })),
  };
}
