import { describe, expect, it } from "vitest";
import {
  comprobarPack,
  esquemaPack,
  problemasDeEsquema,
  type DatosPackEntrada,
} from "./pack-validacion";
import type { ProductoPieza } from "~/data/packs";

const prod = (slug: string, o: Partial<ProductoPieza> = {}): ProductoPieza => ({
  slug,
  name: slug,
  seccion: null,
  priceCents: 1000,
  consultar: false,
  activo: true,
  agotado: false,
  variantes: [],
  ...o,
});

const carta: ProductoPieza[] = [
  prod("bollos", {
    name: "Bollos",
    priceCents: null as never,
    variantes: [{ variantId: "u24", label: "24 ud", priceCents: 2400 }],
  }),
  prod("quiche", { name: "Quiche", priceCents: 1500 }),
  prod("plancha-oreo", {
    name: "Plancha de Oreo",
    seccion: "planchas",
    priceCents: null as never,
    variantes: [{ variantId: "pequena", label: "Pequeña", priceCents: 1800 }],
  }),
  prod("emp-carne", {
    name: "Empanada de carne",
    seccion: "empanadas",
    priceCents: 2000,
  }),
  prod("emp-atun", {
    name: "Empanada de atún",
    seccion: "empanadas",
    priceCents: 2200,
  }),
  prod("foto", { name: "Retrato", priceCents: 1500 }),
  prod("viejo", { name: "Viejo", priceCents: 500, activo: false }),
  prod("agot", {
    name: "Agotado",
    seccion: "quiches",
    priceCents: 500,
    agotado: true,
  }),
];

const valido = (): DatosPackEntrada => ({
  name: "Pack de prueba",
  priceCents: 3000,
  shortDescription: "Para probar",
  imageUrl: null,
  imageAlt: null,
  imageWidth: null,
  imageHeight: null,
  activo: true,
  agotado: false,
  destacado: false,
  orden: 1,
  definicion: {
    ocasion: "Prueba",
    personas: { min: 4, max: 6, texto: "4–6 personas" },
    paraQuien: ["Alguien"],
    piezas: [
      { tipo: "fija", slug: "quiche", titulo: "Quiche", descripcion: "Rica" },
      {
        tipo: "fija",
        slug: "bollos",
        variantId: "u24",
        titulo: "Bollos",
        descripcion: "Ricos",
      },
    ],
  },
});

const conPiezas = (piezas: unknown[]): DatosPackEntrada => {
  const d = valido();
  d.definicion = {
    ...d.definicion,
    piezas: piezas as DatosPackEntrada["definicion"]["piezas"],
  };
  return d;
};
const hueco = (o: Record<string, unknown> = {}) => ({
  tipo: "eleccion",
  id: "emp",
  titulo: "Empanada",
  descripcion: "x",
  etiqueta: "Sabor de la empanada",
  seccion: "empanadas",
  ...o,
});
const fija = (o: Record<string, unknown> = {}) => ({
  tipo: "fija",
  slug: "quiche",
  titulo: "t",
  descripcion: "d",
  ...o,
});

const errores = (d: DatosPackEntrada) => comprobarPack(d, carta).errores;

