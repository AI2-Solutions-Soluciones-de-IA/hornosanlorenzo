import { describe, expect, it } from "vitest";
import type { ProductoPieza } from "~/data/packs";
import { packInicial } from "~/tests/packs-iniciales";
import { fichaPack, seCompraDesdeLaFicha } from "~/lib/pack-ficha";

const p = (
  slug: string,
  seccion: string | null,
  priceCents: number,
  variantes: [string, string, number][] = [],
  extra: Partial<ProductoPieza> = {},
): ProductoPieza => ({
  slug,
  name: `Nombre de ${slug}`,
  seccion,
  priceCents,
  consultar: false,
  activo: true,
  agotado: false,
  variantes: variantes.map(([variantId, label, cents]) => ({ variantId, label, priceCents: cents })),
  ...extra,
});

const EMP: [string, string, number][] = [
  ["media", "Media · 8–10 rac.", 1380],
  ["entera", "Entera · 16–20 rac.", 2280],
];
const PL: [string, string, number][] = [
  ["pequena", "L · 12–15 rac.", 1360],
  ["grande", "XL · 24–30 rac.", 2080],
];

// Lo que lleva el Pack Cumpleaños, con los precios de la carta del 30-9-2026.
const CARTA: ProductoPieza[] = [
  p("empanada-de-carne", "empanadas", 1380, EMP),
  p("empanada-de-bonito", "empanadas", 1380, EMP),
  p("los-prenaos-de-la-casa", "para-compartir", 1050, [["u12", "12 unidades", 1050], ["u24", "24 unidades", 1850]]),
  p("plancha-oreo", "planchas", 1360, PL),
  p("tarta-retrato", "detalles-celebracion", 600, [["pequena", "Pequeña", 1500]]),
];

const cumple = packInicial("pack-cumpleanos");
const PACK = { priceCents: 7100, consultar: false, agotado: false };

describe("fichaPack", () => {
  it("las piezas en su orden, con las opciones filtradas y sin precios", () => {
    const f = fichaPack(cumple, PACK, CARTA);
    expect(f.piezas).toEqual([
      {
        tipo: "eleccion",
        id: "empanada",
        titulo: "1 empanada entera, sabor a elegir (16–20 rac.)",
        etiqueta: "Sabor de la empanada",
        opciones: [
          { slug: "empanada-de-carne", name: "Nombre de empanada-de-carne" },
          { slug: "empanada-de-bonito", name: "Nombre de empanada-de-bonito" },
        ],
      },
      { tipo: "fija", texto: "24 bollos preñaos asturianos" },
      {
        tipo: "eleccion",
        id: "plancha",
        titulo: "1 plancha grande a elegir (24–30 rac.)",
        etiqueta: "Sabor de la plancha",
        opciones: [{ slug: "plancha-oreo", name: "Nombre de plancha-oreo" }],
      },
      { tipo: "fija", texto: "Foto grande comestible personalizada" },
    ]);
  });

  it("las cuentas del pptx: 77,10 € suelto, −8 %, 3,60 € por persona; con foto y a la venta", () => {
    const f = fichaPack(cumple, PACK, CARTA);
    expect(f).toMatchObject({ sueltoCents: 7710, ahorro: 8, porPersonaCents: 360, conFoto: true, agotado: false });
  });

  it("solo el Cumpleaños lleva foto", () => {
    expect(fichaPack(packInicial("pack-futbolero"), PACK, CARTA).conFoto).toBe(false);
  });

  it("agotado si un hueco se queda sin opciones", () => {
    const sinPlanchas = CARTA.map((x) => (x.seccion === "planchas" ? { ...x, agotado: true } : x));
    expect(fichaPack(cumple, PACK, sinPlanchas).agotado).toBe(true);
  });

  it("agotado si una pieza fija no se puede vender (desactivada o sin la variante)", () => {
    const sinPrenaos = CARTA.map((x) => (x.slug === "los-prenaos-de-la-casa" ? { ...x, activo: false } : x));
    expect(fichaPack(cumple, PACK, sinPrenaos).agotado).toBe(true);
    const sinU24 = CARTA.map((x) =>
      x.slug === "los-prenaos-de-la-casa" ? { ...x, variantes: x.variantes.slice(0, 1) } : x,
    );
    expect(fichaPack(cumple, PACK, sinU24).agotado).toBe(true);
    expect(fichaPack(cumple, PACK, CARTA.filter((x) => x.slug !== "tarta-retrato")).agotado).toBe(true);
  });

  it("agotado si el propio pack está agotado, a consultar o sin precio", () => {
    expect(fichaPack(cumple, { ...PACK, agotado: true }, CARTA).agotado).toBe(true);
    expect(fichaPack(cumple, { ...PACK, consultar: true }, CARTA).agotado).toBe(true);
    const sinPrecio = fichaPack(cumple, { ...PACK, priceCents: null }, CARTA);
    expect(sinPrecio).toMatchObject({ agotado: true, ahorro: null, porPersonaCents: null });
  });
});

describe("seCompraDesdeLaFicha", () => {
  it("solo los packs: sin elegir sabores ni foto, la compra rápida acabaría rechazada", () => {
    expect(seCompraDesdeLaFicha({ category: "packs" })).toBe(true);
    expect(seCompraDesdeLaFicha({ category: "tartas" })).toBe(false);
    expect(seCompraDesdeLaFicha({ category: "salado" })).toBe(false);
  });
});
