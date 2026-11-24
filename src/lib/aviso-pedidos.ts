import { pipeline } from "~/lib/redis";

/**
 * El aviso de «pedidos nuevos» del panel sin despertar Postgres (24-11-2026).
 *
 * El panel preguntaba cada 20 s (ahora cada 10 min) cuántos pedidos hay. Cada pregunta eran dos
 * consultas a Neon (la sesión y el recuento), y con una pestaña del panel
 * abierta en una oficina la base de datos no llegaba nunca a apagarse: a
 * día 24 se había gastado el 80 % de las horas de cómputo del mes.
 *
 * Ahora las dos cosas se guardan en Redis:
 *  - la sesión ya comprobada, por la huella de la cookie (nunca la cookie);
 *  - el total, junto a la versión de la lista. La versión sube cada vez que
 *    entra un pedido (`avisaCambioPedidos`), y un total guardado con otra
 *    versión no vale: se vuelve a contar en Postgres.
 *
 * Si Redis no responde, todo va a Postgres como antes: el aviso no puede
 * dejar de funcionar por esto.
 */

const PREFIJO = "hsl:panel";
export const CLAVE_VERSION = `${PREFIJO}:pedidos:version`;
const CLAVE_TOTALES = `${PREFIJO}:pedidos:totales`;
/**
 * Red de seguridad por si algo cambia la lista sin avisar (un script a
 * mano): como mucho, unas horas con el total viejo.
 */
const TOTALES_SEGUNDOS = 6 * 3600;
/**
 * Lo que dura la sesión guardada: una jornada. Cerrar sesión la borra
 * (middleware); si se revoca de otra forma (cambio de contraseña), esta
 * consulta, que solo da un número, la sigue aceptando hasta entonces.
 */
export const SESION_SEGUNDOS = 8 * 3600;

/** La ruta que pregunta el panel; la única que usa la sesión guardada. */
export const RUTA_AVISO = "/api/admin/pedidos/nuevos";

/** El valor de la cookie de sesión de Better Auth, o null si no la hay. */
export function cookieDeSesion(
  cabecera: string | null | undefined,
): string | null {
  const m = /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/.exec(
    cabecera ?? "",
  );
  return m?.[1] || null;
}

/** Clave de Redis para la sesión de esa cookie: su huella SHA-256. */
export async function claveDeSesion(cookie: string): Promise<string> {
  const huella = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(cookie),
  );
  const hex = [...new Uint8Array(huella)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${PREFIJO}:ses:${hex}`;
}

export async function sesionGuardada<U>(clave: string): Promise<U | null> {
  const r = await pipeline([["GET", clave]]);
  const v = r?.[0];
  if (typeof v !== "string") return null;
  try {
    return JSON.parse(v) as U;
  } catch {
    return null;
  }
}

export async function guardaSesion(
  clave: string,
  usuario: unknown,
): Promise<void> {
  await pipeline([
    ["SET", clave, JSON.stringify(usuario), "EX", SESION_SEGUNDOS],
  ]);
}

export async function olvidaSesion(clave: string): Promise<void> {
  await pipeline([["DEL", clave]]);
}

/**
 * Llamar DESPUÉS de guardar en Postgres cualquier cambio que meta un pedido
 * en la lista del panel (o lo saque). Si se llamara antes, alguien podría
 * contar entre medias y guardar el total viejo con la versión nueva.
 */
export async function avisaCambioPedidos(): Promise<void> {
  await pipeline([["INCR", CLAVE_VERSION]]);
}

/**
 * El total de la lista para esos destinos (`grupo`): el guardado si es de la
 * versión actual; si no, `cuenta()` en Postgres, y se guarda.
 */
export async function totalConCache(
  grupo: string,
  cuenta: () => Promise<number>,
): Promise<number> {
  const r = await pipeline([
    ["GET", CLAVE_VERSION],
    ["HGET", CLAVE_TOTALES, grupo],
  ]);
  if (!r) return cuenta();
  const version = String(r[0] ?? "0");
  const guardado = typeof r[1] === "string" ? r[1] : "";
  const [v, total] = guardado.split("|");
  if (v === version && total !== undefined && /^\d+$/.test(total))
    return Number(total);

  // Con la versión leída ANTES de contar: si entra un pedido mientras tanto,
  // la versión sube y este total ya no valdrá en la siguiente pregunta.
  const n = await cuenta();
  await pipeline([
    ["HSET", CLAVE_TOTALES, grupo, `${version}|${n}`],
    ["EXPIRE", CLAVE_TOTALES, TOTALES_SEGUNDOS],
  ]);
  return n;
}
