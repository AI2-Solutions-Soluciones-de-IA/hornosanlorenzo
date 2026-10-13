import { describe, expect, it } from "vitest";
import {
  MAX_UNIDADES_POR_PRODUCTO,
  MAX_IMPORTE_PEDIDO_CENTS,
  LIMITE_IMPORTE_COPY,
  LIMITE_UNIDADES_COPY,
  unidadesLibres,
  productoSobreLimite,
  superaImporte,
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

  it("los avisos mandan a la oficina", () => {
    expect(LIMITE_UNIDADES_COPY).toMatch(/oficina/);
    expect(LIMITE_IMPORTE_COPY).toMatch(/oficina/);
  });
});
