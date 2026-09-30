import { packs } from "~/data/packs";

/**
 * Invalidación de la caché de Vercel (ISR).
 *
 * Las páginas públicas que leen de la base de datos se cachean; cuando el
 * panel guarda un cambio, hay que decirle a Vercel que las vuelva a generar.
 * Se hace pidiendo la propia página con la cabecera `x-prerender-revalidate`
 * y el token que va configurado en `astro.config.mjs` como `bypassToken`.
 *
 * NADA de esto puede lanzar hacia arriba. Si la invalidación falla, el cambio
 * ya está guardado y lo que ocurre es que se ve unos minutos más tarde. Tirar
 * el guardado por eso sería cambiar un problema pequeño por uno grande.
 */

/**
 * El sitemap de contenido se arma leyendo las dos tablas y también va por
 * ISR, así que sin esto una ficha o una noticia nueva no llega a los
 * buscadores hasta el siguiente despliegue: entra en las dos listas.
 */
const SITEMAP = "/sitemap-contenido.xml";

/** Lo que hay que refrescar cuando cambia una noticia. */
export const RUTAS_NOTICIAS = ["/", "/noticias", SITEMAP];

/** Lo que hay que refrescar cuando cambia un producto. */
export const RUTAS_CATALOGO = [
  "/",
  "/catalogo",
  "/catalogo/dulce",
  "/catalogo/salado",
  "/catalogo/top-ventas",
  "/catalogo/packs",
  // La ficha de un pack enseña opciones y «comprado suelto» de OTROS
  // productos: una empanada agotada o un precio nuevo en la carta tiene que
  // llegar a ellas, no solo a la ficha del producto que se editó.
  ...packs.map((d) => `/catalogo/${d.slug}`),
  SITEMAP,
];

export async function invalidar(rutas: string[]): Promise<void> {
  const token = import.meta.env.VERCEL_BYPASS_TOKEN;
  const base = import.meta.env.PUBLIC_SITE_URL;

  if (!token || !base) {
    // En local no hay ISR: el aviso deja constancia sin ensuciar producción.
    console.warn(
      "[cache] sin VERCEL_BYPASS_TOKEN o PUBLIC_SITE_URL: no se invalida nada",
    );
    return;
  }

  await Promise.all(
    rutas.map(async (ruta) => {
      try {
        const respuesta = await fetch(new URL(ruta, base), {
          method: "HEAD",
          headers: { "x-prerender-revalidate": token },
        });
        // `fetch` solo rechaza si la petición no llega a hacerse: un token
        // que no coincide con el del despliegue devuelve 401 y una ruta mal
        // escrita 404, y las dos se resuelven como cualquier otra respuesta.
        // Sin mirar el estado, la invalidación podía llevar meses sin hacer
        // nada —el aviso de `astro.config.mjs` es exactamente ese— y lo
        // único visible sería que el panel «tarda» en verse. Ahora deja
        // rastro, que es lo máximo que puede hacer sin tirar el guardado.
        if (!respuesta.ok) {
          console.error(
            `[cache] Vercel rechazó la invalidación de ${ruta}: ${respuesta.status}. ` +
              "Comprueba que VERCEL_BYPASS_TOKEN es el mismo en la construcción y en ejecución.",
          );
        }
      } catch (err) {
        console.error(
          `[cache] no se pudo invalidar ${ruta}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );
}
