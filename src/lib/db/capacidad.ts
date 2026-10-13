import type { Pool, PoolClient } from "pg";
import { pool } from "~/lib/db/pool";
import { maxUnidadesDelDia } from "~/lib/limites-pedido";

/**
 * Capacidad del obrador por día de entrega (`~/lib/limites-pedido`). Ocupan
 * hueco:
 *  - los pedidos que se hornean —cobrados y anotados sin pago—, menos los
 *    devueltos del todo, igual que en la hoja de producción;
 *  - los que se están pagando ahora mismo, hasta `reserva_hasta`.
 * Un `iniciado` sin reserva vigente es un carrito abandonado y no ocupa nada.
 *
 * Un pack cuenta sus piezas por cada pack (`detalle`, igual que la hoja de
 * producción), no como una unidad.
 */
const OCUPA = `(
  (p.estado in ('pagado', 'sin_pago') and p.devuelto_cents < p.total_cents)
  or (p.estado = 'iniciado' and p.reserva_hasta > now())
)`;

/** Unidades de una línea: las suyas o, en un pack, sus piezas por pack. */
const UNIDADES_LINEA = `l.qty * coalesce(
  (select sum((d->>'qty')::int) from jsonb_array_elements(l.detalle) d), 1)`;

/** Unidades ocupadas por día. Solo salen los días que tienen algo. */
export async function unidadesEncargadas(
  desde: string,
  hasta: string = desde,
  db: Pool | PoolClient = pool,
): Promise<Map<string, number>> {
  const { rows } = await db.query<{ dia: string; unidades: string }>(
    `select to_char(p.fecha_entrega, 'YYYY-MM-DD') as dia,
            sum(${UNIDADES_LINEA})                  as unidades
       from pedidos p
       join lineas_pedido l on l.pedido_id = p.id
      where p.fecha_entrega between $1::date and $2::date
        and ${OCUPA}
      group by p.fecha_entrega`,
    [desde, hasta],
  );
  return new Map(rows.map((r) => [r.dia, Number(r.unidades)]));
}

/**
 * Bloquea el día hasta el final de la transacción de `db`: comprobar el hueco
 * y anotar el pedido pasan de uno en uno, y dos «Pagar» en el mismo segundo
 * no pueden ver los dos el mismo hueco libre.
 */
export async function bloquearDia(db: PoolClient, dateISO: string): Promise<void> {
  await db.query("select pg_advisory_xact_lock(hashtext('capacidad:' || $1))", [
    dateISO,
  ]);
}

/**
 * Páginas de pago que hay que cerrar en ese día: las de reservas ya vencidas
 * cuya página sigue abierta (Stripe la mantiene 30 minutos). Solo si, de
 * pagarse todas, el día se pasaría: si sobra sitio, quien tarda puede pagar.
 */
export async function sesionesQueCerrar(dateISO: string): Promise<string[]> {
  const { rows } = await pool.query<{ sesion: string; unidades: string }>(
    `select p.stripe_session_id as sesion, sum(${UNIDADES_LINEA}) as unidades
       from pedidos p
       join lineas_pedido l on l.pedido_id = p.id
      where p.fecha_entrega = $1::date
        and p.estado = 'iniciado'
        and p.stripe_session_id is not null
        and p.reserva_hasta <= now()
        and p.created_at > now() - interval '35 minutes'
      group by p.id`,
    [dateISO],
  );
  if (rows.length === 0) return [];
  const vencidas = rows.reduce((n, r) => n + Number(r.unidades), 0);
  const ocupadas = (await unidadesEncargadas(dateISO)).get(dateISO) ?? 0;
  return ocupadas + vencidas > maxUnidadesDelDia(dateISO) ? rows.map((r) => r.sesion) : [];
}

/**
 * El cliente ha vuelto al carrito desde Stripe: su hueco queda libre ya.
 * Devuelve la sesión de pago para cerrarla, o null si no había nada que
 * soltar (ya pagado, ya soltado o un id que no es de nadie).
 */
export async function soltarReserva(pedidoId: string): Promise<string | null> {
  const { rows } = await pool.query<{ sesion: string | null }>(
    `update pedidos set reserva_hasta = null
      where id = $1 and estado = 'iniciado' and reserva_hasta is not null
      returning stripe_session_id as sesion`,
    [pedidoId],
  );
  return rows[0]?.sesion ?? null;
}
