/**
 * Secciones de la carta (CARTA_PRECIOS_FINAL, septiembre de 2026).
 * Agrupan el catálogo tal y como está organizada la carta impresa; se
 * superponen a las categorías sin sustituirlas. En la web salen en el orden
 * de esta lista. Las dos «sin alérgenos» tienen su propia página
 * (`/catalogo/sin-alergenos`, categoría `sin-alergenos`) desde el 7-10-2026.
 */
export const seccionIds = [
  "tartas-obrador",
  "cremosas",
  "planchas",
  "coleccion-especial",
  "bocados",
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
  "pan",
  "complementos-tarta",
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
  /**
   * Qué es, en una o dos palabras, para nombrar el producto fuera de la
   * carta (pedidos, Excel, correos, producción): «Empanada · Bonito»,
   * «Brazo · Selva Negra» (12-11-2026). Sin él, el nombre basta solo
   * («Pack Cumpleaños», «Barra Gallega»).
   */
  tipo?: string;
  order: number;
};

export const secciones: readonly Seccion[] = [
  {
    id: "tartas-obrador",
    tipo: "Tarta",
    label: "Tartas de bizcocho",
    eyebrow: "Dulce · Tartas",
    aviso:
      "¿Una tarta personalizada con foto? No se encarga por la web: llama directamente a la tienda y te la preparamos.",
    order: 100,
  },
  {
    id: "cremosas",
    tipo: "Tarta cremosa",
    label: "Mousses y Tartas Dulces",
    eyebrow: "Dulce · Cremosas",
    order: 200,
  },
  {
    id: "planchas",
    tipo: "Plancha",
    label: "Las Planchas San Lorenzo",
    eyebrow: "Dulce · Planchas",
    order: 400,
  },
  {
    id: "coleccion-especial",
    tipo: "Plancha especial",
    label: "La Colección Especial de Planchas",
    eyebrow: "Dulce · Planchas",
    order: 500,
  },
  {
    id: "bocados",
    tipo: "Bocaditos",
    label: "Bocaditos del Obrador",
    eyebrow: "Dulce · Recomendación del chef",
    order: 600,
  },
  {
    id: "bizcochos",
    tipo: "Bollería",
    label: "Bizcochos y bollería de mantequilla",
    eyebrow: "Dulce · Bizcochos",
    order: 700,
  },
  {
    id: "brazos",
    tipo: "Brazo",
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
    tipo: "Mini croissants dulces",
    label: "Mini Croissants Dulces",
    eyebrow: "Dulce · Mini Croissants",
    order: 1000,
  },
  {
    // Desde el 28-10-2026 la de las tartas sin gluten; las sin alérgenos
    // (y veganas) van todas en `salado-para-todos`. El id no cambia: lo
    // guardan los productos.
    id: "dulce-para-todos",
    tipo: "Sin gluten",
    label: "Sin gluten",
    eyebrow: "Sin gluten · Dulce",
    order: 1050,
  },
  {
    id: "empanadas",
    tipo: "Empanada",
    label: "Empanadas y supremas de hojaldre",
    eyebrow: "Salado · Hojaldre",
    order: 1100,
  },
  {
    id: "supremas",
    tipo: "Suprema de hojaldre",
    label: "Supremas de hojaldre",
    eyebrow: "Salado · Hojaldre",
    dentroDe: "empanadas",
    order: 1200,
  },
  {
    id: "quiches",
    tipo: "Quiche",
    label: "Quiches artesanas",
    eyebrow: "Salado · Especialidad del horno",
    order: 1400,
  },
  {
    id: "tartas-saladas",
    tipo: "Tarta salada",
    label: "Tartas saladas",
    eyebrow: "Salado · Horno",
    order: 1500,
  },
  {
    id: "para-compartir",
    label: "Bocaditos para compartir",
    eyebrow: "Salado · Cóctel",
    order: 1600,
  },
  {
    id: "las-lorenzas-salado",
    tipo: "Mini croissants salados",
    label: "Mini Croissants Salados",
    eyebrow: "Salado · Mini Croissants",
    order: 1700,
  },
  {
    id: "salado-para-todos",
    tipo: "Sin alérgenos",
    label: "Sin alérgenos y especial para veganos",
    eyebrow: "Sin alérgenos · Veganos",
    order: 1750,
  },
  {
    // Pan (11-11-2026): el pan del día.
    id: "pan",
    label: "Pan del obrador",
    eyebrow: "Pan",
    order: 1800,
  },
  {
    // Complementos (12-11-2026): figuras y velas para la tarta.
    id: "complementos-tarta",
    label: "Complementos para tu tarta",
    eyebrow: "Complementos",
    order: 1900,
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

const sinAcentos = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * El nombre de un producto con su tipo delante, para leerlo fuera de la
 * carta: «Empanada · Bonito». No se añade si la sección no tiene tipo, si
 * la sección no se conoce o si el nombre ya lo lleva («Bizcocho Casero…»,
 * «Tarta Cremosa de Queso al Horno · Sin gluten»).
 */
export function nombreConTipo(nombre: string, seccion: string | null | undefined): string {
  if (!seccion || !isSeccionId(seccion)) return nombre;
  const tipo = seccionById(seccion).tipo;
  if (!tipo || sinAcentos(nombre).includes(sinAcentos(tipo))) return nombre;
  return `${tipo} · ${nombre}`;
}
