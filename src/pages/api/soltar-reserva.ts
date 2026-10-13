import type { APIRoute } from "astro";
import Stripe from "stripe";
import { z } from "zod";
import { soltarReserva } from "~/lib/db/capacidad";

export const prerender = false;

const esquema = z.object({ pedidoId: z.string().uuid() });

/**
 * El cliente ha vuelto al carrito desde la página de pago (`cancel_url`): su
 * hueco en el día queda libre ya, sin esperar a que venza la reserva, y su
 * página de pago se cierra para que no pague sin hueco. El id es un uuid que
 * solo conoce quien inició ese pago. Responde 204 pase lo que pase: no dice
 * si el pedido existía.
 */
export const POST: APIRoute = async ({ request }) => {
  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const parsed = esquema.safeParse(bruto);
  if (!parsed.success) return new Response(null, { status: 400 });

  try {
    const sesion = await soltarReserva(parsed.data.pedidoId);
    const secret = import.meta.env.STRIPE_SECRET_KEY;
    if (sesion && secret)
      await new Stripe(secret).checkout.sessions.expire(sesion).catch(() => {});
  } catch (err) {
    console.error("[soltar-reserva]", err instanceof Error ? err.message : err);
  }
  return new Response(null, { status: 204 });
};