describe("comprobarPack", () => {
  it("un pack correcto no da errores ni avisos", () => {
    expect(comprobarPack(valido(), carta)).toEqual({ errores: [], avisos: [] });
  });

  it("nombre, descriptor, precio y personas", () => {
    const d = valido();
    d.name = "A";
    d.shortDescription = "ab";
    d.priceCents = 0;
    d.definicion.personas = { min: 8, max: 4, texto: "x" };
    expect(errores(d)).toEqual([
      { donde: "nombre", mensaje: "El nombre del pack necesita al menos 2 letras." },
      { donde: "descriptor", mensaje: expect.stringContaining("mínimo 3 letras") },
      { donde: "precio", mensaje: "El precio tiene que ser mayor que 0 €." },
      { donde: "personas", mensaje: expect.stringContaining("no puede ser mayor que el máximo") },
    ]);
  });

  it("personas: el mínimo tiene que ser al menos 1", () => {
    const d = valido();
    d.definicion.personas = { min: 0, max: 4, texto: "x" };
    expect(errores(d)).toEqual([
      { donde: "personas", mensaje: "El mínimo de personas tiene que ser al menos 1." },
    ]);
  });

  it("sin piezas", () => {
    expect(errores(conPiezas([]))).toEqual([
      { donde: "piezas", mensaje: "El pack necesita al menos una pieza." },
    ]);
  });

  it("pieza fija con un producto que no está en la carta (o es un pack)", () => {
    const e = errores(conPiezas([fija(), fija({ slug: "pack-x" })]));
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ donde: "pieza 2" });
    expect(e[0].mensaje).toContain("no existe");
  });

  it("tamaño: falta o sobra", () => {
    const e = errores(
      conPiezas([
        fija({ slug: "bollos" }),
        fija({ slug: "plancha-oreo", variantId: "XL" }),
        fija({ variantId: "XL" }),
      ]),
    );
    expect(e.map((x) => x.donde)).toEqual(["pieza 1", "pieza 2", "pieza 3"]);
    expect(e[0].mensaje).toBe("La pieza 1 es «Bollos», que tiene varios tamaños: elige uno.");
    expect(e[1].mensaje).toBe("La pieza 2 pide el tamaño «XL» y «Plancha de Oreo» no lo tiene.");
    expect(e[2].mensaje).toBe("La pieza 3 pide el tamaño «XL» y «Quiche» no lo tiene.");
  });

  it("solo una pieza con foto; rótulo sin foto vale", () => {
    expect(
      errores(conPiezas([fija({ requiereFoto: true }), fija({ slug: "foto", requiereFoto: true })])),
    ).toEqual([
      { donde: "pieza 2", mensaje: "Solo una pieza del pack puede pedir la foto del cliente." },
    ]);
    expect(errores(conPiezas([fija({ rotulo: "Algo" })]))).toEqual([]);
  });

  it("hueco: sección y slugs a la vez, o ninguno", () => {
    expect(errores(conPiezas([hueco({ slugs: ["quiche"] })]))).toEqual([
      {
        donde: "hueco «Sabor de la empanada»",
        mensaje: expect.stringContaining("una sección y una lista de productos"),
      },
    ]);
    expect(errores(conPiezas([hueco({ seccion: undefined })]))).toEqual([
      {
        donde: "hueco «Sabor de la empanada»",
        mensaje: expect.stringContaining("no dice entre qué productos se elige"),
      },
    ]);
  });

  it("hueco: lista vacía, sección desconocida, slug inexistente", () => {
    expect(errores(conPiezas([hueco({ seccion: undefined, slugs: [] })]))).toEqual([
      { donde: "hueco «Sabor de la empanada»", mensaje: expect.stringContaining("está vacía") },
    ]);
    expect(errores(conPiezas([hueco({ seccion: "inventada" })]))).toEqual([
      {
        donde: "hueco «Sabor de la empanada»",
        mensaje: expect.stringContaining("La sección «inventada»"),
      },
    ]);
    expect(
      errores(conPiezas([hueco({ seccion: undefined, slugs: ["quiche", "nada"] })])),
    ).toEqual([
      {
        donde: "hueco «Sabor de la empanada»",
        mensaje: expect.stringContaining("El producto «nada»"),
      },
    ]);
  });

  it("hueco: id repetido o mal formado", () => {
    expect(errores(conPiezas([hueco(), hueco()]))).toEqual([
      { donde: "hueco «Sabor de la empanada»", mensaje: expect.stringContaining("repite el identificador «emp»") },
    ]);
    for (const id of ["Mal Id", "a".repeat(41), ""]) {
      expect(errores(conPiezas([hueco({ id })]))).toEqual([
        { donde: "hueco «Sabor de la empanada»", mensaje: expect.stringContaining("identificador no válido") },
      ]);
    }
  });

  it("más de 8 huecos", () => {
    const huecos = Array.from({ length: 9 }, (_, i) => hueco({ id: `h${i}` }));
    expect(errores(conPiezas(huecos))).toEqual([
      { donde: "piezas", mensaje: expect.stringContaining("como máximo 8 huecos") },
    ]);
  });

  it("hueco sin ninguna opción vendible hoy: aviso, no error", () => {
    const r = comprobarPack(conPiezas([hueco({ seccion: "quiches" })]), carta);
    expect(r.errores).toEqual([]);
    expect(r.avisos).toContainEqual({
      donde: "hueco «Sabor de la empanada»",
      mensaje: "Hoy no hay ninguna opción disponible en «Sabor de la empanada»: la ficha saldrá como no disponible hasta que vuelva a haberla.",
    });
  });

  it("hueco con un tamaño que NINGÚN producto de su sección tiene: error", () => {
    expect(errores(conPiezas([hueco({ variantId: "entera" })]))).toEqual([
      { donde: "hueco «Sabor de la empanada»", mensaje: expect.stringContaining("no lo tiene ningún producto") },
    ]);
  });

  it("hueco con un tamaño que solo tiene un producto no vendible hoy: aviso", () => {
    const c = [...carta, prod("emp-vieja", { seccion: "quiches", activo: false, priceCents: null as never, variantes: [{ variantId: "entera", label: "Entera", priceCents: 900 }] })];
    const r = comprobarPack(conPiezas([hueco({ seccion: "quiches", variantId: "entera" })]), c);
    expect(r.errores).toEqual([]);
    expect(r.avisos.map((a) => a.mensaje).join(" ")).toContain("Hoy no hay ninguna opción disponible");
  });

  it("título y etiqueta no pueden quedar vacíos; la descripción sí", () => {
    expect(errores(conPiezas([fija({ titulo: "  " })]))).toEqual([
      { donde: "pieza 1", mensaje: expect.stringContaining("necesita un título") },
    ]);
    expect(errores(conPiezas([hueco({ etiqueta: " " })]))).toEqual([
      { donde: "hueco 1", mensaje: expect.stringContaining("necesita una etiqueta") },
    ]);
    expect(errores(conPiezas([hueco({ titulo: "" })]))).toEqual([
      { donde: "hueco «Sabor de la empanada»", mensaje: expect.stringContaining("necesita un título") },
    ]);
    expect(errores(conPiezas([fija({ descripcion: "" }), hueco({ descripcion: "" })]))).toEqual([]);
  });

  it("producto a consultar o sin precio: pieza fija es error; en un hueco no cuenta", () => {
    const c = [
      ...carta,
      prod("consulta", { name: "Tarta a medida", consultar: true, priceCents: 5000 }),
      prod("sin-precio", { name: "Sin precio", priceCents: null as never, seccion: "tartas-obrador" }),
      prod("consulta2", { name: "Otra", consultar: true, seccion: "tartas-obrador" }),
    ];
    const r = comprobarPack(conPiezas([fija({ slug: "consulta" }), fija({ slug: "sin-precio" })]), c);
    expect(r.errores).toEqual([
      { donde: "pieza 1", mensaje: "«Tarta a medida» no tiene precio de venta online: no se puede incluir en un pack." },
      { donde: "pieza 2", mensaje: "«Sin precio» no tiene precio de venta online: no se puede incluir en un pack." },
    ]);
    const h = comprobarPack(conPiezas([hueco({ seccion: "tartas-obrador" })]), c);
    expect(h.errores).toEqual([]);
    expect(h.avisos.some((a) => a.mensaje.includes("Hoy no hay ninguna opción"))).toBe(true);
  });

  it("aviso: precio igual o mayor que el suelto", () => {
    const d = valido();
    d.priceCents = 3900; // 1500 + 2400
    const r = comprobarPack(d, carta);
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([
      { donde: "precio", mensaje: expect.stringContaining("no ahorra nada") },
    ]);
  });

  it("aviso: el pack sale a menos de la mitad de sus piezas", () => {
    const d = valido();
    d.priceCents = 1000; // suelto 3900
    expect(comprobarPack(d, carta).avisos).toEqual([
      { donde: "precio", mensaje: "El pack sale a menos de la mitad de lo que cuestan sus piezas: ¿está bien escrito el precio?" },
    ]);
    d.priceCents = 1950; // justo la mitad: sin aviso
    expect(comprobarPack(d, carta).avisos).toEqual([]);
  });

  it("aviso: pieza fija agotada o desactivada", () => {
    const r = comprobarPack(conPiezas([fija({ slug: "viejo" }), fija({ slug: "agot" })]), carta);
    expect(r.errores).toEqual([]);
    expect(r.avisos.filter((a) => a.mensaje.includes("no disponible"))).toHaveLength(2);
  });

  it("hueco válido con opciones vendibles", () => {
    expect(comprobarPack(conPiezas([hueco(), fija()]), carta).errores).toEqual([]);
  });
});

