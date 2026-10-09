import type { APIRoute } from "astro";
import { contarPedidos } from "~/lib/db/pedidos";
import { vePedidos } from "~/lib/auth/guardia";

export const prerender = false;

/**
 * Cuántos pedidos hay en la lista del panel (pagados y por cobrar, sin
 * filtros). La página de Pedidos lo pregunta cada minuto y, si ha subido,
 * avisa de que han entrado pedidos nuevos (`PedidosNuevos.tsx`). Se cuenta
 * el total y no «creados desde»: un pago con tarjeta entra en la lista
 * cuando Stripe lo confirma, aunque el pedido se creara minutos antes.
 */
export const GET: APIRoute = async ({ locals }) => {
  if (!vePedidos(locals.usuario)) return new Response("No encontrado", { status: 404 });
  try {
    return new Response(JSON.stringify({ total: await contarPedidos() }), {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  } catch (error) {
    console.error("[admin/pedidos/nuevos] no se pudo contar:", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ error: "No se pudo comprobar." }), { status: 500 });
  }
};
