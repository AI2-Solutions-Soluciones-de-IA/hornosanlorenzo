import { describe, expect, it } from "vitest";
import {
  aEntrada,
  borradorDesdePack,
  borradorVacio,
  centimosAEuros,
  comprobarBorrador,
  dondeDePieza,
  eurosACentimos,
  huecoVacio,
  mover,
  nuevoIdHueco,
  piezaFijaVacia,
  problemasDe,
  textoPersonas,
  type Borrador,
} from "./admin-packs-borrador";
import type { PackAdmin, ProductoCarta } from "./admin-packs-api";

const prod = (slug: string, o: Partial<ProductoCarta> = {}): ProductoCarta => ({
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

const carta: ProductoCarta[] = [
  prod("bollos", {
    name: "Bollos",
    priceCents: null,
    variantes: [{ variantId: "u24", label: "24 ud", priceCents: 2400 }],
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
];

const packAdmin = (): PackAdmin => ({
  slug: "pack-prueba",
  name: "Pack de prueba",
  priceCents: 3950,
  shortDescription: "Para probar",
  imageUrl: null,
  imageAlt: null,
  imageWidth: null,
  imageHeight: null,
  activo: true,
  agotado: false,
  orden: 10,
  definicion: {
    ocasion: "Merienda",
    personas: { min: 4, max: 6, texto: "4–6 personas" },
    paraQuien: ["Una frase"],
    consejo: "Al horno",
    piezas: [
      {
        tipo: "fija",
        slug: "bollos",
        variantId: "u24",
        titulo: "24 bollos",
        descripcion: "Tiernos",
      },
      {
        tipo: "eleccion",
        id: "empanada",
        titulo: "Una empanada",
        descripcion: "A elegir",
        etiqueta: "Sabor de la empanada",
        seccion: "empanadas",
      },
    ],
  },
  sueltoCents: 4400,
  ahorroPct: 10,
});

describe("euros ↔ céntimos", () => {
  it("acepta coma o punto y redondea", () => {
    expect(eurosACentimos("19,99")).toBe(1999);
    expect(eurosACentimos("19.99")).toBe(1999);
    expect(eurosACentimos(" 40 ")).toBe(4000);
    expect(eurosACentimos("")).toBeNull();
    expect(eurosACentimos("abc")).toBeNull();
  });
  it("muestra con coma", () => {
    expect(centimosAEuros(3950)).toBe("39,50");
  });
});

describe("nuevoIdHueco", () => {
  it("es h- y 6 minúsculas o cifras", () => {
    for (let i = 0; i < 50; i++)
      expect(nuevoIdHueco(new Set())).toMatch(/^h-[a-z0-9]{6}$/);
  });
  it("no repite uno que ya existe", () => {
    const secuencia = [0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
    let i = 0;
    const azar = () => secuencia[i++];
    const primero = nuevoIdHueco(new Set(), () => 0);
    const id = nuevoIdHueco(new Set([primero]), azar);
    expect(id).not.toBe(primero);
    expect(id).toMatch(/^h-[a-z0-9]{6}$/);
  });
});

describe("mover", () => {
  it("sube y baja sin salirse", () => {
    expect(mover(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(mover(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    const l = ["a", "b"];
    expect(mover(l, 0, -1)).toBe(l);
    expect(mover(l, 1, 1)).toBe(l);
  });
});

describe("textoPersonas", () => {
  it("propone el rango, o un número si coinciden", () => {
    expect(textoPersonas("4", "6")).toBe("4–6 personas");
    expect(textoPersonas("6", "6")).toBe("6 personas");
    expect(textoPersonas("", "6")).toBe("");
  });
});

describe("borrador ↔ entrada", () => {
  it("ida y vuelta de un pack existente conserva todo, id de hueco incluido", () => {
    const p = packAdmin();
    const { slug: _s, sueltoCents: _a, ahorroPct: _b, ...entrada } = p;
    expect(aEntrada(borradorDesdePack(p))).toEqual(entrada);
  });

  it("editar otro campo no cambia el id del hueco", () => {
    const b = borradorDesdePack(packAdmin());
    const editado: Borrador = {
      ...b,
      piezas: b.piezas.map((x) =>
        x.tipo === "eleccion" ? { ...x, etiqueta: "Otra etiqueta" } : x,
      ),
    };
    const hueco = aEntrada(editado).definicion.piezas[1];
    expect(hueco.tipo === "eleccion" && hueco.id).toBe("empanada");
  });

  it("un hueco nuevo trae id propio que no cambia al editarlo", () => {
    const h = huecoVacio(new Set(["empanada"]));
    expect(h.id).toMatch(/^h-[a-z0-9]{6}$/);
    const b = { ...borradorVacio(), piezas: [h] };
    const x = aEntrada({ ...b, piezas: [{ ...h, titulo: "Cambiado" }] })
      .definicion.piezas[0];
    expect(x.tipo === "eleccion" && x.id).toBe(h.id);
  });

  it("limpia: sin claves vacías, frases vacías fuera, consejo vacío omitido", () => {
    const b: Borrador = {
      ...borradorVacio(),
      name: "  Pack  ",
      precioEuros: "12,5",
      personasMin: "2",
      personasMax: "3",
      personasTexto: "2–3 personas",
      paraQuien: ["  Uno ", "", "   "],
      consejo: "  ",
      piezas: [
        {
          ...piezaFijaVacia(),
          slug: "emp-carne",
          titulo: "T",
          descripcion: "D",
          rotulo: "no se manda",
        },
        {
          ...huecoVacio(new Set()),
          etiqueta: " E ",
          modo: "lista",
          slugs: ["emp-carne"],
          seccion: "empanadas",
        },
      ],
    };
    const e = aEntrada(b);
    expect(e.name).toBe("Pack");
    expect(e.priceCents).toBe(1250);
    expect(e.definicion.paraQuien).toEqual(["Uno"]);
    expect("consejo" in e.definicion).toBe(false);
    expect(e.definicion.personas).toEqual({
      min: 2,
      max: 3,
      texto: "2–3 personas",
    });
    const [fija, hueco] = e.definicion.piezas;
    expect(fija).toEqual({
      tipo: "fija",
      slug: "emp-carne",
      titulo: "T",
      descripcion: "D",
    });
    expect(hueco).toMatchObject({
      tipo: "eleccion",
      etiqueta: "E",
      slugs: ["emp-carne"],
    });
    expect("seccion" in hueco).toBe(false);
    expect("variantId" in hueco).toBe(false);
  });

  it("la foto del cliente lleva su rótulo", () => {
    const b: Borrador = {
      ...borradorVacio(),
      piezas: [
        {
          ...piezaFijaVacia(),
          slug: "x",
          requiereFoto: true,
          rotulo: " Foto XL ",
        },
      ],
    };
    expect(aEntrada(b).definicion.piezas[0]).toMatchObject({
      requiereFoto: true,
      rotulo: "Foto XL",
    });
  });

  it("precio que no es número se manda como 0 (lo rechaza la validación)", () => {
    expect(
      aEntrada({ ...borradorVacio(), precioEuros: "caro" }).priceCents,
    ).toBe(0);
  });
});

describe("dónde va cada mensaje", () => {
  it("una fija es «pieza N»; un hueco, por su etiqueta o su posición", () => {
    const b = borradorDesdePack(packAdmin());
    expect(dondeDePieza(b.piezas[0], 0)).toEqual(["pieza 1"]);
    expect(dondeDePieza(b.piezas[1], 1)).toEqual([
      "pieza 2",
      "hueco «Sabor de la empanada»",
    ]);
    expect(
      dondeDePieza({ ...huecoVacio(new Set()), etiqueta: "  " }, 2),
    ).toEqual(["pieza 3", "hueco 3"]);
  });
  it("problemasDe filtra por donde", () => {
    const ps = [
      { donde: "precio", mensaje: "a" },
      { donde: "pieza 2", mensaje: "b" },
      { donde: "hueco «X»", mensaje: "c" },
    ];
    expect(
      problemasDe(ps, ["pieza 2", "hueco «X»"]).map((p) => p.mensaje),
    ).toEqual(["b", "c"]);
  });
});

describe("comprobarBorrador", () => {
  it("un pack bien hecho no da errores", () => {
    expect(
      comprobarBorrador(borradorDesdePack(packAdmin()), carta).errores,
    ).toEqual([]);
  });
  it("una fija sin producto dice que se elija, sin «»", () => {
    const b = { ...borradorDesdePack(packAdmin()), piezas: [piezaFijaVacia()] };
    const { errores } = comprobarBorrador(b, carta);
    const dePieza = problemasDe(errores, ["pieza 1"]);
    expect(dePieza.map((e) => e.mensaje)).toContain(
      "Elige el producto de la pieza 1.",
    );
    expect(dePieza.some((e) => e.mensaje.includes("«»"))).toBe(false);
  });
  it("un hueco sin sección dice que se elija, sin «»", () => {
    const b = { ...borradorDesdePack(packAdmin()), piezas: [{ ...huecoVacio(new Set()), etiqueta: "Sabor" }] };
    const msgs = comprobarBorrador(b, carta).errores.map((e) => e.mensaje);
    expect(msgs).toContain("Elige la sección de la carta del hueco «Sabor».");
    expect(msgs.some((m) => m.includes("«»"))).toBe(false);
  });
  it("avisa si no ahorra", () => {
    const b = { ...borradorDesdePack(packAdmin()), precioEuros: "50" };
    expect(comprobarBorrador(b, carta).avisos.map((a) => a.donde)).toContain(
      "precio",
    );
  });
  it("personas sin rellenar da un error de personas", () => {
    const b = { ...borradorDesdePack(packAdmin()), personasMin: "" };
    expect(comprobarBorrador(b, carta).errores.map((e) => e.donde)).toContain(
      "personas",
    );
  });
});
