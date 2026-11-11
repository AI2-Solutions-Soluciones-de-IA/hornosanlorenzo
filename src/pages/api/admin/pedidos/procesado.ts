import type { APIRoute } from "astro";
import { z } from "zod";
import { marcarProcesado } from "~/lib/db/pedidos";
import { destinosVisibles, vePedidos } from "~/lib/auth/guardia";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const esquema = z.object({
  id: z.string().uuid(),
  procesado: z.boolean(),
});

/**
 * Casilla «Procesado» del panel de pedidos (11-11-2026). La puede tocar
 * quien ve los pedidos; la oficina de una tienda, solo en los suyos. 404 a
 * quien no ve pedidos, como el resto del panel.
 */
export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!vePedidos(locals.usuario)) return new Response("No encontrado", { status: 404 });

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return json({ error: "Petición mal formada." }, 400);
  }
  const parsed = esquema.safeParse(bruto);
  if (!parsed.success) return json({ error: "Faltan datos del pedido." }, 400);

  const quien = locals.usuario?.name?.trim() || locals.usuario?.email || "Panel";
  try {
    const r = await marcarProcesado(
      parsed.data.id,
      parsed.data.procesado,
      quien,
      destinosVisibles(locals.usuario),
    );
    if (!r) {
      return json({ error: "Ese pedido no se puede marcar desde aquí. Recarga la página." }, 409);
    }
    return json(r);
  } catch (error) {
    console.error("[admin/pedidos] no se pudo marcar como procesado:", error);
    return json({ error: "No se pudo guardar el cambio." }, 500);
  }
};
