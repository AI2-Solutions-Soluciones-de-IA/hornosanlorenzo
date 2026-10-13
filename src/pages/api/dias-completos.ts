import type { APIRoute } from "astro";
import { z } from "zod";
import { unidadesEncargadas } from "~/lib/db/capacidad";
import { diasSinHueco } from "~/lib/limites-pedido";
import { fromISO } from "~/lib/entrega";

// Lee los pedidos del momento: no puede prerenderizarse.
export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const esquema = z.object({
  desde: ISO,
  hasta: ISO,
  unidades: z.coerce.number().int().min(1).max(1000),
});

/** Más de tres meses no lo enseña el calendario de una vez. */
const MAX_DIAS = 93;

/**
 * Qué días del rango ya no tienen hueco para un pedido de `unidades`. Solo
 * dice qué días, no cuánto hay encargado: eso es del obrador, no del público.
 * El calendario lo usa para tacharlos; quien decide de verdad es `priceOrder`.
 */
export const GET: APIRoute = async ({ url }) => {
  const parsed = esquema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) return json({ error: "Petición mal formada." }, 400);
  const { desde, hasta, unidades } = parsed.data;
  const dias = (fromISO(hasta).getTime() - fromISO(desde).getTime()) / 86_400_000;
  if (!(dias >= 0 && dias <= MAX_DIAS)) return json({ error: "Rango no válido." }, 400);

  try {
    const encargadas = await unidadesEncargadas(desde, hasta);
    return json({ completos: diasSinHueco(desde, hasta, encargadas, unidades) });
  } catch (err) {
    console.error("[dias-completos]", err instanceof Error ? err.message : err);
    // Sin datos no se tacha nada: el servidor lo vuelve a mirar al pagar.
    return json({ completos: [] });
  }
};