describe("esquemaPack", () => {
  it("destacado por defecto false; imagen, orden y medidas acotados", () => {
    const { destacado: _d, ...sin } = valido();
    const r = esquemaPack.safeParse(sin);
    expect(r.success && r.data.destacado).toBe(false);
    const ok = (o: object) => esquemaPack.safeParse({ ...valido(), ...o }).success;
    expect(ok({ imageUrl: "no es una url" })).toBe(false);
    expect(ok({ imageUrl: "https://x.test/a.jpg" })).toBe(true);
    expect(ok({ orden: -1 })).toBe(false);
    expect(ok({ orden: 0 })).toBe(true);
    expect(ok({ imageWidth: 0 })).toBe(false);
    expect(ok({ imageHeight: 0 })).toBe(false);
  });

  it("acepta lo que manda el panel", () => {
    expect(esquemaPack.safeParse(valido()).success).toBe(true);
  });
  it("rechaza precios con decimales y campos que faltan", () => {
    expect(esquemaPack.safeParse({ ...valido(), priceCents: 12.5 }).success).toBe(false);
    const { name: _n, ...sin } = valido();
    expect(esquemaPack.safeParse(sin).success).toBe(false);
  });
  it("no deja pasar un slug", () => {
    const r = esquemaPack.safeParse({ ...valido(), slug: "x" });
    expect(r.success && "slug" in r.data).toBe(false);
  });
  it("acepta un hueco sin sección ni lista (lo dice comprobarPack)", () => {
    expect(esquemaPack.safeParse(conPiezas([hueco({ seccion: undefined })])).success).toBe(true);
  });
  it("rechaza personas.min menor que 1", () => {
    const d = valido();
    d.definicion.personas = { min: 0, max: 4, texto: "x" };
    expect(esquemaPack.safeParse(d).success).toBe(false);
  });
  it("acota la entrada hostil", () => {
    const ok = (d: unknown) => esquemaPack.safeParse(d).success;
    const slugs = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);
    expect(ok(conPiezas([hueco({ seccion: undefined, slugs: slugs(50) })]))).toBe(true);
    expect(ok(conPiezas([hueco({ seccion: undefined, slugs: slugs(51) })]))).toBe(false);
    expect(ok(conPiezas([hueco({ seccion: undefined, slugs: ["a".repeat(121)] })]))).toBe(false);
    expect(ok({ ...valido(), priceCents: 2 ** 31 })).toBe(false);
    expect(ok({ ...valido(), orden: 10000 })).toBe(false);
    expect(ok({ ...valido(), imageUrl: "a".repeat(501) })).toBe(false);
    expect(ok({ ...valido(), imageWidth: 20001 })).toBe(false);
    expect(ok(conPiezas([fija({ slug: "a".repeat(121) })]))).toBe(false);
    expect(ok(conPiezas([hueco({ id: "a".repeat(41) })]))).toBe(false);
  });
});

