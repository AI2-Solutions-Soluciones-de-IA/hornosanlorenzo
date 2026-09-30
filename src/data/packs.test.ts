import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  packs,
  packPorSlug,
  opcionesDeHueco,
  resolverPack,
  precioSueltoCents,
  ahorroPct,
  precioPorPersonaCents,
  slugsFijos,
  seccionesDeHuecos,
  etiquetaPieza,
  PackError,
  type ProductoPieza,
  type HuecoEleccion,
} from "~/data/packs";

const p = (
  slug: string,
  seccion: string | null,
  priceCents: number,
  variantes: [string, string, number][] = [],
  extra: Partial<ProductoPieza> = {},
): ProductoPieza => ({
  slug,
  name: slug,
  seccion,
  priceCents,
  consultar: false,
  activo: true,
  agotado: false,
  variantes: variantes.map(([variantId, label, cents]) => ({ variantId, label, priceCents: cents })),
  ...extra,
});

// Etiquetas reales de la carta (30-9-2026).
const EMP: [string, string, number][] = [
  ["media", "Media · 8–10 rac.", 1380],
  ["entera", "Entera · 16–20 rac.", 2280],
];
const PL: [string, string, number][] = [
  ["pequena", "L · 12–15 rac.", 1360],
  ["grande", "XL · 24–30 rac.", 2080],
];
const KG: [string, string, number][] = [
  ["medio-kg", "½ kg", 1550],
  ["kg", "1 kg", 2600],
];

const CARTA: ProductoPieza[] = [
  p("empanada-de-carne", "empanadas", 1380, EMP),
  p("empanada-de-bonito", "empanadas", 1380, EMP),
  p("empanada-bolonesa-sin-alergenos", "empanadas", 2500), // sin variantes: no vale como entera
  p("los-prenaos-de-la-casa", "para-compartir", 1050, [["u12", "12 unidades", 1050], ["u24", "24 unidades", 1850]]),
  p("plancha-oreo", "planchas", 1360, PL),
  p("plancha-fresa-y-nata", "planchas", 1360, PL),
  p("tarta-retrato", "detalles-celebracion", 600, [["pequena", "Pequeña", 1500], ["mediana", "Mediana", 1000], ["grande", "Grande", 600]]),
  p("quiche-salchicha-y-queso", "quiches", 1800),
  p("quiche-carbonara", "quiches", 1800),
  p("mini-croissants-york-y-queso", "las-lorenzas-salado", 850, [["u6", "6", 850], ["u12", "12", 1600], ["u24", "24", 3000]]),
  p("mini-croissants-surtido-salado", "las-lorenzas-salado", 1850, [["u12", "12", 1850], ["u24", "24", 3400]]),
  p("mini-croissants-surtido-dulce", "las-lorenzas", 2400),
  p("surtido-de-pastelitos", "bocados", 1550, KG),
  p("coleccion-de-petisus", "bocados", 1550, KG),
  p("suprema-salmon-cebolla-caramelizada-y-queso-crema", "supremas", 2080),
  p("hojaldritos-de-coctel", "para-compartir", 1600, [["medio-kg", "½ kg", 1600], ["kg", "1 kg", 2700]]),
  p("bocados-de-coctel", "para-compartir", 2200),
  p("tarta-salada-salmon-y-gambas", "tartas-saladas", 2500),
  p("la-bayonesa", "bizcochos", 1350),
  p("bizcocho-casero-de-chocolate", "bizcochos", 1350),
  p("bizcocho-casero-de-limon", "bizcochos", 1350),
  p("bizcocho-casero-de-zanahoria", "bizcochos", 1350),
];
const MAPA = new Map(CARTA.map((x) => [x.slug, x]));

