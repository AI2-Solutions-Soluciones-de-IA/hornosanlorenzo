import { pool } from "~/lib/db/pool";

/**
 * Unidades ya encargadas por día de entrega, para la capacidad del obrador
 * (`~/lib/limites-pedido`). Cuentan los mismos pedidos que la hoja de
 * producción —cobrados y anotados sin pago—, menos los devueltos del todo:
 * esos ya no se hornean. Un `iniciado` es un carrito a medio pagar o
 * abandonado y no ocupa hueco.
 *
 * Un pack cuenta como una unidad (su línea), no como sus piezas.
 * Devuelve solo los días que tienen algo; el resto, 0.
 */
export async function unidadesEncargadas(
  desde: string,
  hasta: string = desde,
): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ dia: string; unidades: string }>(
    `select to_char(p.fecha_entrega, 'YYYY-MM-DD') as dia,
            sum(l.qty)                              as unidades
       from pedidos p
       join lineas_pedido l on l.pedido_id = p.id
      where p.fecha_entrega between $1::date and $2::date
        and p.estado in ('pagado', 'sin_pago')
        and p.devuelto_cents < p.total_cents
      group by p.fecha_entrega`,
    [desde, hasta],
  );
  return new Map(rows.map((r) => [r.dia, Number(r.unidades)]));
}
