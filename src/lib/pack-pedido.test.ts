import { describe, expect, it } from "vitest";
import { detallePack, faltaParaAnadir, type PiezaPedido } from "~/lib/pack-pedido";

const QUICHES = [
  { slug: "quiche-carbonara", name: "Quiche carbonara" },
  { slug: "quiche-lorraine", name: "Quiche lorraine" },
];

// Gran Celebración, recortado: dos huecos de la misma sección y una fija en medio.
const PIEZAS: PiezaPedido[] = [
  { tipo: "eleccion", id: "quiche1", titulo: "1 quiche", etiqueta: "Primera quiche", opciones: QUICHES },
  { tipo: "fija", texto: "24 bollos preñaos asturianos" },
  { tipo: "eleccion", id: "quiche2", titulo: "1 quiche", etiqueta: "Segunda quiche", opciones: QUICHES },
];

describe("detallePack", () => {
  it("cada pieza en su orden: la fija tal cual y la elegida con la etiqueta del hueco", () => {
    expect(detallePack(PIEZAS, { quiche1: "quiche-carbonara", quiche2: "quiche-lorraine" })).toEqual([
      "Primera quiche: Quiche carbonara",
      "24 bollos preñaos asturianos",
      "Segunda quiche: Quiche lorraine",
    ]);
  });

  it("dos huecos con la misma etiqueta y la misma opción dan dos líneas iguales (el carrito no puede usarlas de clave)", () => {
    const iguales: PiezaPedido[] = PIEZAS.map((p) => (p.tipo === "eleccion" ? { ...p, etiqueta: "Sabor de la quiche" } : p));
    const detalle = detallePack(iguales, { quiche1: "quiche-carbonara", quiche2: "quiche-carbonara" })!;
    expect(detalle[0]).toBe(detalle[2]);
  });

  it("null si falta un hueco o la elección no es una de sus opciones", () => {
    expect(detallePack(PIEZAS, { quiche1: "quiche-carbonara" })).toBeNull();
    expect(detallePack(PIEZAS, { quiche1: "quiche-carbonara", quiche2: "empanada-de-carne" })).toBeNull();
  });
});

describe("faltaParaAnadir", () => {
  const todo = { quiche1: "quiche-carbonara", quiche2: "quiche-lorraine" };

  it("pide el primer hueco sin elegir, con su etiqueta", () => {
    expect(faltaParaAnadir(PIEZAS, { quiche1: "quiche-carbonara" }, { exigida: false, url: null })).toBe(
      "Elige segunda quiche.",
    );
  });

  it("con foto exigida, no basta con elegir", () => {
    expect(faltaParaAnadir(PIEZAS, todo, { exigida: true, url: null })).toBe("Sube tu foto para la plancha.");
    expect(faltaParaAnadir(PIEZAS, todo, { exigida: true, url: "https://x/y.jpg" })).toBeNull();
  });

  it("sin foto exigida y todo elegido, nada", () => {
    expect(faltaParaAnadir(PIEZAS, todo, { exigida: false, url: null })).toBeNull();
  });
});
