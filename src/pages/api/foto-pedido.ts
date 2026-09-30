import type { APIRoute } from "astro";
import { createHash } from "node:crypto";
import { atenderSubida } from "~/lib/storage/fotos-pedido";
import { permitirSubida } from "~/lib/db/limites";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Clave del límite: hash de la IP, para no guardar IP en claro. Detrás del
 * proxy de Vercel `x-forwarded-for` trae varios saltos; la del cliente es la
 * primera.
 */
function claveDeLimite(request: Request): string {
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "sin-ip";
  return createHash("sha256").update(ip).digest("hex");
}

/**
 * Da al navegador un token para subir la foto del cliente directo a Vercel
 * Blob. Es público (el cliente aún no ha pagado ni tiene cuenta), así que el
 * límite por IP y las restricciones del token (carpeta, tipos, tamaño) son la
 * defensa.
 */
export const POST: APIRoute = async ({ request }) => {
  let body: { type?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "No hemos podido preparar la subida de la foto." }, 400);
  }

  // `handleUpload` recibe dos eventos: pedir token y aviso de subida
  // completada (este último lo manda Vercel, firmado, y no es del cliente).
  // Solo el primero gasta cupo.
  if (body?.type === "blob.generate-client-token") {
    if (
      !(await permitirSubida(claveDeLimite(request), {
        max: 20,
        ventanaMs: 60 * 60 * 1000,
      }))
    ) {
      return json(
        {
          error:
            "Has subido muchas fotos seguidas. Espera un rato o llámanos.",
        },
        429,
      );
    }
  }

  try {
    return json(await atenderSubida(request, body));
  } catch (error) {
    // El detalle va al log, no al navegador.
    console.error("foto-pedido: no se pudo atender la subida", error);
    return json({ error: "No hemos podido preparar la subida de la foto." }, 400);
  }
};