describe("problemasDeEsquema", () => {
  const fallos = (d: unknown) => {
    const r = esquemaPack.safeParse(d);
    if (r.success) throw new Error("debía fallar");
    return problemasDeEsquema(r.error.issues);
  };

  it("nombra el campo y habla en castellano", () => {
    const d = valido() as unknown as Record<string, unknown>;
    d.name = "x".repeat(200);
    d.priceCents = "mucho";
    d.orden = 99999;
    (d.definicion as { piezas: Record<string, unknown>[] }).piezas[0].titulo = "y".repeat(300);
    expect(fallos(d)).toEqual([
      { donde: "nombre", mensaje: "Es demasiado largo." },
      { donde: "precio", mensaje: "No es un número válido." },
      { donde: "orden", mensaje: "Está fuera de rango." },
      { donde: "pieza 1", mensaje: "Es demasiado largo." },
    ]);
  });

  it("un campo ausente es «Falta rellenarlo.» y sin repetir el mismo donde", () => {
    const f = fallos({ priceCents: 1 });
    expect(f.find((x) => x.donde === "nombre")).toEqual({ donde: "nombre", mensaje: "Falta rellenarlo." });
    expect(new Set(f.map((x) => x.donde)).size).toBe(f.length);
    for (const x of f) expect(x.donde).not.toMatch(/\./);
  });
});

describe("nombre sin letras", () => {
  it("«!!!» se rechaza: saldría como «noticia» en la URL", () => {
    const d = valido();
    d.name = "!!!";
    expect(errores(d)).toEqual([
      { donde: "nombre", mensaje: "El nombre tiene que llevar alguna letra o número." },
    ]);
  });
});
