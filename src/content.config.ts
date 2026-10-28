import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { categoryIds } from "~/data/categories";
import { seccionIds } from "~/data/secciones";
import { alergenoIds } from "~/data/alergenos";

const allergens = z.enum(alergenoIds);

const variant = z.object({
  id: z.string(),
  label: z.string(),
  priceCents: z.number().int().positive(),
});

export const products = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/products" }),
  schema: ({ image }) =>
    z.object({
      name: z.string(),
      category: z.enum(categoryIds),
      /** Sección de la carta impresa. Agrupa la página de Dulce. */
      seccion: z.enum(seccionIds).optional(),
      /** Ausente solo cuando la carta dice «consultar». */
      priceCents: z.number().int().positive().optional(),
      /** La carta no da precio: se pide al obrador, no se puede comprar online. */
      consultar: z.boolean().default(false),
      unit: z.string().optional(),
      variants: z.array(variant).optional(),
      /** Pendiente para la carta de 2026: las fotos llegan más adelante. */
      image: image().optional(),
      imageAlt: z.string().optional(),
      shortDescription: z.string().max(180),
      allergens: z.array(allergens).default([]),
      featured: z.boolean().default(false),
      seasonal: z.boolean().default(false),
      order: z.number().int().default(100),
    })
    /** O tiene precio, o está marcado como «consultar»: nunca ninguno de los dos. */
    .refine((d) => d.consultar || typeof d.priceCents === "number", {
      message: "Un producto sin priceCents debe llevar consultar: true",
      path: ["priceCents"],
    }),
});

export const noticias = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/noticias" }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      date: z.coerce.date(),
      excerpt: z.string().max(240),
      image: image(),
      imageAlt: z.string(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    }),
});

export const collections = { products, noticias };
