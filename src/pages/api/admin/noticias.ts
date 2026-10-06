import type { APIRoute } from "astro";
import { z } from "zod";
import {
  listarNoticias,
  crearNoticia,
  actualizarNoticia,
  borrarNoticia,
  NoticiaError,
} from "~/lib/db/noticias";
import { invalidar, RUTAS_NOTICIAS, RUTAS_CATALOGO } from "~/lib/cache";
import { listarProductos } from "~/lib/db/productos";
import { esAdmin } from "~/lib/auth/guardia";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * 404, no 401 ni 403: mismo criterio que las páginas del panel (spec §7). Un
 * 403 le confirma a cualquiera que ahí detrás hay algo que atacar.
 */
const noEncontrado = () => new Response("No encontrado", { status: 404 });

const esquema = z.object({
  titulo: z.string().trim().min(3).max(140),
  excerpt: z.string().trim().min(10).max(240),
  cuerpo: z.string().max(20_000).default(""),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  imageUrl: z.string().url().nullable().default(null),
  imageAlt: z.string().trim().max(200).nullable().default(null),
  imageWidth: z.number().int().positive().nullable().default(null),
  imageHeight: z.number().int().positive().nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  publicada: z.boolean().default(false),
  // Producto de la carta que se puede añadir desde la noticia. Solo se
  // comprueba la forma: que exista lo decide la clave ajena, y `traduce`
  // lo convierte en un 400 con mensaje presentable.
  productoId: z.string().uuid().nullable().default(null),
  // Precio de oferta del producto enlazado (`~/lib/ofertas.ts`): uno si no
  // tiene tamaños, uno por tamaño si los tiene. Que cuadre con la ficha lo
  // comprueba `compruebaOferta`.
  ofertaCents: z.number().int().positive().max(1_000_000).nullable().default(null),
  ofertaVariantes: z
    .record(z.string().min(1).max(60), z.number().int().positive().max(1_000_000))
    .refine((o) => Object.keys(o).length <= 20)
    .default({}),
  ofertaHasta: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
});