describe("los siete packs del pptx", () => {
  // slug, precio pack, suelto, ahorro, €/persona — tabla del plan.
  const TABLA: [string, number, number, number, number][] = [
    ["pack-cumpleanos", 7100, 7710, 8, 360],
    ["pack-merienda-infantil", 4300, 4760, 10, 360],
    ["pack-futbolero", 5800, 6330, 8, 480],
    ["pack-brunch-en-casa", 5800, 6330, 8, 480],
    ["pack-gran-celebracion", 15900, 17630, 10, 660],
    ["pack-evento-especial", 5700, 6250, 9, 570],
    ["pack-reunion-oficina", 4100, 4580, 10, 340],
  ];

  it("son siete y en este orden", () => {
    expect(packs.map((d) => d.slug)).toEqual(TABLA.map((t) => t[0]));
  });

  it.each(TABLA)("%s: suelto, ahorro y €/persona cuadran con el pptx", (slug, precio, suelto, ahorro, porPersona) => {
    const def = packPorSlug(slug)!;
    expect(precioSueltoCents(def, CARTA)).toBe(suelto);
    expect(ahorroPct(precio, suelto)).toBe(ahorro);
    expect(precioPorPersonaCents(precio, def)).toBe(porPersona);
  });
});

describe("opcionesDeHueco", () => {
  const empanadaEntera = packPorSlug("pack-cumpleanos")!.piezas.find(
    (x): x is HuecoEleccion => x.tipo === "eleccion" && x.id === "empanada",
  )!;

  it("solo lo de la sección, activo, no agotado y con la variante pedida", () => {
    const carta = [
      ...CARTA,
      p("empanada-de-pollo", "empanadas", 1380, EMP, { agotado: true }),
      p("empanada-de-atun", "empanadas", 1380, EMP, { activo: false }),
    ];
    expect(opcionesDeHueco(empanadaEntera, carta).map((o) => o.slug)).toEqual([
      "empanada-de-carne",
      "empanada-de-bonito",
    ]);
  });

  it("el precio de la opción es el de la variante", () => {
    expect(opcionesDeHueco(empanadaEntera, CARTA)[0].priceCents).toBe(2280);
  });
});

describe("resolverPack", () => {
  const cumple = packPorSlug("pack-cumpleanos")!;
  const buenas = { empanada: "empanada-de-carne", plancha: "plancha-oreo" };

  it("devuelve el desglose con las elecciones", () => {
    expect(resolverPack(cumple, MAPA, buenas)).toEqual([
      { slug: "empanada-de-carne", nombre: "empanada-de-carne", varianteLabel: "Entera · 16–20 rac.", qty: 1 },
      { slug: "los-prenaos-de-la-casa", nombre: "los-prenaos-de-la-casa", varianteLabel: "24 unidades", qty: 1 },
      { slug: "plancha-oreo", nombre: "plancha-oreo", varianteLabel: "XL · 24–30 rac.", qty: 1 },
      // El rótulo sustituye a «tarta-retrato · Pequeña».
      { slug: "tarta-retrato", nombre: "Foto comestible grande, sobre la plancha", varianteLabel: null, qty: 1 },
    ]);
  });

  it("rechaza un hueco sin elegir", () => {
    expect(() => resolverPack(cumple, MAPA, { empanada: "empanada-de-carne" })).toThrow(PackError);
  });

  it("rechaza un hueco que el pack no tiene", () => {
    expect(() => resolverPack(cumple, MAPA, { ...buenas, postre: "plancha-oreo" })).toThrow(PackError);
  });

  it("rechaza un producto de otra sección puesto como empanada", () => {
    expect(() => resolverPack(cumple, MAPA, { ...buenas, empanada: "plancha-oreo" })).toThrow(PackError);
  });

  it("rechaza una empanada sin la variante entera", () => {
    expect(() =>
      resolverPack(cumple, MAPA, { ...buenas, empanada: "empanada-bolonesa-sin-alergenos" }),
    ).toThrow(PackError);
  });

  it("rechaza un sabor agotado nombrándolo", () => {
    const mapa = new Map(MAPA);
    mapa.set("plancha-oreo", { ...MAPA.get("plancha-oreo")!, name: "Plancha Oreo", agotado: true });
    expect(() => resolverPack(cumple, mapa, buenas)).toThrow(/Plancha Oreo/);
  });

  it("rechaza el pack si una pieza fija no se puede vender", () => {
    const mapa = new Map(MAPA);
    mapa.set("los-prenaos-de-la-casa", { ...MAPA.get("los-prenaos-de-la-casa")!, activo: false });
    expect(() => resolverPack(cumple, mapa, buenas)).toThrow(PackError);
  });

  it("Reunión: la elección es de la lista cerrada, no de la sección", () => {
    const reunion = packPorSlug("pack-reunion-oficina")!;
    const mapa = new Map(MAPA);
    mapa.set("napolitana", p("napolitana", "bizcochos", 1350));
    expect(() =>
      resolverPack(reunion, mapa, { empanada: "empanada-de-carne", dulce: "napolitana" }),
    ).toThrow(PackError);
    expect(
      resolverPack(reunion, mapa, { empanada: "empanada-de-carne", dulce: "la-bayonesa" }),
    ).toHaveLength(3);
  });

  it("Gran Celebración admite la misma quiche en los dos huecos", () => {
    const gran = packPorSlug("pack-gran-celebracion")!;
    const r = resolverPack(gran, MAPA, {
      empanada: "empanada-de-bonito",
      quiche1: "quiche-carbonara",
      quiche2: "quiche-carbonara",
    });
    expect(r.filter((x) => x.slug === "quiche-carbonara")).toHaveLength(2);
  });
});

