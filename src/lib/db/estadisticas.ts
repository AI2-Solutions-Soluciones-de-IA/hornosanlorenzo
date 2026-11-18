import { pool } from "~/lib/db/pool";
import type { DestinoPedido } from "~/lib/db/pedidos";

/**
 * Cifras del resumen del panel para un rango de días. El rango va por el
 * día en que ENTRÓ el pedido (`created_at`, en hora de Madrid), no por el
 * día de entrega; la única excepción es `ventaPorDia`, que va por entrega.
 * Único sitio con este SQL; hacia fuera, camelCase.
 *
 * Lo cobrado y lo pendiente van por separado a propósito: sumar un pedido
 * sin pagar a la recaudación es contar dinero que no ha entrado. Los
 * carritos abandonados (`iniciado`) se cuentan aparte y no suman en nada.
 */

export type Rango = {
  desde: string;
  hasta: string;
  /**
   * Solo para «Compra por día» y «Venta por día»: los destinos de una
   * oficina (pestañas «Todo · Alcobendas · Pozuelo», como en Pedidos). Sin
   * él, todos. El resto del resumen no se filtra.
   */
  destinos?: DestinoPedido[];
};

export type ProductoEnRanking = {
  slug: string | null;
  nombre: string;
  categoria: string | null;
  unidades: number;
  importeCents: number;
  /** En cuántos pedidos distintos aparece. */
  pedidos: number;
};

export type Resumen = {
  pedidos: {
    total: number;
    cobrados: number;
    sinPagar: number;
    abandonados: number;
  };
  /** Lo cobrado menos lo devuelto desde Stripe. */
  recaudacionCents: number;
  devoluciones: { pedidos: number; cents: number };
  pendienteCents: number;
  ticketMedioCents: number;
  porModalidad: { recogida: number; domicilio: number };
  porTienda: { storeId: string; pedidos: number }[];
  /** Desde qué aparato (migración 022); `sinDato` = pedidos de antes de apuntarlo. */
  porDispositivo: {
    movil: number;
    tablet: number;
    ordenador: number;
    sinDato: number;
  };
  /**
   * Toda la carta activa, de más a menos vendido; los que no venden, a cero.
   * Va por la ficha (slug), no por el nombre de la línea: el nombre se
   * guarda tal cual estaba al pedir y cambia cuando se renombra la carta.
   * Los tamaños de un producto suman en su fila; un pack es un producto
   * más. Lo que no casa con la carta activa (fichas desactivadas, pedidos
   * reconstruidos sin slug) va al final en «Fuera de carta», con `slug`
   * nulo, para que la suma cuadre con lo vendido.
   */
  ranking: ProductoEnRanking[];
  clientes: { total: number; nuevos: number };
  /** Por el día en que ENTRÓ el pedido: lo que se ha encargado cada día. */
  compraPorDia: PorDia[];
  /**
   * Por el día de ENTREGA, que es cuando se produce (mismo criterio que la
   * hoja de Producción). Aquí el rango se aplica a la fecha de entrega, no a
   * la de entrada: un encargo hecho el lunes para el sábado cuenta el sábado.
   */
  ventaPorDia: PorDia[];
};

export type PorDia = { dia: string; pedidos: number; importeCents: number };

// Mismo criterio de día que el filtro de `/admin/pedidos`: la fecha local
// de Madrid, no la UTC de la base de datos.
const DIA = "(p.created_at at time zone 'Europe/Madrid')::date";
const EN_RANGO = `${DIA} between $1::date and $2::date`;
/** Pedidos que cuentan como venta: cobrados y sin pagar; nunca los abandonados. */
const CON_IMPORTE = "p.estado in ('pagado', 'sin_pago')";

/**
 * El destino del pedido: la tienda de recogida o `domicilio`. Mismo criterio
 * que `DESTINO_SQL` de `pedidos.ts`, del que salen las pestañas de Pedidos.
 */
const DESTINO = `(case p.mode when 'domicilio' then 'domicilio'
                  when 'recogida' then p.store_id end)`;
const DE_DESTINOS = `($3::text[] is null or ${DESTINO} = any($3::text[]))`;

const n = (v: unknown): number => Number(v ?? 0);

