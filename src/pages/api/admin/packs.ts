import type { APIRoute } from "astro";
import {
  actualizarPack,
  crearPack,
  rutasDePacks,
  todasLasDefiniciones,
  type DatosPack,
} from "~/lib/db/packs";
import { listarProductos, type Producto } from "~/lib/db/productos";
import { invalidar, rutasTrasGuardarProducto } from "~/lib/cache";
import { esAdmin } from "~/lib/auth/guardia";
import { slugify } from "~/lib/slug";
import { comprobarPack, esquemaPack, problemasDeEsquema, type Problema } from "~/lib/pack-validacion";
import { ahorroPct, precioSueltoCents, type DefinicionPack } from "~/data/packs";
import type {
  PackAdmin,
  ProductoCarta,
  RespuestaGetPacks,
} from "~/lib/admin-packs-api";

/** Contrato (métodos, forma de las respuestas y dónde va el slug): `~/lib/admin-packs-api`. */
export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const noEncontrado = () => new Response("No encontrado", { status: 404 });

async function cuerpoJSON(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const esPack = (p: Producto) => p.category === "packs";

const aCarta = (p: Producto): ProductoCarta => ({
  slug: p.slug,
  name: p.name,
  seccion: p.seccion,
  priceCents: p.priceCents,
  consultar: p.consultar,
  activo: p.activo,
  agotado: p.agotado,
  variantes: p.variantes.map((v) => ({
    variantId: v.variantId,
    label: v.label,
    priceCents: v.priceCents,
  })),
});

export const GET: APIRoute = async ({ locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();
  try {
    const [productos, definiciones] = await Promise.all([
      listarProductos({ soloActivos: false }),
      todasLasDefiniciones(),
    ]);
    const cartaCompleta = productos.filter((p) => !esPack(p));
    const carta = cartaCompleta.map(aCarta);
    const packs: PackAdmin[] = [];
    for (const p of productos.filter(esPack)) {
      const def = definiciones.get(p.slug);
      // Un pack sin definición no se puede editar: no se enseña.
      if (!def) continue;
      const { slug: _slug, ...definicion } = def;
      const suelto = precioSueltoCents(def as DefinicionPack, carta);
      packs.push({
        slug: p.slug,
        name: p.name,
        priceCents: p.priceCents ?? 0,
        shortDescription: p.shortDescription,
        imageUrl: p.imageUrl,
        imageAlt: p.imageAlt,
        imageWidth: p.imageWidth,
        imageHeight: p.imageHeight,
        activo: p.activo,
        agotado: p.agotado,
        orden: p.orden,
        definicion,
        sueltoCents: suelto,
        ahorroPct: ahorroPct(p.priceCents ?? 0, suelto),
      });
    }
    const cuerpo: RespuestaGetPacks = { packs, carta };
    return json(cuerpo);
  } catch (error) {
    console.error("[admin/packs] no se pudieron leer:", error);
    return json({ error: "No se pudieron cargar los packs." }, 500);
  }
};

/**
 * Valida la entrada contra la carta de este momento. Devuelve la respuesta
 * de error, o los datos y los avisos.
 */
async function validar(
  request: Request,
  productos: Producto[],
): Promise<
  | { respuesta: Response }
  | { datos: Omit<DatosPack, "slug">; avisos: Problema[] }
> {
  const parsed = esquemaPack.safeParse(await cuerpoJSON(request));
  if (!parsed.success) {
    return { respuesta: json({ errores: problemasDeEsquema(parsed.error.issues) }, 400) };
  }
  const carta = productos.filter((p) => !esPack(p)).map(aCarta);
  const { errores, avisos } = comprobarPack(parsed.data, carta);
  if (errores.length > 0) return { respuesta: json({ errores }, 400) };
  return { datos: parsed.data, avisos };
}

/** `-2`, `-3`… hasta uno libre entre TODOS los productos, no solo los packs. */
function slugLibre(nombre: string, ocupados: Set<string>): string {
  const base = slugify(nombre);
  if (!ocupados.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidato = `${base}-${n}`;
    if (!ocupados.has(candidato)) return candidato;
  }
}

const invalidarTras = async (slug: string) =>
  invalidar(await rutasTrasGuardarProducto(slug, rutasDePacks));

export const POST: APIRoute = async ({ request, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();
  try {
    const productos = await listarProductos({ soloActivos: false });
    const v = await validar(request, productos);
    if ("respuesta" in v) return v.respuesta;

    const slug = slugLibre(v.datos.name, new Set(productos.map((p) => p.slug)));
    await crearPack({ ...v.datos, slug });
    // Su propia ficha incluida: pudo pedirse antes y dejar un 404 cacheado.
    await invalidarTras(slug);
    return json({ slug, avisos: v.avisos }, 201);
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return json(
        { error: "Otro pack se acaba de guardar con ese nombre. Inténtalo de nuevo." },
        409,
      );
    }
    console.error("[admin/packs] no se pudo crear:", error);
    return json({ error: "No se pudo guardar el pack." }, 500);
  }
};

/** El slug va en la query (`?slug=`), nunca en el cuerpo, y no cambia. */
export const PUT: APIRoute = async ({ request, url, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();
  const slug = url.searchParams.get("slug");
  if (!slug) return json({ error: "Falta el pack a editar." }, 400);
  try {
    const productos = await listarProductos({ soloActivos: false });
    if (!productos.some((p) => p.slug === slug && esPack(p))) {
      return json({ error: "Ese pack ya no existe." }, 404);
    }
    const v = await validar(request, productos);
    if ("respuesta" in v) return v.respuesta;

    await actualizarPack(slug, v.datos);
    await invalidarTras(slug);
    return json({ slug, avisos: v.avisos });
  } catch (error) {
    console.error("[admin/packs] no se pudo actualizar:", error);
    return json({ error: "No se pudo guardar el pack." }, 500);
  }
};
