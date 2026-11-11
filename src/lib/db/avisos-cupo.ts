import { pool } from "~/lib/db/pool";

/**
 * Reserva el aviso de cupo de un periodo. Devuelve true solo a quien lo
 * apunta primero: dos envíos que pasan el umbral a la vez no mandan dos
 * avisos (`on conflict do nothing`).
 */
export async function reservarAvisoCupo(clave: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `insert into avisos_cupo_correo (clave) values ($1) on conflict (clave) do nothing`,
    [clave],
  );
  return (rowCount ?? 0) > 0;
}
