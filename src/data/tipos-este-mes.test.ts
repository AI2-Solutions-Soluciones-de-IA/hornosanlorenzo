import { describe, expect, it } from "vitest";
import { porTipoYOrden } from "~/data/tipos-este-mes";

describe("orden de Este mes", () => {
  it("promociones, sugerencias y novedades; dentro de cada una, por orden", () => {
    const secciones = [
      { titulo: "Novedades", tipo: "novedad", orden: 1 },
      { titulo: "Salados para compartir", tipo: "sugerencia", orden: 4 },
      { titulo: "10% de descuento", tipo: "promocion", orden: 5 },
      { titulo: "Dulces para compartir", tipo: "sugerencia", orden: 3 },
    ] as const;
    expect([...secciones].sort(porTipoYOrden).map((s) => s.titulo)).toEqual([
      "10% de descuento",
      "Dulces para compartir",
      "Salados para compartir",
      "Novedades",
    ]);
  });
});
