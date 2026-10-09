import type { APIRoute } from "astro";
import Stripe from "stripe";
import { vePedidos } from "~/lib/auth/guardia";
import { pool } from "~/lib/db/pool";

export const prerender = false;

/**
 * «Ver en Stripe» del panel de Pedidos (9-10-2026): lleva a la página del
 * pago en el panel de Stripe. El pedido solo guarda la sesión de pago
 * (`cs_…`), que la búsqueda de Stripe no encuentra; aquí se le pregunta a
 * Stripe por esa sesión y se redirige al pago (`pi_…`). Vale igual para los
 * pedidos antiguos que para los nuevos.
 */
export const GET: APIRoute = async ({ url, locals }) => {
  if (!vePedidos(locals.usuario)) return new Response("No encontrado", { status: 404 });

  const id = url.searchParams.get("pedido") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Falta el pedido.", { status: 400 });

  const secret = import.meta.env.STRIPE_SECRET_KEY;
  try {
    const { rows } = await pool.query<{ sesion: string | null }>(
      "select stripe_session_id as sesion from pedidos where id = $1",
      [id],
    );
    const sesion = rows[0]?.sesion;
    if (!sesion || !secret) return new Response("Este pedido no tiene pago en Stripe.", { status: 404 });

    const base = `https://dashboard.stripe.com/${sesion.startsWith("cs_test_") ? "test/" : ""}`;
    const s = await new Stripe(secret).checkout.sessions.retrieve(sesion);
    const pago = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
    // Sin pago (sesión sin cobrar): la lista de pagos, que es lo más cercano.
    return Response.redirect(pago ? `${base}payments/${pago}` : `${base}payments`, 302);
  } catch (error) {
    console.error("[admin/pedidos/stripe] no se pudo abrir el pago:", error instanceof Error ? error.message : error);
    return new Response("No se ha podido abrir el pago en Stripe. Inténtalo de nuevo.", { status: 502 });
  }
};