async function cuerpoJSON(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Una foto sin texto alternativo es una foto que no existe para quien usa un
 * lector de pantalla. Se pide aquí, en el servidor, y no solo en el formulario.
 */
function compruebaAlt(datos: z.infer<typeof esquema>): string | null {
  if (datos.imageUrl && !datos.imageAlt) {
    return "Escribe qué se ve en la foto: hace falta para quien no puede verla.";
  }
  return null;
}

/**
 * La oferta tiene que rebajar de verdad el producto enlazado y encajar con
 * sus tamaños: un precio de oferta por encima del normal, o para un tamaño
 * que ya no existe, se descartaría en silencio al vender (`aplicaOferta`) y
 * quien la escribió creería que está activa.
 */
async function compruebaOferta(datos: z.infer<typeof esquema>): Promise<string | null> {
  const hayOferta = datos.ofertaCents !== null || Object.keys(datos.ofertaVariantes).length > 0;
  if (!hayOferta) return null;
  if (!datos.productoId) return "Para poner un precio de oferta, elige el producto de la carta.";

  const producto = (await listarProductos({ soloActivos: false })).find((p) => p.id === datos.productoId);
  if (!producto) return "Ese producto ya no está en la carta. Elige otro o quita la oferta.";
  if (producto.consultar || producto.priceCents === null)
    return `«${producto.name}» no tiene precio de venta online: no se le puede poner oferta.`;

  if (producto.variantes.length > 0) {
    if (datos.ofertaCents !== null) return "Este producto tiene tamaños: pon el precio de oferta en cada tamaño.";
    for (const [id, cents] of Object.entries(datos.ofertaVariantes)) {
      const v = producto.variantes.find((x) => x.variantId === id);
      if (!v) return "Uno de los tamaños de la oferta ya no existe en la ficha. Revísala.";
      if (cents >= v.priceCents)
        return `El precio de oferta de «${v.label}» tiene que ser menor que el de siempre.`;
    }
  } else {
    if (Object.keys(datos.ofertaVariantes).length > 0 || datos.ofertaCents === null)
      return "Este producto no tiene tamaños: pon un único precio de oferta.";
    if (datos.ofertaCents >= producto.priceCents)
      return "El precio de oferta tiene que ser menor que el de siempre.";
  }
  return null;
}

/**
 * Con una oferta de por medio, cambiar una noticia cambia el precio de su
 * producto en la carta: se refrescan también el catálogo y la ficha del
 * producto, el de antes y el de ahora.
 */
const rutasDe = (slugNoticia: string, ...productos: (string | undefined)[]) => [
  ...new Set([
    ...RUTAS_NOTICIAS,
    ...RUTAS_CATALOGO,
    `/noticias/${slugNoticia}`,
    ...productos.flatMap((s) => (s ? [`/catalogo/${s}`] : [])),
  ]),
];

/** El producto que enlazaba la noticia antes de tocarla, para refrescar su ficha. */
async function productoAnterior(id: string): Promise<string | undefined> {
  try {
    return (await listarNoticias({ soloPublicadas: false })).find((n) => n.id === id)?.producto?.slug;
  } catch {
    return undefined;
  }
}

export const GET: APIRoute = async ({ locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();
  try {
    return json({ noticias: await listarNoticias({ soloPublicadas: false }) });
  } catch (error) {
    console.error("[admin/noticias] no se pudieron leer:", error);
    return json({ error: "No se pudieron cargar las noticias." }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();

  const parsed = esquema.safeParse(await cuerpoJSON(request));
  if (!parsed.success)
    return json({ error: "Faltan datos de la noticia." }, 400);

  const falta = compruebaAlt(parsed.data) ?? (await compruebaOferta(parsed.data));
  if (falta) return json({ error: falta }, 400);

  try {
    const noticia = await crearNoticia(parsed.data);
    // Se invalida después de guardar, y `invalidar` nunca lanza: si falla, el
    // cambio ya está escrito y solo tarda un poco más en verse.
    await invalidar(rutasDe(noticia.slug, noticia.producto?.slug));
    return json({ noticia }, 201);
  } catch (error) {
    if (error instanceof NoticiaError)
      return json({ error: error.message }, error.status);
    console.error("[admin/noticias] no se pudo crear:", error);
    return json({ error: "No se pudo guardar la noticia." }, 500);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();

  const bruto = await cuerpoJSON(request);
  const id = (bruto as { id?: unknown })?.id;
  if (typeof id !== "string")
    return json({ error: "Falta la noticia a editar." }, 400);

  const parsed = esquema.safeParse(bruto);
  if (!parsed.success)
    return json({ error: "Faltan datos de la noticia." }, 400);

  const falta = compruebaAlt(parsed.data) ?? (await compruebaOferta(parsed.data));
  if (falta) return json({ error: falta }, 400);

  try {
    const antes = await productoAnterior(id);
    const noticia = await actualizarNoticia(id, parsed.data);
    if (!noticia) return json({ error: "Esa noticia ya no existe." }, 404);
    await invalidar(rutasDe(noticia.slug, antes, noticia.producto?.slug));
    return json({ noticia });
  } catch (error) {
    if (error instanceof NoticiaError)
      return json({ error: error.message }, error.status);
    console.error("[admin/noticias] no se pudo actualizar:", error);
    return json({ error: "No se pudo guardar la noticia." }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();

  const bruto = await cuerpoJSON(request);
  const id = (bruto as { id?: unknown })?.id;
  if (typeof id !== "string")
    return json({ error: "Falta la noticia a borrar." }, 400);

  try {
    const antes = await productoAnterior(id);
    const slug = await borrarNoticia(id);
    if (!slug) return json({ error: "Esa noticia ya no existe." }, 404);
    // Su propia página también, igual que en el PUT: si no, la noticia
    // desaparece de los listados y del carrusel de la home pero sigue viva
    // en `/noticias/<slug>`, que es la URL que la gente comparte.
    await invalidar(rutasDe(slug, antes));
    return json({ ok: true });
  } catch (error) {
    console.error("[admin/noticias] no se pudo borrar:", error);
    return json({ error: "No se pudo borrar la noticia." }, 500);
  }
};
