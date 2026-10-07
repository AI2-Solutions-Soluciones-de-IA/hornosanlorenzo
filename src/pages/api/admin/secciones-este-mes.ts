import type { APIRoute } from "astro";
import { z } from "zod";
import {
  listarSecciones,
  crearSeccion,
  actualizarSeccion,
  borrarSeccion,
  ordenarSecciones,
} from "~/lib/db/seccionesEsteMes";
import { invalidar, RUTAS_CATALOGO } from "~/lib/cache";
import { listarProductos } from "~/lib/db/productos";
import { compruebaPrecioOferta } from "~/lib/ofertas";
import { esAdmin } from "~/lib/auth/guardia";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** 404 y no 401/403, como el resto del panel (spec §7). */
const noEncontrado = () => new Response("No encontrado", { status: 404 });

const esquema = z.object({
  titulo: z.string().trim().min(3).max(120),
  descripcion: z.string().trim().max(300).default(""),
  orden: z.number().int().min(-1000).max(1000).default(0),
  publicada: z.boolean().default(false),
  productoIds: z.array(z.string().uuid()).max(48).default([]),
  // Precio de oferta por producto, como en las noticias (`~/lib/ofertas.ts`).
  // Que cuadre con la ficha lo comprueba `compruebaOfertas`.
  ofertas: z
    .record(
      z.string().uuid(),
      z.object({
        ofertaCents: z.number().int().positive().max(1_000_000).nullable().default(null),
        ofertaVariantes: z
          .record(z.string().min(1).max(60), z.number().int().positive().max(1_000_000))
          .refine((o) => Object.keys(o).length <= 20)
          .default({}),
      }),
    )
    .default({}),
  ofertaHasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});

type Datos = z.infer<typeof esquema>;

/**
 * Solo se guardan las ofertas de productos que están en la sección, y cada
 * una tiene que rebajar de verdad su ficha. Devuelve los datos limpios o el
 * mensaje para el panel.
 */
async function compruebaOfertas(d: Datos): Promise<{ datos: Datos } | { error: string }> {
  const ofertas = Object.fromEntries(
    Object.entries(d.ofertas).filter(
      ([id, o]) =>
        d.productoIds.includes(id) && (o.ofertaCents !== null || Object.keys(o.ofertaVariantes).length > 0),
    ),
  );
  if (Object.keys(ofertas).length === 0) return { datos: { ...d, ofertas, ofertaHasta: null } };
  const fichas = new Map((await listarProductos({ soloActivos: false })).map((p) => [p.id, p]));
  for (const [id, o] of Object.entries(ofertas)) {
    const ficha = fichas.get(id);
    if (!ficha) return { error: "Uno de los productos ya no está en la carta. Quítalo y guarda otra vez." };
    const error = compruebaPrecioOferta(ficha, o.ofertaCents, o.ofertaVariantes);
    if (error) return { error };
  }
  return { datos: { ...d, ofertas } };
}

/** Las secciones se ven en Este mes; con ofertas, también cambian precios de la carta. */
const RUTAS = ["/noticias", ...RUTAS_CATALOGO];

/** Más la ficha de cada producto de la sección, el de antes y el de ahora. */
async function rutasDe(...productoIds: string[]): Promise<string[]> {
  try {
    const slugs = (await listarProductos({ soloActivos: false }))
      .filter((p) => productoIds.includes(p.id))
      .map((p) => `/catalogo/${p.slug}`);
    return [...new Set([...RUTAS, ...slugs])];
  } catch {
    return RUTAS;
  }
}

/** Los productos que tenía la sección antes de tocarla. */
async function productosAntes(id: string): Promise<string[]> {
  try {
    return (await listarSecciones()).find((s) => s.id === id)?.productoIds ?? [];
  } catch {
    return [];
  }
}

async function cuerpo(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/** Un producto que ya no existe llega como clave ajena rota (23503). */
const esProductoQueNoExiste = (e: unknown) =>
  typeof e === "object" && e !== null && "code" in e && e.code === "23503";

export const GET: APIRoute = async ({ locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();
  try {
    return json({ secciones: await listarSecciones() });
  } catch (error) {
    console.error("[admin/secciones-este-mes] no se pudieron leer:", error);
    return json({ error: "No se pudieron cargar las secciones." }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();
  const datos = esquema.safeParse(await cuerpo(request));
  if (!datos.success) return json({ error: "Pon un título de al menos 3 letras." }, 400);
  const limpios = await compruebaOfertas(datos.data);
  if ("error" in limpios) return json({ error: limpios.error }, 400);
  try {
    const seccion = await crearSeccion(limpios.datos);
    await invalidar(await rutasDe(...seccion.productoIds));
    return json({ seccion }, 201);
  } catch (error) {
    if (esProductoQueNoExiste(error))
      return json({ error: "Uno de los productos ya no está en la carta. Quítalo y guarda otra vez." }, 400);
    console.error("[admin/secciones-este-mes] no se pudo crear:", error);
    return json({ error: "No se pudo guardar la sección." }, 500);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();
  const bruto = await cuerpo(request);
  const id = bruto?.id;
  if (typeof id !== "string") return json({ error: "Falta la sección a editar." }, 400);
  const datos = esquema.safeParse(bruto);
  if (!datos.success) return json({ error: "Pon un título de al menos 3 letras." }, 400);
  const limpios = await compruebaOfertas(datos.data);
  if ("error" in limpios) return json({ error: limpios.error }, 400);
  try {
    const antes = await productosAntes(id);
    const seccion = await actualizarSeccion(id, limpios.datos);
    if (!seccion) return json({ error: "Esa sección ya no existe." }, 404);
    await invalidar(await rutasDe(...antes, ...seccion.productoIds));
    return json({ seccion });
  } catch (error) {
    if (esProductoQueNoExiste(error))
      return json({ error: "Uno de los productos ya no está en la carta. Quítalo y guarda otra vez." }, 400);
    console.error("[admin/secciones-este-mes] no se pudo actualizar:", error);
    return json({ error: "No se pudo guardar la sección." }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();
  const id = (await cuerpo(request))?.id;
  if (typeof id !== "string") return json({ error: "Falta la sección a borrar." }, 400);
  try {
    const antes = await productosAntes(id);
    if (!(await borrarSeccion(id))) return json({ error: "Esa sección ya no existe." }, 404);
    await invalidar(await rutasDe(...antes));
    return json({ ok: true });
  } catch (error) {
    console.error("[admin/secciones-este-mes] no se pudo borrar:", error);
    return json({ error: "No se pudo borrar la sección." }, 500);
  }
};

/** Orden de las secciones: `{ orden: [id, id, …] }`, de la primera a la última. */
export const PATCH: APIRoute = async ({ request, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();
  const parsed = z
    .object({ orden: z.array(z.string().uuid()).min(1).max(200) })
    .safeParse(await cuerpo(request));
  if (!parsed.success) return json({ error: "Falta el orden de las secciones." }, 400);
  try {
    await ordenarSecciones(parsed.data.orden);
    // Solo cambia dónde salen en Este mes: precios y fichas siguen igual.
    await invalidar(["/noticias"]);
    return json({ ok: true });
  } catch (error) {
    console.error("[admin/secciones-este-mes] no se pudo ordenar:", error);
    return json({ error: "No se pudo guardar el orden." }, 500);
  }
};
