import { describe, expect, it } from "vitest";
import {
  comprobarPack,
  esquemaPack,
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
    expect(errores(d).map((e) => e.donde)).toEqual([
      "nombre",
      "descriptor",
      "precio",
      "personas",
    ]);
  });

  it("sin piezas", () => {
    expect(errores(conPiezas([]))).toEqual([
      expect.objectContaining({ donde: "piezas" }),
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
    expect(e[1].mensaje).toBe(
      "La pieza 2 pide el tamaño «XL» y «Plancha de Oreo» no lo tiene.",
    );
  });

  it("solo una pieza con foto; rótulo sin foto vale", () => {
    expect(
      errores(
        conPiezas([
          fija({ requiereFoto: true }),
          fija({ slug: "foto", requiereFoto: true }),
        ]),
      ),
    ).toHaveLength(1);
    expect(errores(conPiezas([fija({ rotulo: "Algo" })]))).toEqual([]);
  });

  it("hueco: sección y slugs a la vez, o ninguno", () => {
    expect(errores(conPiezas([hueco({ slugs: ["quiche"] })]))).toHaveLength(1);
    expect(errores(conPiezas([hueco({ seccion: undefined })]))).toHaveLength(1);
  });

  it("hueco: lista vacía, sección desconocida, slug inexistente", () => {
    expect(
      errores(conPiezas([hueco({ seccion: undefined, slugs: [] })])),
    ).toHaveLength(1);
    expect(errores(conPiezas([hueco({ seccion: "inventada" })]))).toHaveLength(
      1,
    );
    const e = errores(
      conPiezas([hueco({ seccion: undefined, slugs: ["quiche", "nada"] })]),
    );
    expect(e).toHaveLength(1);
    expect(e[0].donde).toBe("hueco «Sabor de la empanada»");
  });

  it("hueco: id repetido o mal formado", () => {
    expect(errores(conPiezas([hueco(), hueco()]))).toHaveLength(1);
    expect(errores(conPiezas([hueco({ id: "Mal Id" })]))).toHaveLength(1);
    expect(errores(conPiezas([hueco({ id: "a".repeat(41) })]))).toHaveLength(1);
  });

  it("más de 8 huecos", () => {
    const huecos = Array.from({ length: 9 }, (_, i) => hueco({ id: `h${i}` }));
    const e = errores(conPiezas(huecos));
    expect(e).toEqual([expect.objectContaining({ donde: "piezas" })]);
  });

  it("hueco sin ninguna opción vendible hoy", () => {
    const e = errores(conPiezas([hueco({ seccion: "quiches" })]));
    expect(e).toHaveLength(1);
    expect(e[0].mensaje).toContain("Hoy no se puede vender");
  });

  it("hueco con variante que ninguna opción tiene", () => {
    expect(errores(conPiezas([hueco({ variantId: "entera" })]))).toHaveLength(
      1,
    );
  });

  it("aviso: precio igual o mayor que el suelto", () => {
    const d = valido();
    d.priceCents = 3900; // 1500 + 2400
    const r = comprobarPack(d, carta);
    expect(r.errores).toEqual([]);
    expect(r.avisos).toEqual([expect.objectContaining({ donde: "precio" })]);
  });

  it("aviso: pieza fija agotada o desactivada", () => {
    const r = comprobarPack(
      conPiezas([fija({ slug: "viejo" }), fija({ slug: "agot" })]),
      carta,
    );
    expect(r.errores).toEqual([]);
    expect(
      r.avisos.filter((a) => a.mensaje.includes("no disponible")),
    ).toHaveLength(2);
  });

  it("hueco válido con opciones vendibles", () => {
    expect(comprobarPack(conPiezas([hueco(), fija()]), carta).errores).toEqual(
      [],
    );
  });
});

describe("esquemaPack", () => {
  it("acepta lo que manda el panel", () => {
    expect(esquemaPack.safeParse(valido()).success).toBe(true);
  });
  it("rechaza precios con decimales y campos que faltan", () => {
    expect(
      esquemaPack.safeParse({ ...valido(), priceCents: 12.5 }).success,
    ).toBe(false);
    const { name: _n, ...sin } = valido();
    expect(esquemaPack.safeParse(sin).success).toBe(false);
  });
  it("no deja pasar un slug", () => {
    const r = esquemaPack.safeParse({ ...valido(), slug: "x" });
    expect(r.success && "slug" in r.data).toBe(false);
  });
  it("acepta un hueco sin sección ni lista (lo dice comprobarPack)", () => {
    expect(
      esquemaPack.safeParse(conPiezas([hueco({ seccion: undefined })])).success,
    ).toBe(true);
  });
});
