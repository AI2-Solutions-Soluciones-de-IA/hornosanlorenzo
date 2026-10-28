import { describe, expect, it } from "vitest";
import { empiezaPorElMayor } from "./tamanos";

describe("empiezaPorElMayor", () => {
  it("empanadas, planchas y tartas del obrador arrancan en el más grande", () => {
    expect(empiezaPorElMayor({ slug: "empanada-de-bonito", seccion: "empanadas" })).toBe(true);
    expect(empiezaPorElMayor({ slug: "plancha-oreo", seccion: "planchas" })).toBe(true);
    expect(empiezaPorElMayor({ slug: "la-trufada", seccion: "tartas-obrador" })).toBe(true);
  });

  it("las planchas de la Colección especial también", () => {
    expect(empiezaPorElMayor({ slug: "plancha-red-velvet", seccion: "coleccion-especial" })).toBe(true);
  });

  it("el resto arranca en el primero", () => {
    expect(empiezaPorElMayor({ slug: "mini-croissants-cebra", seccion: "las-lorenzas" })).toBe(false);
    expect(empiezaPorElMayor({ slug: "tarta-retrato", seccion: "detalles-celebracion" })).toBe(false);
    expect(empiezaPorElMayor({ slug: "sin-seccion", seccion: null })).toBe(false);
  });
});
