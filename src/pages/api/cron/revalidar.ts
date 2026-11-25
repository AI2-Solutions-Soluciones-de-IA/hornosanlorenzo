import type { APIRoute } from "astro";
import { RUTAS_CATALOGO, RUTAS_NOTICIAS, invalidar } from "~/lib/cache";
import { listarNoticias } from "~/lib/db/noticias";
import { listarProductos } from "~/lib/db/productos";

export const prerender = false;

/**
 * Regenera cada noche todas las páginas públicas (25-11-2026). Lo llama el
 * cron de Vercel (`vercel.json`) a las 00:05 de Madrid en invierno (01:05 en
 * verano).
 *
 * Las páginas caducan al día (`astro.config.mjs`), y una oferta que acaba
 * por fecha (`oferta_hasta`) no avisa a nadie al acabar: sin esto seguiría
 * viéndose hasta un día más. Todo de una vez, de noche: Neon se enciende una
 * sola vez en vez de una por ficha caducada.
 *
 * Solo con el secreto del cron (`CRON_SECRET`, que Vercel manda en la
 * cabecera). Sin el secreto configurado, no hace nada: falla cerrado.
 */
const DE_UNA_VEZ = 8;

export const GET: APIRoute = async ({ request }) => {
  const secreto = import.meta.env.CRON_SECRET ?? process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`)
    return new Response("No encontrado", { status: 404 });

  let fichas: string[] = [];
  try {
    const [productos, noticias] = await Promise.all([
      listarProductos({ soloActivos: true }),
      listarNoticias({ soloPublicadas: true }),
    ]);
    fichas = [
      ...productos.map((p) => `/catalogo/${p.slug}`),
      ...noticias.map((n) => `/noticias/${n.slug}`),
    ];
  } catch (error) {
    // Sin la lista, al menos el catálogo y la portada.
    console.error(
      "[cron/revalidar] no se pudieron leer las fichas:",
      error instanceof Error ? error.message : error,
    );
  }

  const rutas = [...new Set([...RUTAS_CATALOGO, ...RUTAS_NOTICIAS, ...fichas])];
  // Por tandas: cada ruta es una regeneración con su consulta, y todas a la
  // vez agotarían las conexiones a Postgres.
  for (let i = 0; i < rutas.length; i += DE_UNA_VEZ)
    await invalidar(rutas.slice(i, i + DE_UNA_VEZ));

  console.info(`[cron/revalidar] ${rutas.length} páginas regeneradas`);
  return new Response(JSON.stringify({ rutas: rutas.length }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
