import type { APIRoute } from "astro";
import { contarPedidos } from "~/lib/db/pedidos";
import { destinosVisibles, vePedidos } from "~/lib/auth/guardia";
import { totalConCache } from "~/lib/aviso-pedidos";

export const prerender = false;

/**
 * Cuántos pedidos hay en la lista del panel (pagados y por cobrar, sin
 * filtros, de los que ve quien pregunta, archivados incluidos: archivar uno
 * no puede bajar la cuenta y tapar el siguiente nuevo). El panel lo pregunta cada 10 min y, si ha subido,
 * avisa de que han entrado pedidos nuevos (`PedidosNuevos.tsx`). Se cuenta
 * el total y no «creados desde»: un pago con tarjeta entra en la lista
 * cuando Stripe lo confirma, aunque el pedido se creara minutos antes.
 */
export const GET: APIRoute = async ({ locals }) => {
  if (!vePedidos(locals.usuario))
    return new Response("No encontrado", { status: 404 });
  try {
    // Del total guardado en Redis mientras no entre otro pedido: preguntar
    // cada pocos segundos a Postgres no le dejaba apagarse nunca (`aviso-pedidos.ts`).
    const soloDestinos = destinosVisibles(locals.usuario);
    const total = await totalConCache(soloDestinos?.join(",") ?? "todo", () =>
      contarPedidos({ soloDestinos, archivo: "todos" }),
    );
    return new Response(JSON.stringify({ total }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error(
      "[admin/pedidos/nuevos] no se pudo contar:",
      error instanceof Error ? error.message : error,
    );
    return new Response(JSON.stringify({ error: "No se pudo comprobar." }), {
      status: 500,
    });
  }
};
