import { describe, expect, it } from "vitest";
import {
  MAX_UNIDADES_POR_PRODUCTO,
  MAX_IMPORTE_PEDIDO_CENTS,
  LIMITE_IMPORTE_COPY,
  LIMITE_UNIDADES_COPY,
  unidadesLibres,
  productoSobreLimite,
  superaImporte,
  maxUnidadesDelDia,
  cabeEnElDia,
  diasSinHueco,
  unidadesTotales,
} from "~/lib/limites-pedido";

describe("límites del pedido", () => {
  it("las unidades de un producto suman todas sus líneas", () => {
    const items = [
      { slug: "bombon-noir", qty: 4 },
      { slug: "bombon-noir", qty: 3 },
      { slug: "tarta-de-queso", qty: 1 },
    ];
    expect(unidadesLibres(items, "bombon-noir")).toBe(
      MAX_UNIDADES_POR_PRODUCTO - 7,
    );
    expect(unidadesLibres(items, "otro")).toBe(MAX_UNIDADES_POR_PRODUCTO);
  });

  it("nunca quedan unidades libres negativas", () => {
    expect(unidadesLibres([{ slug: "a", qty: 50 }], "a")).toBe(0);
  });

  it("detecta el producto que pasa del límite, aunque esté repartido en líneas", () => {
    const justo = [{ slug: "a", qty: MAX_UNIDADES_POR_PRODUCTO }];
    expect(productoSobreLimite(justo)).toBeNull();
    expect(productoSobreLimite([...justo, { slug: "a", qty: 1 }])).toBe("a");
  });

  it("el importe máximo se admite; un céntimo más, no", () => {
    expect(superaImporte(MAX_IMPORTE_PEDIDO_CENTS)).toBe(false);
    expect(superaImporte(MAX_IMPORTE_PEDIDO_CENTS + 1)).toBe(true);
  });

  it("los avisos invitan a llamar y comentar el caso", () => {
    expect(LIMITE_UNIDADES_COPY).toMatch(/916 613 932 y comentarnos tu caso/);
    expect(LIMITE_IMPORTE_COPY).toMatch(/916 613 932 y comentarnos tu caso/);
  });
});

describe("capacidad del día", () => {
  it("100 de lunes a jueves y domingo; 200 viernes y sábado", () => {
    // 12-10-2026 es lunes (festivo: da igual, cuenta el día de la semana).
    const semana = ["12", "13", "14", "15", "16", "17", "18"].map((d) =>
      maxUnidadesDelDia(`2026-10-${d}`),
    );
    expect(semana).toEqual([100, 100, 100, 100, 200, 200, 100]);
  });

  it("cabe justo hasta el máximo; una unidad más, no", () => {
    expect(cabeEnElDia("2026-10-14", 95, 5)).toBe(true);
    expect(cabeEnElDia("2026-10-14", 95, 6)).toBe(false);
    expect(cabeEnElDia("2026-10-16", 190, 10)).toBe(true);
    expect(cabeEnElDia("2026-10-16", 190, 11)).toBe(false);
  });
});

describe("días sin hueco", () => {
  it("marca los días en que no cabe el pedido, con el máximo de cada día", () => {
    // Jueves 15 (100), viernes 16 (200), sábado 17 (200), domingo 18 (100).
    const encargadas = new Map([
      ["2026-10-15", 95],
      ["2026-10-16", 190],
      ["2026-10-17", 196],
    ]);
    expect(diasSinHueco("2026-10-15", "2026-10-18", encargadas, 6)).toEqual([
      "2026-10-15",
      "2026-10-17",
    ]);
  });
});

describe("unidades para la capacidad del día", () => {
  it("un pack suma los productos que lleva, por cada pack", () => {
    const items = [
      { qty: 3 },
      // En el carrito, el desglose es texto: una pieza por entrada.
      { qty: 2, detalle: ["Empanada: carne", "Tortilla", "Plancha con foto"] },
      // En el servidor, piezas con su cantidad por pack.
      { qty: 1, detalle: [{ qty: 2 }, { qty: 1 }] },
    ];
    expect(unidadesTotales(items)).toBe(3 + 2 * 3 + 3);
  });
});
