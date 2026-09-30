import { describe, expect, it } from "vitest";
import { leerPagina, numerosPagina, paginar, resumenPagina } from "~/lib/paginacion";

describe("paginación del panel", () => {
  it("cuenta páginas y posiciones", () => {
    expect(paginar(45, 20, 1)).toEqual({ pagina: 1, paginas: 3, desde: 1, hasta: 20 });
    expect(paginar(45, 20, 3)).toEqual({ pagina: 3, paginas: 3, desde: 41, hasta: 45 });
    expect(paginar(40, 20, 2)).toEqual({ pagina: 2, paginas: 2, desde: 21, hasta: 40 });
  });

  it("una página pedida fuera de rango se acota", () => {
    expect(paginar(45, 20, 99).pagina).toBe(3);
    expect(paginar(45, 20, 0).pagina).toBe(1);
    expect(paginar(45, 20, -4).pagina).toBe(1);
  });

  it("sin elementos, una página vacía", () => {
    expect(paginar(0, 20, 5)).toEqual({ pagina: 1, paginas: 1, desde: 0, hasta: 0 });
  });

  it("lee ?pagina= y lo que no vale es la 1", () => {
    const p = (q: string) => leerPagina(new URLSearchParams(q));
    expect(p("pagina=4")).toBe(4);
    expect(p("pagina=0")).toBe(1);
    expect(p("pagina=-2")).toBe(1);
    expect(p("pagina=abc")).toBe(1);
    expect(p("")).toBe(1);
  });

  it("resume con «…» las páginas lejanas", () => {
    expect(numerosPagina(1, 1)).toEqual([1]);
    expect(numerosPagina(2, 3)).toEqual([1, 2, 3]);
    expect(numerosPagina(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
    expect(numerosPagina(1, 20)).toEqual([1, 2, "…", 20]);
    expect(numerosPagina(20, 20)).toEqual([1, "…", 19, 20]);
  });

  it("el resumen dice lo que se ve", () => {
    expect(resumenPagina(paginar(1, 20, 1), 1, "pedido", "pedidos")).toBe("1 pedido");
    expect(resumenPagina(paginar(7, 20, 1), 7, "pedido", "pedidos")).toBe("7 pedidos");
    expect(resumenPagina(paginar(45, 20, 2), 45, "pedido", "pedidos")).toBe("21–40 de 45 pedidos");
  });
});
