import type { APIRoute } from "astro";
import { z } from "zod";
import { cambiarEstadoAMano } from "~/lib/db/pedidos";
import { vePedidos } from "~/lib/auth/guardia";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** 404, no 401 ni 403: mismo criterio que el resto del panel (spec §7). */
const noEncontrado = () => new Response("No encontrado", { status: 404 });

// Solo los dos estados que el panel puede poner a mano. `iniciado` no está
// a propósito: es el que pone el checkout camino de Stripe, y nadie tiene
// por qué fabricar un carrito abandonado desde aquí.
const esquema = z.object({
  id: z.string().uuid(),
  estado: z.enum(["pagado", "sin_pago"]),
});

/**
 * Cobrado en tienda (sin_pago → pagado) o deshacerlo. Si la base dice que
 * el pedido no admite ese cambio (es de Stripe, es un carrito abandonado o
 * no existe), 409: el panel recarga y enseña lo que hay de verdad.
 */
export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!vePedidos(locals.usuario)) return noEncontrado();

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return json({ error: "Petición mal formada." }, 400);
  }
  const parsed = esquema.safeParse(bruto);
  if (!parsed.success) return json({ error: "Faltan datos del pedido." }, 400);

  try {
    const cambiado = await cambiarEstadoAMano(parsed.data.id, parsed.data.estado);
    if (!cambiado) {
      return json(
        { error: "Ese pedido no se puede cambiar desde aquí. Recarga la página." },
        409,
      );
    }
    return json({ estado: parsed.data.estado });
  } catch (error) {
    console.error("[admin/pedidos] no se pudo cambiar el estado:", error);
    return json({ error: "No se pudo guardar el cambio." }, 500);
  }
};
