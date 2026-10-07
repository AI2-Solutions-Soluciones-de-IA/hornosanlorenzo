/**
 * Secciones de la carta (CARTA_PRECIOS_FINAL, septiembre de 2026).
 * Agrupan el catálogo tal y como está organizada la carta impresa; se
 * superponen a las categorías sin sustituirlas. En la web salen en el orden
 * de esta lista: «Sin alérgenos», la última de Dulce y de Salado (7-10-2026).
 */
export const seccionIds = [
  "tartas-obrador",
  "cremosas",
  "planchas",
  "bocados",
  "coleccion-especial",
  "bizcochos",
  "brazos",
  "detalles-celebracion",
  "las-lorenzas",
  "dulce-para-todos",
  "empanadas",
  "supremas",
  "quiches",
  "tartas-saladas",
  "para-compartir",
  "las-lorenzas-salado",
  "salado-para-todos",
  "packs",
] as const;

export type SeccionId = (typeof seccionIds)[number];

export type Seccion = {
  id: SeccionId;
  /** Título de la sección en la carta. */
  label: string;
  /** Antetítulo de la carta: «DULCE · TARTAS». */
  eyebrow: string;
  /** Nota de raciones y tamaños que acompaña a la sección. */
  nota?: string;
  /** Aviso con teléfono: para lo que no se puede encargar por la web. */
  aviso?: string;
  /**
   * La sección no tiene bloque propio en la carta: sus productos salen en el
   * de esta otra, en la misma rejilla (las supremas, con las empanadas). El
   * id sigue existiendo porque es lo que guarda cada ficha.
   */
  dentroDe?: SeccionId;
  order: number;
};

export const secciones: readonly Seccion[] = [
  {
    id: "tartas-obrador",
    label: "Las Tartas del Obrador",
    eyebrow: "Dulce · Tartas",
    aviso:
      "¿Una tarta personalizada con foto? No se encarga por la web: llama directamente a la tienda y te la preparamos.",
    order: 100,
  },
  {
    id: "cremosas",
    label: "Mousses y Tartas Dulces",
    eyebrow: "Dulce · Cremosas",
    order: 200,
  },
  {
    id: "planchas",
    label: "Las Planchas San Lorenzo",
    eyebrow: "Dulce · Planchas",
    order: 400,
  },
  {
    id: "bocados",
    label: "Bocaditos del Obrador",
    eyebrow: "Dulce · Recomendación del chef",
    order: 500,
  },
  {
    id: "coleccion-especial",
    label: "La Colección Especial de Planchas",
    eyebrow: "Dulce · Planchas",
    order: 600,
  },
  {
    id: "bizcochos",
    label: "Bizcochos y bollería de mantequilla",
    eyebrow: "Dulce · Bizcochos",
    order: 700,
  },
  {
    id: "brazos",
    label: "Brazos y Mini Brazos",
    eyebrow: "Dulce · Brazos",
    order: 800,
  },
  {
    id: "detalles-celebracion",
    label: "Ocasiones para celebrar",
    eyebrow: "Dulce · Celebración",
    order: 900,
  },
  {
    id: "las-lorenzas",
    label: "Mini Croissants Dulces",
    eyebrow: "Dulce · Mini Croissants",
    order: 1000,
  },
  {
    id: "dulce-para-todos",
    label: "Sin alérgenos",
    eyebrow: "Dulce · Sin alérgenos",
    order: 1050,
  },
  {
    id: "empanadas",
    label: "Empanadas y supremas de hojaldre",
    eyebrow: "Salado · Hojaldre",
    order: 1100,
  },
  {
    id: "supremas",
    label: "Supremas de hojaldre",
    eyebrow: "Salado · Hojaldre",
    dentroDe: "empanadas",
    order: 1200,
  },
  {
    id: "quiches",
    label: "Quiches artesanas",
    eyebrow: "Salado · Especialidad del horno",
    order: 1400,
  },
  {
    id: "tartas-saladas",
    label: "Tartas saladas",
    eyebrow: "Salado · Horno",
    order: 1500,
  },
  {
    id: "para-compartir",
    label: "Para compartir",
    eyebrow: "Salado · Cóctel",
    order: 1600,
  },
  {
    id: "las-lorenzas-salado",
    label: "Mini Croissants Salados",
    eyebrow: "Salado · Mini Croissants",
    order: 1700,
  },
  {
    id: "salado-para-todos",
    label: "Sin alérgenos",
    eyebrow: "Salado · Sin alérgenos",
    order: 1750,
  },
  {
    id: "packs",
    label: "Packs San Lorenzo",
    eyebrow: "Packs · Ocasiones",
    order: 50,
  },
] as const;

/**
 * Nombre de la sección en el panel: las dos «Sin alérgenos» se distinguen
 * por su antetítulo («Dulce · Sin alérgenos»).
 */
export const etiquetaPanel = (s: Seccion): string =>
  secciones.filter((x) => x.label === s.label).length > 1 ? s.eyebrow : s.label;

export const seccionById = (id: SeccionId): Seccion =>
  secciones.find((s) => s.id === id)!;

/** El bloque de la carta donde sale una sección: el suyo, o el de `dentroDe`. */
export const bloqueDe = (id: SeccionId): SeccionId => seccionById(id).dentroDe ?? id;

export const isSeccionId = (value: string | null): value is SeccionId =>
  value !== null && (seccionIds as readonly string[]).includes(value);
