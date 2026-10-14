import { Pool, type PoolClient } from "pg";

/**
 * Único punto de conexión a Postgres. Nada más en el proyecto debe importar
 * `pg` directamente: cuando esto se mude a Cloud SQL, se cambia aquí y ya.
 *
 * `max: 3` porque cada función sin estado de Vercel abre su propio pool y el
 * proveedor tiene un límite de conexiones bajo en los planes pequeños.
 */
const connectionString =
  import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "Falta DATABASE_URL. Cópiala de .env.example y ponla en .env y en Vercel.",
  );
}

// `connectionTimeoutMillis`: sin esto, un `pool.connect()`/`pool.query()`
// que no puede conseguir hueco se queda esperando para siempre, no falla.
// Es defensa en profundidad: si algún día se reintroduce un interbloqueo
// (varias funciones reteniendo un cliente mientras esperan otro del mismo
// pool agotado — el bug que corrigió la tarea 14), el sitio no se cuelga en
// silencio, lanza un error a los diez segundos que sí queda en los logs.
export const pool = new Pool({
  connectionString,
  max: 3,
  connectionTimeoutMillis: 10_000,
});

// Una conexión libre que se cae (corte de red, Neon que la cierra por
// inactividad) emite «error» en el pool; sin oyente, Node lo trata como
// excepción no capturada y tumba el proceso entero (pasó el 13-10-2026 con
// `read EADDRNOTAVAIL`). El pool ya descarta esa conexión y abre otra
// cuando haga falta: basta con dejarlo en los logs.
pool.on("error", (err) => {
  console.error("[pool] conexión libre caída:", err.message);
});

/**
 * Quién ejecuta una consulta: el pool, o un cliente ya reservado dentro de
 * una transacción.
 *
 * Se exportan desde aquí porque la spec §5.3 dice que este es el ÚNICO
 * módulo que sabe qué driver hay debajo, y eso incluye los tipos: un
 * `import("pg").PoolClient` suelto en otro fichero desaparece al compilar,
 * pero mientras esté ahí es una pista de `pg` fuera de su sitio y una cosa
 * más que tocar el día de la mudanza a Cloud SQL.
 */
export type Ejecutor = Pool | PoolClient;

/**
 * Un cliente reservado del pool. A propósito NO es `Ejecutor`: quien pide
 * esto necesita que las consultas vayan todas por la MISMA conexión (un
 * `begin`/`commit` sirve de poco si cada consulta sale por una distinta),
 * así que no puede aceptar el pool.
 */
export type ClienteEnTransaccion = PoolClient;
