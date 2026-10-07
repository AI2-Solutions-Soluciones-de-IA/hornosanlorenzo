import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { z } from "zod";
import { suscribir } from "~/lib/db/suscriptores";
import { permitirSubida } from "~/lib/db/limites";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const esquema = z.object({
  email: z.string().trim().email().max(160),
  // Consentimiento expreso: sin la casilla no hay alta (RGPD).
  acepto: z.literal(true),
  // Trampa para bots: un campo oculto que una persona deja vacío.
  web: z.string().max(0).optional(),
});

/** Hash de la IP, igual que en `foto-pedido.ts`: no se guarda la IP en claro. */
function claveDeLimite(request: Request): string {
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "sin-ip";
  return "suscripcion:" + createHash("sha256").update(ip).digest("hex");
}

const HECHO = "¡Listo! Te avisaremos de las ofertas por correo.";

/**
 * Alta en las ofertas de Este mes. Responde lo mismo tanto si el correo es
 * nuevo como si ya estaba: así nadie puede averiguar quién está suscrito.
 */
export const POST: APIRoute = async ({ request }) => {
  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return json({ error: "Escribe tu correo." }, 400);
  }
  const datos = esquema.safeParse(bruto);
  if (!datos.success) {
    const sinCasilla = (bruto as { acepto?: unknown })?.acepto !== true;
    return json(
      { error: sinCasilla ? "Marca la casilla para poder enviarte las ofertas." : "Ese correo no parece válido." },
      400,
    );
  }

  try {
    if (!(await permitirSubida(claveDeLimite(request), { max: 10, ventanaMs: 60 * 60 * 1000 })))
      return json({ error: "Demasiados intentos seguidos. Prueba dentro de un rato." }, 429);
    await suscribir(datos.data.email);
    return json({ ok: true, mensaje: HECHO });
  } catch (error) {
    console.error("[suscripcion] no se pudo guardar:", error instanceof Error ? error.message : error);
    return json({ error: "No hemos podido apuntarte. Inténtalo de nuevo en un momento." }, 500);
  }
};
