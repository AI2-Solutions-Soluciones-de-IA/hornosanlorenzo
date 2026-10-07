import { describe, expect, it } from "vitest";
import { aplicaOferta, compruebaPrecioOferta, juntaOfertas, type OfertaProducto } from "~/lib/ofertas";

const conTamanos = {
  slug: "bombon-noir",
  priceCents: 1650,
  variantes: [
    { variantId: "s", label: "S", priceCents: 1650 },
    { variantId: "m", label: "M", priceCents: 2200 },
  ],
};
const sinTamanos = { slug: "empanada", priceCents: 1800, variantes: [] };
const porId = (v: { variantId: string }) => v.variantId;

const oferta = (o: Partial<OfertaProducto>): OfertaProducto => ({
  precioCents: null,
  variantes: {},
  hasta: null,
  ...o,
});

describe("aplicaOferta", () => {
  it("sin oferta deja el producto tal cual", () => {
    expect(aplicaOferta(sinTamanos, undefined, porId)).toEqual(sinTamanos);
  });

  it("baja el precio y guarda el de siempre para tacharlo", () => {
    const r = aplicaOferta(
      sinTamanos,
      oferta({ precioCents: 1500, hasta: "2026-10-31" }),
      porId,
    );
    expect(r.priceCents).toBe(1500);
    expect(r.precioAntesCents).toBe(1800);
    expect(r.ofertaHasta).toBe("2026-10-31");
  });

  it("un precio de oferta que no baja nada no se aplica", () => {
    const r = aplicaOferta(sinTamanos, oferta({ precioCents: 1800 }), porId);
    expect(r.priceCents).toBe(1800);
    expect(r.precioAntesCents).toBeUndefined();
    expect(r.ofertaHasta).toBeUndefined();
  });

  it("un producto sin precio (a consultar) no gana uno por la oferta", () => {
    const r = aplicaOferta(
      { ...sinTamanos, priceCents: null },
      oferta({ precioCents: 900 }),
      porId,
    );
    expect(r.priceCents).toBeNull();
    expect(r.precioAntesCents).toBeUndefined();
  });

  it("con tamaños, cada uno lleva su oferta y los que no tienen se quedan igual", () => {
    const r = aplicaOferta(
      conTamanos,
      oferta({ variantes: { m: 1900 } }),
      porId,
    );
    expect(r.variantes).toEqual([
      { variantId: "s", label: "S", priceCents: 1650 },
      { variantId: "m", label: "M", priceCents: 1900, precioAntesCents: 2200 },
    ]);
    // El precio base no se toca: el de un producto con tamaños es el de cada tamaño.
    expect(r.priceCents).toBe(1650);
    expect(r.ofertaHasta).toBeNull();
  });

  it("no cambia el producto original", () => {
    aplicaOferta(conTamanos, oferta({ variantes: { s: 1000 } }), porId);
    expect(conTamanos.variantes[0].priceCents).toBe(1650);
  });
});

describe("juntaOfertas", () => {
  it("dos noticias con oferta del mismo producto: gana el precio más bajo", () => {
    const m = juntaOfertas([
      {
        slug: "a",
        precioCents: 1500,
        variantes: { s: 900 },
        hasta: "2026-10-10",
      },
      {
        slug: "a",
        precioCents: 1400,
        variantes: { s: 950, m: 1200 },
        hasta: "2026-10-20",
      },
    ]);
    expect(m.get("a")).toEqual({
      precioCents: 1400,
      variantes: { s: 900, m: 1200 },
      hasta: "2026-10-20",
    });
  });

  it("si una de ellas no caduca, el conjunto tampoco tiene fecha de fin", () => {
    const m = juntaOfertas([
      { slug: "a", precioCents: 1500, variantes: {}, hasta: "2026-10-10" },
      { slug: "a", precioCents: 1600, variantes: {}, hasta: null },
    ]);
    expect(m.get("a")?.hasta).toBeNull();
  });
});

describe("compruebaPrecioOferta", () => {
  const simple = { name: "Tarta", consultar: false, priceCents: 1850, variantes: [] };
  const conTamanos = {
    name: "Roscón",
    consultar: false,
    priceCents: 1800,
    variantes: [{ variantId: "m", label: "M", priceCents: 2600 }],
  };

  it("sin precio de oferta no hay nada que comprobar", () => {
    expect(compruebaPrecioOferta(simple, null, {})).toBeNull();
  });

  it("acepta una rebaja y rechaza un precio igual o mayor", () => {
    expect(compruebaPrecioOferta(simple, 1500, {})).toBeNull();
    expect(compruebaPrecioOferta(simple, 1850, {})).toMatch(/menor/);
  });

  it("con tamaños pide el precio por tamaño, y que el tamaño exista", () => {
    expect(compruebaPrecioOferta(conTamanos, 1500, {})).toMatch(/cada tamaño/);
    expect(compruebaPrecioOferta(conTamanos, null, { m: 2000 })).toBeNull();
    expect(compruebaPrecioOferta(conTamanos, null, { xl: 2000 })).toMatch(/ya no existe/);
  });

  it("un producto a consultar no admite oferta", () => {
    expect(compruebaPrecioOferta({ ...simple, consultar: true }, 1000, {})).toMatch(/consultar|precio de venta/);
  });
});
