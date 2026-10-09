import { pool } from "~/lib/db/pool";

/**
 * Cifras del resumen del panel para un rango de días. El rango va por el
 * día en que ENTRÓ el pedido (`created_at`, en hora de Madrid), no por el
 * día de entrega. Único sitio con este SQL; hacia fuera, camelCase.
 *
 * Lo cobrado y lo pendiente van por separado a propósito: sumar un pedido
 * sin pagar a la recaudación es contar dinero que no ha entrado. Los
 * carritos abandonados (`iniciado`) se cuentan aparte y no suman en nada.
 */

export type Rango = { desde: string; hasta: string };

export type Resumen = {
  pedidos: { total: number; cobrados: number; sinPagar: number; abandonados: number };
  recaudacionCents: number;
  pendienteCents: number;
  ticketMedioCents: number;
  porModalidad: { recogida: number; domicilio: number };
  porTienda: { storeId: string; pedidos: number }[];
  /** Desde qué aparato (migración 022); `sinDato` = pedidos de antes de apuntarlo. */
  porDispositivo: { movil: number; tablet: number; ordenador: number; sinDato: number };
  topProductos: { nombre: string; unidades: number; importeCents: number }[];
  clientes: { total: number; nuevos: number };
  porDia: { dia: string; pedidos: number; importeCents: number }[];
};

// Mismo criterio de día que el filtro de `/admin/pedidos`: la fecha local
// de Madrid, no la UTC de la base de datos.
const DIA = "(p.created_at at time zone 'Europe/Madrid')::date";
const EN_RANGO = `${DIA} between $1::date and $2::date`;
/** Pedidos que cuentan como venta: cobrados y sin pagar; nunca los abandonados. */
const CON_IMPORTE = "p.estado in ('pagado', 'sin_pago')";

const n = (v: unknown): number => Number(v ?? 0);

export async function resumen({ desde, hasta }: Rango): Promise<Resumen> {
  const args = [desde, hasta];

  const [totales, modalidad, tiendas, top, clientes, dias, aparatos] = await Promise.all([
    pool.query(
      `select count(*) filter (where ${CON_IMPORTE})              as total,
              count(*) filter (where p.estado = 'pagado')         as cobrados,
              count(*) filter (where p.estado = 'sin_pago')       as sin_pagar,
              count(*) filter (where p.estado = 'iniciado')       as abandonados,
              coalesce(sum(p.total_cents) filter (where p.estado = 'pagado'), 0)   as recaudacion,
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
      `select l.nombre,
              sum(l.qty)                      as unidades,
              sum(l.qty * l.unit_price_cents) as importe
         from lineas_pedido l
         join pedidos p on p.id = l.pedido_id
        where ${EN_RANGO} and ${CON_IMPORTE}
        group by l.nombre
        order by unidades desc, importe desc, l.nombre
        limit 5`,
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
        where ${EN_RANGO} and ${CON_IMPORTE}
        group by ${DIA}
        order by ${DIA}`,
      args,
    ),
    pool.query(
      `select coalesce(p.dispositivo, 'sin_dato') as dispositivo, count(*) as pedidos
         from pedidos p
        where ${EN_RANGO} and ${CON_IMPORTE}
        group by 1`,
      args,
    ),
  ]);
  const aparato = Object.fromEntries(aparatos.rows.map((r) => [r.dispositivo, n(r.pedidos)]));

  const t = totales.rows[0];
  const modo = Object.fromEntries(modalidad.rows.map((r) => [r.mode, n(r.pedidos)]));

  return {
    pedidos: {
      total: n(t.total),
      cobrados: n(t.cobrados),
      sinPagar: n(t.sin_pagar),
      abandonados: n(t.abandonados),
    },
    recaudacionCents: n(t.recaudacion),
    pendienteCents: n(t.pendiente),
    ticketMedioCents: Math.round(n(t.ticket_medio)),
    porModalidad: { recogida: n(modo.recogida), domicilio: n(modo.domicilio) },
    porTienda: tiendas.rows.map((r) => ({ storeId: r.storeId, pedidos: n(r.pedidos) })),
    porDispositivo: {
      movil: n(aparato.movil),
      tablet: n(aparato.tablet),
      ordenador: n(aparato.ordenador),
      sinDato: n(aparato.sin_dato),
    },
    topProductos: top.rows.map((r) => ({
      nombre: r.nombre,
      unidades: n(r.unidades),
      importeCents: n(r.importe),
    })),
    clientes: { total: n(clientes.rows[0].total), nuevos: n(clientes.rows[0].nuevos) },
    porDia: dias.rows.map((r) => ({ dia: r.dia, pedidos: n(r.pedidos), importeCents: n(r.importe) })),
  };
}
