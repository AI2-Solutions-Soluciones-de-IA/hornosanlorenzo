import { listarProductos, type Producto } from "~/lib/db/productos";
import { listarNoticias, type Noticia } from "~/lib/db/noticias";
import { seccionesPublicas, type SeccionPublica } from "~/lib/db/seccionesEsteMes";
import { todasLasDefiniciones } from "~/lib/db/packs";
import type { DefinicionPack } from "~/data/packs";

/**
 * Lecturas públicas que se degradan sin quedarse cacheadas.
 *
 * Las páginas públicas leen de Postgres y, si falla, enseñan la sección
 * vacía en vez de un 500: eso es deliberado y no cambia. Lo que sí cambia es
 * que esa respuesta degradada ya no se puede GUARDAR. Van todas por ISR, y
 * una entrada de ISR solo se refresca al invalidar, al desplegar o al
 * cumplirse su `expiration` (diez minutos, desde `astro.config.mjs`). Sin
 * `no-store`, un parpadeo de Neon de diez segundos en el momento en que
 * alguien pide la página por primera vez deja la tienda vacía para todo el
 * mundo, con un 200 que no dispara ninguna alarma y un `console.error` entre
 * muchos. Con `no-store` esa respuesta se sirve una vez y no se almacena: el
 * siguiente visitante vuelve a ejecutar la función y ve la carta entera.
 *
 * POR QUÉ VIVE AQUÍ Y NO DENTRO DE `CatalogoGrid.astro`: `Astro.response` es
 * el mismo objeto para la página y para todos sus componentes, pero
 * `renderPage` copia sus cabeceras (`new Headers(init.headers)`) en cuanto
 * el frontmatter de la PÁGINA termina y el render empieza a emitir en
 * streaming. El frontmatter de un componente hijo corre DESPUÉS de esa
 * copia, así que una cabecera puesta desde ahí no llega a la respuesta. Por
 * eso la lectura sube a la página y el componente recibe ya los productos.
 */

/** La cabecera que impide que una respuesta degradada entre en la caché. */
export const SIN_CACHE = { "cache-control": "no-store" } as const;

/**
 * `Astro.response` no es un `Response`: es el objeto de Astro con `status` y
 * `headers`. Solo se necesita lo segundo, así que se pide lo mínimo.
 */
type ConCabeceras = { headers: Headers };

function degrada(respuesta: ConCabeceras, mensaje: string, error: unknown) {
  console.error(mensaje, error instanceof Error ? error.message : error);
  respuesta.headers.set("cache-control", "no-store");
}

/** El catálogo activo, en el orden de la carta, o vacío y sin cachear. */
export async function catalogoPublico(
  respuesta: ConCabeceras,
): Promise<Producto[]> {
  try {
    return await listarProductos({ soloActivos: true, conOfertas: true });
  } catch (error) {
    degrada(respuesta, "No se pudo cargar el catálogo:", error);
    return [];
  }
}

/** Las noticias publicadas, de la más reciente, o vacío y sin cachear. */
export async function noticiasPublicas(
  respuesta: ConCabeceras,
): Promise<Noticia[]> {
  try {
    return await listarNoticias({ soloPublicadas: true });
  } catch (error) {
    degrada(respuesta, "No se pudieron cargar las noticias:", error);
    return [];
  }
}

/**
 * Las definiciones de los packs (lo que lleva cada uno), por slug, o vacío y
 * sin cachear. Con el mapa vacío, un pack no tiene definición y las páginas
 * lo tratan como hoy: la tarjeta no se pinta y la ficha sale «No disponible».
 */
export async function definicionesPublicas(
  respuesta: ConCabeceras,
): Promise<Map<string, DefinicionPack>> {
  try {
    return await todasLasDefiniciones();
  } catch (error) {
    degrada(respuesta, "No se pudieron cargar los packs:", error);
    return new Map();
  }
}

/** Las secciones publicadas de Este mes, o ninguna y sin cachear. */
export async function seccionesEsteMesPublicas(
  respuesta: ConCabeceras,
): Promise<SeccionPublica[]> {
  try {
    return await seccionesPublicas();
  } catch (error) {
    degrada(respuesta, "No se pudieron cargar las secciones de Este mes:", error);
    return [];
  }
}
