import { describe, expect, it } from "vitest";
import { partesDelRanking } from "~/lib/ranking";
import type { ProductoEnRanking } from "~/lib/db/estadisticas";

const fila = (slug: string | null, unidades: number): ProductoEnRanking => ({
  slug,
  nombre: slug ?? "Fuera de carta",
  categoria: slug ? "tartas" : null,
  unidades,
  importeCents: unidades * 100,
  pedidos: unidades,
});

// Tal cual llega de la base: de más a menos, «Fuera de carta» al final.
const ranking = [
  fila("a", 9),
  fila("b", 7),
  fila("c", 3),
  fila("d", 1),
  fila("e", 0),
  fila("f", 0),
  fila(null, 4),
];

describe("partesDelRanking", () => {
  it("los que más: solo los que han vendido algo, en el orden de la base", () => {
    expect(partesDelRanking(ranking, 3).masVendidos.map((p) => p.slug)).toEqual(
      ["a", "b", "c"],
    );
    expect(
      partesDelRanking(ranking, 10).masVendidos.map((p) => p.slug),
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("los que menos: empiezan por los que no venden nada", () => {
    expect(
      partesDelRanking(ranking, 3).menosVendidos.map((p) => p.slug),
    ).toEqual(["f", "e", "d"]);
  });

  it("«Fuera de carta» no entra en ninguna de las dos listas, pero se devuelve aparte", () => {
    const partes = partesDelRanking(ranking, 10);
    expect(partes.masVendidos.some((p) => p.slug === null)).toBe(false);
    expect(partes.menosVendidos.some((p) => p.slug === null)).toBe(false);
    expect(partes.fueraDeCarta?.unidades).toBe(4);
  });

  it("sin ventas en el rango, la lista de los que más está vacía y la de los que menos no", () => {
    const ceros = [fila("a", 0), fila("b", 0)];
    const partes = partesDelRanking(ceros, 10);
    expect(partes.masVendidos).toEqual([]);
    expect(partes.menosVendidos.map((p) => p.slug)).toEqual(["b", "a"]);
    expect(partes.fueraDeCarta).toBeNull();
  });
});
