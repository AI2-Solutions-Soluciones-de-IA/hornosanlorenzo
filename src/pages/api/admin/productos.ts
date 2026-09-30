import type { APIRoute } from "astro";
import { z } from "zod";
import {
  listarProductos,
  crearProducto,
  actualizarProducto,
  ProductoError,
} from "~/lib/db/productos";
import { invalidar, rutasTrasGuardarProducto } from "~/lib/cache";
import { rutasDePacks } from "~/lib/db/packs";
import { esAdmin } from "~/lib/auth/guardia";
import { categoryIds } from "~/data/categories";
import { seccionIds } from "~/data/secciones";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const SOLO_EN_PACKS = "Los packs se crean y editan en la sección Packs.";

const noEncontrado = () => new Response("No encontrado", { status: 404 });

const ALERGENOS = [
  "gluten",
  "huevo",
  "leche",
  "frutos-secos",
  "soja",
  "sesamo",
  "sulfitos",
] as const;

/**
 * Las categorías, las secciones y los alérgenos salen de las listas que ya
 * hay en código: son las mismas que valida `src/content.config.ts` hoy. Un
 * valor fuera de esas listas rompería el filtro del catálogo sin dar error,
 * así que se rechaza aquí.
 */
const esquema = z
  .object({
    name: z.string().trim().min(2).max(140),
    category: z.enum(categoryIds),
    seccion: z.enum(seccionIds).nullable().default(null),
    priceCents: z.number().int().positive().nullable().default(null),
    consultar: z.boolean().default(false),
    unit: z.string().trim().max(60).nullable().default(null),
    shortDescription: z.string().trim().min(3).max(180),
    cuerpo: z.string().max(20_000).default(""),
    allergens: z.array(z.enum(ALERGENOS)).default([]),
    destacado: z.boolean().default(false),
    temporada: z.boolean().default(false),
    orden: z.number().int().min(0).max(9999).default(100),
    imageUrl: z.string().url().nullable().default(null),
    imageAlt: z.string().trim().max(200).nullable().default(null),
    imageWidth: z.number().int().positive().nullable().default(null),
    imageHeight: z.number().int().positive().nullable().default(null),
    activo: z.boolean().default(true),
    agotado: z.boolean().default(false),
    // Vacía cuenta como «sin etiqueta».
    especialidad: z
      .string()
      .trim()
      .max(60)
      .nullable()
      .default(null)
      .transform((v) => v || null),
    variantes: z
      .array(
        z.object({
          variantId: z.string().trim().min(1).max(60),
          label: z.string().trim().min(1).max(80),
          priceCents: z.number().int().positive(),
          orden: z.number().int().min(0).max(99).default(0),
        }),
      )
      .max(10)
      .default([]),
  })
  // La misma regla que la restricción de la migración 007 y que el `.refine`
  // que ya tenía la colección de contenido: o precio, o «consultar».
  .refine((d) => d.consultar || typeof d.priceCents === "number", {
    message: "Pon un precio, o marca la ficha como «precio a consultar».",
    path: ["priceCents"],
  })
  .refine((d) => !d.imageUrl || Boolean(d.imageAlt), {
    message:
      "Escribe qué se ve en la foto: hace falta para quien no puede verla.",
    path: ["imageAlt"],
  })
  // La base de datos ya lo impide con `unique (producto_id, variant_id)`
  // (migración 007), pero dejar que llegue hasta ahí solo consigue que
  // `traduce()` tenga que reconocer esa violación por su nombre de
  // restricción — mejor cortarlo aquí, con un mensaje que dice qué ha
  // pasado en vez de esperar al error de Postgres.
  .refine(
    (d) => {
      const ids = d.variantes.map((v) => v.variantId);
      return new Set(ids).size === ids.length;
    },
    {
      message:
        "Dos variantes no pueden compartir identificador. Cámbialo en una de ellas.",
      path: ["variantes"],
    },
  );