describe("ahorroPct (foco de revisión 5)", () => {
  it("sin ahorro no hay porcentaje", () => {
    expect(ahorroPct(5000, 5000)).toBeNull();
    expect(ahorroPct(5100, 5000)).toBeNull();
    expect(ahorroPct(5000, null)).toBeNull();
  });

  it("un ahorro que redondea a 0 % tampoco se enseña", () => {
    expect(ahorroPct(4990, 5000)).toBeNull();
  });
});

describe("slugsFijos y seccionesDeHuecos", () => {
  it("Reunión: la pieza fija más la lista cerrada del hueco", () => {
    expect(slugsFijos(packPorSlug("pack-reunion-oficina")!).sort()).toEqual(
      [
        "mini-croissants-surtido-salado",
        "la-bayonesa",
        "bizcocho-casero-de-chocolate",
        "bizcocho-casero-de-limon",
        "bizcocho-casero-de-zanahoria",
      ].sort(),
    );
  });

  it("Cumpleaños: solo las fijas, sin empanada ni plancha (son de sección)", () => {
    expect(slugsFijos(packPorSlug("pack-cumpleanos")!).sort()).toEqual(
      ["los-prenaos-de-la-casa", "tarta-retrato"].sort(),
    );
  });

  it("Gran Celebración: las secciones de sus huecos, sin repetir", () => {
    expect(seccionesDeHuecos(packPorSlug("pack-gran-celebracion")!)).toEqual(["empanadas", "quiches"]);
  });
});

describe("etiquetaPieza", () => {
  it("con y sin variante", () => {
    expect(etiquetaPieza({ slug: "a", nombre: "Empanada", varianteLabel: "Entera", qty: 1 })).toBe("Empanada · Entera");
    expect(etiquetaPieza({ slug: "a", nombre: "Foto", varianteLabel: null, qty: 1 })).toBe("Foto");
  });
});

describe("requiereFoto", () => {
  it("solo el Pack Cumpleaños la lleva", () => {
    const con = packs.filter((d) => d.piezas.some((x) => x.tipo === "fija" && x.requiereFoto));
    expect(con.map((d) => d.slug)).toEqual(["pack-cumpleanos"]);
  });
});

// Se borra con `packs` en la Tarea 4: mientras tanto garantiza que el volcado
// que lee `scripts/volcar-packs.mjs` es fiel al código.
describe("scripts/packs-iniciales.json", () => {
  it("es idéntico al array `packs`", () => {
    const json = JSON.parse(
      readFileSync(new URL("../../scripts/packs-iniciales.json", import.meta.url), "utf8"),
    );
    expect(json).toEqual(packs);
  });
});
