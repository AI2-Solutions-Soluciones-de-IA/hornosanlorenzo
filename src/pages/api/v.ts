// src/pages/api/v.ts
// Visitas de la web (18-11-2026): cada página manda aquí un aviso
// (`navigator.sendBeacon`) y se suman los contadores del día en Redis.
// Responde 204 siempre, haya ido bien o mal: el navegador no espera nada y
// la web no puede depender de esto. No toca Neon (el middleware tampoco
// busca la sesión para esta ruta).
import type { APIRoute } from "astro";
import { createHmac } from "node:crypto";
import { dispositivoDe } from "~/lib/dispositivo";
import { pipeline } from "~/lib/redis";
import {
  comandosDeVisita,
  diaEnMadrid,
  esRobot,
  origenDe,
  rutaNormalizada,
} from "~/lib/visitas";

export const prerender = false;

const nada = () =>
  new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

/**
 * El visitante del día, sin guardar quién es: HMAC de IP + navegador con
 * una sal que cambia cada día. Mañana la misma persona da otro valor.
 */
function visitante(dia: string, ip: string, ua: string): string {
  const secreto =
    (import.meta.env.VISITAS_SAL as string | undefined) ??
    process.env.VISITAS_SAL ??
    (import.meta.env.BETTER_AUTH_SECRET as string | undefined) ??
    process.env.BETTER_AUTH_SECRET ??
    "hsl";
  return createHmac("sha256", `${secreto}:${dia}`)
    .update(`${ip}|${ua}`)
    .digest("hex")
    .slice(0, 16);
}

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const ua = request.headers.get("user-agent") ?? "";
    if (esRobot(ua)) return nada();
    // `sendBeacon` lo manda como texto; se lee a mano y con tope.
    const texto = (await request.text()).slice(0, 2000);
    const datos = JSON.parse(texto) as Record<string, unknown>;
    const ruta = rutaNormalizada(datos.p);
    if (!ruta) return nada();

    const ahora = new Date();
    const dia = diaEnMadrid(ahora);
    const ip =
      request.headers.get("x-real-ip") ??
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "";
    // Primera página de esta pestaña y llegada de fuera: es una visita nueva.
    const origen =
      datos.n === 1 ? origenDe(datos.r, datos.u, url.hostname) : null;
    const nueva = origen
      ? {
          origen,
          dispositivo: dispositivoDe(ua, datos.t === 1 ? "tablet" : null),
        }
      : null;

    await pipeline(
      comandosDeVisita({
        dia,
        ruta,
        visitante: visitante(dia, ip, ua),
        ahoraMs: ahora.getTime(),
        nueva,
      }),
    );
  } catch {
    // Un aviso mal formado no merece ni una línea en el registro.
  }
  return nada();
};