async function cuerpoJSON(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

/**
 * Nombre en español de cada campo de una variante, para el mensaje de
 * `primerError` cuando el problema está dentro de `variantes`: sin esto,
 * un identificador o un precio en blanco devuelven el mensaje genérico de
 * zod («Too small: expected string to have >=1 characters»), que no dice
 * ni qué variante ni qué campo hay que arreglar.
 */
const CAMPO_VARIANTE: Record<string, string> = {
  variantId: "un identificador",
  label: "una etiqueta",
  priceCents: "un precio mayor que cero",
  orden: "un orden válido",
};

/**
 * El primer mensaje de zod, que ya está escrito en español y para leerse —
 * salvo dentro de `variantes`, donde el mensaje por defecto no dice ni la
 * variante ni el campo, y aquí se construye uno que sí lo dice.
 */
const primerError = (error: z.ZodError) => {
  const issue = error.issues[0];
  if (!issue) return "Faltan datos de la ficha.";
  const [raiz, indice, campo] = issue.path;
  if (raiz === "variantes" && typeof indice === "number") {
    const humano =
      typeof campo === "string" ? (CAMPO_VARIANTE[campo] ?? "un dato") : null;
    if (humano) return `La variante ${indice + 1} necesita ${humano}.`;
  }
  return issue.message;
};

export const GET: APIRoute = async ({ locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();
  try {
    // `soloActivos: false`: el panel también tiene que ver lo desactivado,
    // que si no, no habría forma de volver a activarlo.
    return json({ productos: await listarProductos({ soloActivos: false }) });
  } catch (error) {
    console.error("[admin/productos] no se pudieron leer:", error);
    return json({ error: "No se pudo cargar el catálogo." }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();

  const parsed = esquema.safeParse(await cuerpoJSON(request));
  if (!parsed.success) return json({ error: primerError(parsed.error) }, 400);
  if (parsed.data.category === "packs") return json({ error: SOLO_EN_PACKS }, 400);

  try {
    const producto = await crearProducto(parsed.data);
    // También su propia página, igual que en el PUT: alguien pudo pedir esa
    // URL antes de que la ficha existiera y dejar un 404 cacheado que
    // sobreviviría a su creación.
    // Y las fichas de todos los packs, leídas de la base de datos: enseñan
    // opciones y precios de otros productos (`rutasTrasGuardarProducto`).
    await invalidar(await rutasTrasGuardarProducto(producto.slug, rutasDePacks));
    return json({ producto }, 201);
  } catch (error) {
    if (error instanceof ProductoError)
      return json({ error: error.message }, error.status);
    console.error("[admin/productos] no se pudo crear:", error);
    return json({ error: "No se pudo guardar la ficha." }, 500);
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();

  const bruto = await cuerpoJSON(request);
  const id = (bruto as { id?: unknown })?.id;
  if (typeof id !== "string")
    return json({ error: "Falta la ficha a editar." }, 400);

  const parsed = esquema.safeParse(bruto);
  if (!parsed.success) return json({ error: primerError(parsed.error) }, 400);

  if (parsed.data.category === "packs") return json({ error: SOLO_EN_PACKS }, 400);

  try {
    // Un pack no se edita aquí aunque el cuerpo diga otra categoría: la fila
    // actual manda, o quedaría un producto sin definición ni piezas.
    const actual = (await listarProductos({ soloActivos: false })).find(
      (p) => p.id === id,
    );
    if (actual?.category === "packs") return json({ error: SOLO_EN_PACKS }, 400);
    const producto = await actualizarProducto(id, parsed.data);
    if (!producto) return json({ error: "Esa ficha ya no existe." }, 404);
    // También su propia página, no solo los listados.
    // Y las fichas de todos los packs, leídas de la base de datos: enseñan
    // opciones y precios de otros productos (`rutasTrasGuardarProducto`).
    await invalidar(await rutasTrasGuardarProducto(producto.slug, rutasDePacks));
    return json({ producto });
  } catch (error) {
    if (error instanceof ProductoError)
      return json({ error: error.message }, error.status);
    console.error("[admin/productos] no se pudo actualizar:", error);
    return json({ error: "No se pudo guardar la ficha." }, 500);
  }
};
