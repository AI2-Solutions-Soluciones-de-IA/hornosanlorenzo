export const categoryIds = [
  "bolleria",
  "tartas",
  "salado",
  "temporada",
  "packs",
] as const;

export type CategoryId = (typeof categoryIds)[number];

export type Category = {
  id: CategoryId;
  label: string;
  short: string;
};

export const categories: readonly Category[] = [
  {
    id: "bolleria",
    label: "Bollería",
    short: "Croissants, napolitanas, suizos",
  },
  { id: "tartas", label: "Tartas", short: "Para celebrar o capricho diario" },
  { id: "salado", label: "Salado", short: "Empanadas, quiches, hojaldres" },
  { id: "temporada", label: "Temporada", short: "Roscón, torrijas, panettone" },
  {
    id: "packs",
    label: "Packs",
    short: "Ocasiones resueltas, con precio cerrado",
  },
] as const;

export const categoryById = (id: CategoryId): Category =>
  categories.find((c) => c.id === id)!;

export const isCategoryId = (value: string | null): value is CategoryId =>
  value !== null && (categoryIds as readonly string[]).includes(value);

/**
 * Agrupación comercial del brief: Dulce · Salado · Packs.
 * Se superpone a las categorías del catálogo sin sustituirlas.
 */
export const grupoIds = ["dulce", "salado", "packs"] as const;

export type GrupoId = (typeof grupoIds)[number];

export const grupoCategories: Record<GrupoId, readonly CategoryId[]> = {
  dulce: ["bolleria", "tartas", "temporada"],
  salado: ["salado"],
  packs: ["packs"],
};

export const grupoLabel: Record<GrupoId, string> = {
  dulce: "Dulce",
  salado: "Salado",
  packs: "Packs",
};

/** El grupo comercial al que pertenece una categoría del catálogo. */
export const grupoOfCategory = (cat: CategoryId): GrupoId | null =>
  (grupoIds.find((g) => grupoCategories[g].includes(cat)) as GrupoId) ?? null;

export const isGrupoId = (value: string | null): value is GrupoId =>
  value !== null && (grupoIds as readonly string[]).includes(value);
