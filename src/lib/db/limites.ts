import { pool } from "~/lib/db/pool";

/**
 * Límite de subidas de fotos por clave (un hash de la IP, no la IP). Una
 * única sentencia: si se leyera el contador y luego se escribiera, dos
 * peticiones simultáneas verían el mismo valor y se colarían las dos. Con
 * `on conflict` la fila se bloquea y cada petición suma sobre la anterior.
 *
 * Ventana fija: si la fila es anterior a `ahora - ventanaMs`, empieza otra.
 */
export async function permitirSubida(
  clave: string,
  { max, ventanaMs }: { max: number; ventanaMs: number },
  ahora: Date = new Date(),
): Promise<boolean> {
  const { rows } = await pool.query<{ cuenta: number }>(
    `insert into limite_subidas as l (clave, ventana, cuenta)
     values ($1, $2, 1)
     on conflict (clave) do update
        set ventana = case when l.ventana < $3 then $2 else l.ventana end,
            cuenta  = case when l.ventana < $3 then 1 else l.cuenta + 1 end
     returning cuenta`,
    [clave, ahora, new Date(ahora.getTime() - ventanaMs)],
  );
  return rows[0].cuenta <= max;
}
