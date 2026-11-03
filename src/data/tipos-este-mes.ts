// Los tres bloques de Este mes, en el orden en que salen en la página
// (3-11-2026). Lo comparten el panel, la API y la página.

export const tiposSeccion = [
  { id: "promocion", label: "Promociones", singular: "Promoción" },
  { id: "sugerencia", label: "Sugerencias", singular: "Sugerencia" },
  { id: "novedad", label: "Novedades", singular: "Novedad" },
] as const;

export type TipoSeccion = (typeof tiposSeccion)[number]["id"];

export const tipoSeccionIds = tiposSeccion.map((t) => t.id) as [TipoSeccion, ...TipoSeccion[]];

/** Posición del tipo en la página: promociones, sugerencias, novedades. */
export const posicionTipo = (tipo: TipoSeccion): number => tipoSeccionIds.indexOf(tipo);

/** De un vistazo, en el orden de la página: por tipo y, dentro, por `orden`. */
export const porTipoYOrden = <T extends { tipo: TipoSeccion; orden: number }>(a: T, b: T): number =>
  posicionTipo(a.tipo) - posicionTipo(b.tipo) || a.orden - b.orden;
