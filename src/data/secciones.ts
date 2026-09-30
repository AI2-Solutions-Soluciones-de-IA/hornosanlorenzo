/**
 * Secciones de la carta (CARTA_PRECIOS_FINAL, septiembre de 2026).
 * Agrupan el catálogo tal y como está organizada la carta impresa; se
 * superponen a las categorías sin sustituirlas.
 */
export const seccionIds = [
  "tartas-obrador",
  "cremosas",
  "dulce-para-todos",
  "planchas",
  "bocados",
  "coleccion-especial",
  "bizcochos",
  "brazos",
  "detalles-celebracion",
  "las-lorenzas",
  "empanadas",
  "supremas",
  "salado-para-todos",
  "quiches",
  "tartas-saladas",
  "para-compartir",
  "las-lorenzas-salado",
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
  order: number;
};

export const secciones: readonly Seccion[] = [
  {
    id: "tartas-obrador",
    label: "Las Tartas del Obrador",
    eyebrow: "Dulce · Tartas",
    nota: "Bizcocho tierno del obrador y la nata recién montada de San Lorenzo · XL 15–20 rac. · M 10–12 · S 6–8",
    aviso:
      "¿Una tarta personalizada con foto? No se encarga por la web: llama directamente a la tienda y te la preparamos.",
    order: 100,
  },
  {
    id: "cremosas",
    label: "Mousses y Tartas Dulces",
    eyebrow: "Dulce · Cremosas",
    nota: "Suaves, frescas y de cuchara lenta · M 8–10 rac.",
    order: 200,
  },
  {
    id: "dulce-para-todos",
    label: "Dulce para todos",
    eyebrow: "Dulce · Sin alérgenos",
    nota: "S 6 rac.",
    order: 300,
  },
  {
    id: "planchas",
    label: "Las Planchas San Lorenzo",
    eyebrow: "Dulce · Planchas",
    nota: "Las de toda la vida, para mesas largas · XL 24–30 rac. · L 12–15",
    order: 400,
  },
  {
    id: "bocados",
    label: "Bocaditos del Obrador",
    eyebrow: "Dulce · Recomendación del chef",
    nota: "Pequeños caprichos para compartir… o no · por peso: 1 kg o ½ kg",
    order: 500,
  },
  {
    id: "coleccion-especial",
    label: "La Colección Especial de Planchas",
    eyebrow: "Dulce · Planchas",
    nota: "Sabores que solo salen de nuestro horno · XL 24–30 rac. · L 12–15",
    order: 600,
  },
  {
    id: "bizcochos",
    label: "Bizcochos y bollería de mantequilla",
    eyebrow: "Dulce · Bizcochos",
    nota: "Esponjosos, caseros y horneados cada mañana · M 10 rac.",
    order: 700,
  },
  {
    id: "brazos",
    label: "Brazos y Mini Brazos",
    eyebrow: "Dulce · Brazos",
    nota: "Enrollados a mano, como manda la tradición · M 8–10 rac. · S 4–6",
    order: 800,
  },
  {
    id: "detalles-celebracion",
    label: "Ocasiones para celebrar",
    eyebrow: "Dulce · Celebración",
    nota: "Cumpleaños y celebraciones",
    order: 900,
  },
  {
    id: "las-lorenzas",
    label: "Mini Croissants Dulces",
    eyebrow: "Dulce · Mini Croissants",
    nota: "De mantequilla artesanal · cajas de 6, 12 y 24 unidades",
    order: 1000,
  },
  {
    id: "empanadas",
    label: "Empanadas de hojaldre",
    eyebrow: "Salado · Hojaldre",
    nota: "Hojaldre del Horno San Lorenzo, receta artesanal asturiana · Entera 16–20 rac. · Media 8–10",
    order: 1100,
  },
  {
    id: "supremas",
    label: "Supremas de hojaldre",
    eyebrow: "Salado · Hojaldre",
    nota: "Crujientes, redondas y absolutamente irresistibles · M 8–10 rac.",
    order: 1200,
  },
  {
    id: "salado-para-todos",
    label: "Salado para todos",
    eyebrow: "Salado · Sin alérgenos",
    nota: "S 6 rac.",
    order: 1300,
  },
  {
    id: "quiches",
    label: "Quiches artesanas",
    eyebrow: "Salado · Especialidad del horno",
    nota: "Cremosas, sabrosas y horneadas a fuego lento · M 10 rac.",
    order: 1400,
  },
  {
    id: "tartas-saladas",
    label: "Tartas saladas",
    eyebrow: "Salado · Horno",
    nota: "Mucho relleno, mucho sabor y una masa irresistible · M 8–10 rac.",
    order: 1500,
  },
  {
    id: "para-compartir",
    label: "Para compartir",
    eyebrow: "Salado · Cóctel",
    nota: "Los bocaditos del horno: salados, para compartir",
    order: 1600,
  },
  {
    id: "las-lorenzas-salado",
    label: "Mini Croissants Salados",
    eyebrow: "Salado · Mini Croissants",
    nota: "Rellenos · cajas de 6, 12 y 24 unidades",
    order: 1700,
  },
  {
    id: "packs",
    label: "Packs San Lorenzo",
    eyebrow: "Packs · Ocasiones",
    nota: "Precio cerrado, por debajo de su suma en carta",
    order: 50,
  },
] as const;

export const seccionById = (id: SeccionId): Seccion =>
  secciones.find((s) => s.id === id)!;

export const isSeccionId = (value: string | null): value is SeccionId =>
  value !== null && (seccionIds as readonly string[]).includes(value);
