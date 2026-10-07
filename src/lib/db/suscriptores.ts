import { randomBytes } from "node:crypto";
import { pool } from "~/lib/db/pool";
import { patronBusqueda } from "~/lib/db/busqueda";

/**
 * Suscriptores a las ofertas de «Este mes» (migración 017). Único sitio con
 * SQL de la tabla; hacia fuera, camelCase.
 */

export type Suscriptor = {
  email: string;
  creadoEn: Date;
  /** Tiene también cuenta en la web (mismo correo). */
  esCliente: boolean;
};

/**
 * Alta, o vuelta de quien se dio de baja. Si ya estaba suscrito no cambia
 * nada (ni el token, que puede estar en correos ya enviados). No dice si era
 * nuevo: el formulario contesta lo mismo en los dos casos, para que nadie
 * pueda averiguar quién está apuntado.
 */
export async function suscribir(email: string): Promise<void> {
  await pool.query(
    `insert into suscriptores (email, token)
     values ($1, $2)
     on conflict (lower(email)) do update set baja_en = null`,
    [email.trim().toLowerCase(), randomBytes(24).toString("hex")],
  );
}

/** Baja por el token del enlace. `true` si había una suscripción activa. */
export async function darDeBaja(token: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "update suscriptores set baja_en = now() where token = $1 and baja_en is null",
    [token],
  );
  return (rowCount ?? 0) > 0;
}

/** A quién se manda un envío: los activos, con su token de baja. */
export async function suscriptoresActivos(): Promise<{ email: string; token: string }[]> {
  const { rows } = await pool.query<{ email: string; token: string }>(
    "select email, token from suscriptores where baja_en is null order by creado_en",
  );
  return rows;
}

const WHERE = `where s.baja_en is null and ($1::text is null or s.email ilike $1)`;

/** Para el panel (Clientes → Suscritos a ofertas): los activos, del más nuevo. */
export async function listarSuscriptores(
  limite = 25,
  texto?: string,
  desplazamiento = 0,
): Promise<Suscriptor[]> {
  const { rows } = await pool.query<Suscriptor>(
    `select s.email,
            s.creado_en as "creadoEn",
            exists (select 1 from "user" u where lower(u.email) = lower(s.email)) as "esCliente"
       from suscriptores s
     ${WHERE}
      order by s.creado_en desc, s.id
      limit $2 offset $3`,
    [patronBusqueda(texto).patron, limite, desplazamiento],
  );
  return rows;
}

export async function contarSuscriptores(texto?: string): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `select count(*) as total from suscriptores s ${WHERE}`,
    [patronBusqueda(texto).patron],
  );
  return Number(rows[0]?.total ?? 0);
}
