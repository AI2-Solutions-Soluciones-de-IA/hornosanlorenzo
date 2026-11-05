import { describe, expect, it } from "vitest";
import { alergenosDePack, type DefinicionPack, type ProductoPieza } from "~/data/packs";

const prod = (slug: string, seccion: string, allergens: string[], trazas: string[] = []): ProductoPieza => ({
  slug,
  name: slug,
  seccion,
  priceCents: 1000,
  consultar: false,
  activo: true,
  agotado: false,
  variantes: [],
  allergens,
  trazas,
});

const def: DefinicionPack = {
  slug: "pack",
  ocasion: "",
  personas: { min: 4, max: 6, texto: "" },
  paraQuien: [],
  piezas: [
    { tipo: "fija", slug: "tarta", titulo: "Tarta", descripcion: "" },
    { tipo: "eleccion", id: "emp", titulo: "Empanada", descripcion: "", etiqueta: "Sabor", seccion: "empanadas" },
  ],
};

describe("alergenosDePack", () => {
  it("fija tal cual; en un hueco, contiene lo de todas y lo de alguna pasa a «puede contener»", () => {
    const r = alergenosDePack(def, [
      prod("tarta", "tartas-obrador", ["gluten", "leche"], ["sesamo"]),
      prod("bonito", "empanadas", ["gluten", "pescado"], ["mostaza"]),
      prod("carne", "empanadas", ["gluten", "sulfitos"]),
    ]);
    expect(r.contiene).toEqual(["gluten", "leche"]);
    expect(r.trazas).toEqual(["pescado", "mostaza", "sesamo", "sulfitos"]);
  });

  it("una opción agotada no cuenta", () => {
    const r = alergenosDePack(def, [
      prod("tarta", "tartas-obrador", ["gluten"]),
      prod("bonito", "empanadas", ["pescado"]),
      { ...prod("carne", "empanadas", ["sulfitos"]), agotado: true },
    ]);
    expect(r.contiene).toEqual(["gluten", "pescado"]);
    expect(r.trazas).toEqual([]);
  });
});
