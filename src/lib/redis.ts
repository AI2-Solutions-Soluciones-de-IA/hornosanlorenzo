/**
 * Redis de Upstash por su API REST (18-11-2026), sin dependencias: lo usan
 * las visitas de la web. Nunca lanza: sin configurar, caído o lento (más
 * de 1,5 s), devuelve `null` y quien llama sigue como si nada. La web no
 * puede depender de esto.
 *
 * Variables: las de la integración de Vercel (`KV_REST_API_URL`,
 * `KV_REST_API_TOKEN`) o las de Upstash (`UPSTASH_REDIS_REST_URL`,
 * `UPSTASH_REDIS_REST_TOKEN`).
 */
const env = (k: string): string | undefined =>
  (import.meta.env?.[k] as string | undefined) ?? process.env[k];

function config(): { url: string; token: string } | null {
  const url = env("UPSTASH_REDIS_REST_URL") ?? env("KV_REST_API_URL");
  const token = env("UPSTASH_REDIS_REST_TOKEN") ?? env("KV_REST_API_TOKEN");
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

export const redisConfigurado = (): boolean => config() !== null;

/**
 * Varios comandos en una sola petición (`/pipeline`). Devuelve el
 * resultado de cada uno (o `null` en el que falle), o `null` entero si no
 * se pudo hablar con Redis.
 */
export async function pipeline(
  comandos: (string | number)[][],
  { timeoutMs = 1500 }: { timeoutMs?: number } = {},
): Promise<unknown[] | null> {
  const c = config();
  if (!c || comandos.length === 0) return null;
  try {
    const r = await fetch(`${c.url}/pipeline`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${c.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(comandos.map((cmd) => cmd.map(String))),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      console.warn(`[redis] respuesta ${r.status}`);
      return null;
    }
    const datos = (await r.json()) as { result?: unknown; error?: string }[];
    return datos.map((d) =>
      d && "error" in d && d.error ? null : (d?.result ?? null),
    );
  } catch (error) {
    // Nunca el token ni la URL: solo el motivo.
    console.warn(
      "[redis] sin respuesta:",
      error instanceof Error ? error.name : "error",
    );
    return null;
  }
}
