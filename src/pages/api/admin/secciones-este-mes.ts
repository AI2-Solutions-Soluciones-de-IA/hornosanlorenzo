import type { APIRoute } from "astro";
import { z } from "zod";
import {
  listarSecciones,
  crearSeccion,
  actualizarSeccion,
  borrarSeccion,
} from "~/lib/db/seccionesEsteMes";
import { invalidar } from "~/lib/cache";
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
});

/** Las secciones solo se ven en Este mes. */
const RUTAS = ["/noticias"];

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
  try {
    const seccion = await crearSeccion(datos.data);
    await invalidar(RUTAS);
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
  try {
    const seccion = await actualizarSeccion(id, datos.data);
    if (!seccion) return json({ error: "Esa sección ya no existe." }, 404);
    await invalidar(RUTAS);
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
    if (!(await borrarSeccion(id))) return json({ error: "Esa sección ya no existe." }, 404);
    await invalidar(RUTAS);
    return json({ ok: true });
  } catch (error) {
    console.error("[admin/secciones-este-mes] no se pudo borrar:", error);
    return json({ error: "No se pudo borrar la sección." }, 500);
  }
};
