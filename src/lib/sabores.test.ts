import { describe, expect, it } from "vitest";
import { agruparSabores, nombreCompleto } from "~/lib/sabores";
import type { Producto } from "~/lib/db/productos";

const p = (slug: string, seccion: string | null): Producto => ({
  id: slug,
  slug,
  name: slug,
  category: "salado",
  seccion,
  priceCents: 1000,
  consultar: false,
  unit: null,
  shortDescription: "",
  cuerpo: "",
  allergens: [],
  destacado: false,
  temporada: false,
  orden: 0,
  imageUrl: null,
  imageAlt: null,
  imageWidth: null,
  imageHeight: null,
  fotosExtra: [],
  fotoProvisional: false,
  activo: true,
  agotado: false,
  especialidad: null,
  variantes: [],
});

describe("agruparSabores", () => {
  it("junta las empanadas en una tarjeta donde salía la primera", () => {
    const r = agruparSabores([
      p("tarta", "tartas"),
      p("emp-bonito", "empanadas"),
      p("croquetas", null),
      p("emp-carne", "empanadas"),
    ]);
    expect(
      r.map((e) => (e.tipo === "producto" ? e.producto.slug : e.titulo)),
    ).toEqual(["tarta", "Empanadas", "croquetas"]);
    const grupo = r[1];
    expect(
      grupo.tipo === "sabores" && grupo.sabores.map((s) => s.slug),
    ).toEqual(["emp-bonito", "emp-carne"]);
  });

  it("empanadas y supremas van por separado", () => {
    const r = agruparSabores([
      p("emp-a", "empanadas"),
      p("sup-a", "supremas"),
      p("emp-b", "empanadas"),
      p("sup-b", "supremas"),
    ]);
    expect(r.map((e) => (e.tipo === "sabores" ? e.titulo : "?"))).toEqual([
      "Empanadas",
      "Supremas",
    ]);
  });

  it("un solo sabor sigue siendo su propia tarjeta", () => {
    const r = agruparSabores([p("emp-a", "empanadas"), p("tarta", "tartas")]);
    expect(r.every((e) => e.tipo === "producto")).toBe(true);
  });

  it("no agrupa otras secciones", () => {
    const r = agruparSabores([p("a", "tartas"), p("b", "tartas")]);
    expect(r).toHaveLength(2);
  });

  it("el surtido de mini croissants se queda aparte", () => {
    const surtido = {
      ...p("mini-surtido", "las-lorenzas-salado"),
      name: "Surtido Salado",
    };
    const r = agruparSabores([
      p("mini-york", "las-lorenzas-salado"),
      p("mini-serrano", "las-lorenzas-salado"),
      surtido,
    ]);
    expect(
      r.map((e) => (e.tipo === "producto" ? e.producto.slug : e.titulo)),
    ).toEqual(["Mini Croissants Salados", "mini-surtido"]);
  });
});

describe("nombreCompleto", () => {
  it("antepone lo que es a las fichas que se llaman solo por el sabor", () => {
    expect(nombreCompleto({ name: "De Carne", seccion: "empanadas" })).toBe("Empanada · De Carne");
    expect(nombreCompleto({ name: "Carbonara", seccion: "quiches" })).toBe("Quiche · Carbonara");
    expect(nombreCompleto({ name: "Calados", seccion: "las-lorenzas" })).toBe("Mini croissants · Calados");
  });

  it("deja igual el resto", () => {
    expect(nombreCompleto({ name: "Tarta de Queso", seccion: "cremosas" })).toBe("Tarta de Queso");
    expect(nombreCompleto({ name: "Sin sección", seccion: null })).toBe("Sin sección");
  });
});