export async function resumen({
  desde,
  hasta,
  destinos,
}: Rango): Promise<Resumen> {
  const args = [desde, hasta];
  const argsPorDia = [desde, hasta, destinos ?? null];

  const [
    totales,
    modalidad,
    tiendas,
    ranking,
    clientes,
    dias,
    aparatos,
    entregas,
  ] = await Promise.all([
    pool.query(
      `select count(*) filter (where ${CON_IMPORTE})              as total,
              count(*) filter (where p.estado = 'pagado')         as cobrados,
              count(*) filter (where p.estado = 'sin_pago')       as sin_pagar,
              count(*) filter (where p.estado = 'iniciado')       as abandonados,
              coalesce(sum(p.total_cents - p.devuelto_cents) filter (where p.estado = 'pagado'), 0) as recaudacion,
              count(*) filter (where p.estado = 'pagado' and p.devuelto_cents > 0) as devueltos,
              coalesce(sum(p.devuelto_cents) filter (where p.estado = 'pagado'), 0) as devuelto,
              coalesce(sum(p.total_cents) filter (where p.estado = 'sin_pago'), 0) as pendiente,
              coalesce(avg(p.total_cents) filter (where ${CON_IMPORTE}), 0)        as ticket_medio
         from pedidos p
        where ${EN_RANGO}`,
      args,
    ),
    pool.query(
      `select p.mode, count(*) as pedidos
         from pedidos p
        where ${EN_RANGO} and ${CON_IMPORTE} and p.mode is not null
        group by p.mode`,
      args,
    ),
    pool.query(
      `select p.store_id as "storeId", count(*) as pedidos
         from pedidos p
        where ${EN_RANGO} and ${CON_IMPORTE}
          and p.mode = 'recogida' and p.store_id is not null
        group by p.store_id
        order by pedidos desc, p.store_id`,
      args,
    ),
    pool.query(
      `with lineas as (
         select l.slug, l.qty, l.unit_price_cents, l.pedido_id
           from lineas_pedido l
           join pedidos p on p.id = l.pedido_id
          where ${EN_RANGO} and ${CON_IMPORTE}
       ),
       filas as (
         select pr.slug, pr.name as nombre, pr.category as categoria,
                coalesce(sum(l.qty), 0)                      as unidades,
                coalesce(sum(l.qty * l.unit_price_cents), 0) as importe,
                count(distinct l.pedido_id)                  as pedidos
           from productos pr
           left join lineas l on l.slug = pr.slug
          where pr.activo
          group by pr.id
         union all
         select null, 'Fuera de carta', null,
                sum(l.qty), sum(l.qty * l.unit_price_cents), count(distinct l.pedido_id)
           from lineas l
          where not exists (select 1 from productos pr where pr.activo and pr.slug = l.slug)
         having count(*) > 0
       )
       select * from filas
        order by (slug is null), unidades desc, importe desc, nombre`,
      args,
    ),
    pool.query(
      `select count(*) as total,
              count(*) filter (
                where ("createdAt" at time zone 'Europe/Madrid')::date
                      between $1::date and $2::date) as nuevos
         from "user"`,
      args,
    ),
    pool.query(
      `select to_char(${DIA}, 'YYYY-MM-DD') as dia,
              count(*)                        as pedidos,
              coalesce(sum(p.total_cents), 0) as importe
         from pedidos p
        where ${EN_RANGO} and ${CON_IMPORTE} and ${DE_DESTINOS}
        group by ${DIA}
        order by ${DIA}`,
      argsPorDia,
    ),
    pool.query(
      `select coalesce(p.dispositivo, 'sin_dato') as dispositivo, count(*) as pedidos
         from pedidos p
        where ${EN_RANGO} and ${CON_IMPORTE}
        group by 1`,
      args,
    ),
    // Venta por día: por fecha de entrega, que es cuando se produce.
    pool.query(
      `select to_char(p.fecha_entrega, 'YYYY-MM-DD') as dia,
              count(*)                        as pedidos,
              coalesce(sum(p.total_cents), 0) as importe
         from pedidos p
        where p.fecha_entrega between $1::date and $2::date and ${CON_IMPORTE}
          and ${DE_DESTINOS}
        group by p.fecha_entrega
        order by p.fecha_entrega`,
      argsPorDia,
    ),
  ]);
  const porDia = (
    filas: { dia: string; pedidos: unknown; importe: unknown }[],
  ): PorDia[] =>
    filas.map((r) => ({
      dia: r.dia,
      pedidos: n(r.pedidos),
      importeCents: n(r.importe),
    }));
  const aparato = Object.fromEntries(
    aparatos.rows.map((r) => [r.dispositivo, n(r.pedidos)]),
  );

  const t = totales.rows[0];
  const modo = Object.fromEntries(
    modalidad.rows.map((r) => [r.mode, n(r.pedidos)]),
  );

  return {
    pedidos: {
      total: n(t.total),
      cobrados: n(t.cobrados),
      sinPagar: n(t.sin_pagar),
      abandonados: n(t.abandonados),
    },
    recaudacionCents: n(t.recaudacion),
    devoluciones: { pedidos: n(t.devueltos), cents: n(t.devuelto) },
    pendienteCents: n(t.pendiente),
    ticketMedioCents: Math.round(n(t.ticket_medio)),
    porModalidad: { recogida: n(modo.recogida), domicilio: n(modo.domicilio) },
    porTienda: tiendas.rows.map((r) => ({
      storeId: r.storeId,
      pedidos: n(r.pedidos),
    })),
    porDispositivo: {
      movil: n(aparato.movil),
      tablet: n(aparato.tablet),
      ordenador: n(aparato.ordenador),
      sinDato: n(aparato.sin_dato),
    },
    ranking: ranking.rows.map((r) => ({
      slug: r.slug,
      nombre: r.nombre,
      categoria: r.categoria,
      unidades: n(r.unidades),
      importeCents: n(r.importe),
      pedidos: n(r.pedidos),
    })),
    clientes: {
      total: n(clientes.rows[0].total),
      nuevos: n(clientes.rows[0].nuevos),
    },
    compraPorDia: porDia(dias.rows),
    ventaPorDia: porDia(entregas.rows),
  };
}

/**
 * Pedidos de la web por día de entrada (18-11-2026), para la conversión de
 * la página de visitas: los que cuentan como venta y entraron por la web,
 * no por el TPV. Días sin pedidos no salen.
 */
export async function pedidosWebPorDia(
  desde: string,
  hasta: string,
  /** Solo los pedidos hechos desde este momento (ms): cuando empezó el contador de visitas. */
  desdeMs: number,
): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ dia: string; pedidos: string }>(
    `select ${DIA}::text as dia, count(*) as pedidos
       from pedidos p
      where ${EN_RANGO} and ${CON_IMPORTE} and p.origen = 'web'
        and p.created_at >= to_timestamp($3::double precision / 1000)
      group by 1`,
    [desde, hasta, desdeMs],
  );
  return new Map(rows.map((r) => [r.dia, n(r.pedidos)]));
}
