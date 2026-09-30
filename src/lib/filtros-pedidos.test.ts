import { describe, expect, it } from "vitest";
import { leerFiltrosPedidos, queryFiltros } from "~/lib/filtros-pedidos";

const leer = (q: string) => leerFiltrosPedidos(new URLSearchParams(q));

describe("filtros de /admin/pedidos", () => {
  it("sin nada: por entrega, página 1, sin filtro", () => {
    expect(leer("")).toMatchObject({
      tipo: "entrega",
      pagina: 1,
      hayFiltro: false,
      texto: "",
    });
  });

  it("un rango de entrega va a entregaDesde/entregaHasta", () => {
    const f = leer("fecha=entrega&desde=2026-10-01&hasta=2026-10-07");
    expect(f.filtros).toEqual({
      entregaDesde: "2026-10-01",
      entregaHasta: "2026-10-07",
      texto: undefined,
    });
  });

  it("un rango de entrada va a entradaDesde/entradaHasta", () => {
    const f = leer("fecha=entrada&desde=2026-10-01");
    expect(f.filtros).toEqual({
      entradaDesde: "2026-10-01",
      entradaHasta: undefined,
      texto: undefined,
    });
    expect(f.hayFiltro).toBe(true);
  });

  it("un rango al revés se da la vuelta", () => {
    expect(leer("desde=2026-10-07&hasta=2026-10-01")).toMatchObject({
      desde: "2026-10-01",
      hasta: "2026-10-07",
    });
  });

  it("lo que no es fecha ni página válida se ignora", () => {
    const f = leer("desde=ayer&hasta=2026-13&pagina=-3");
    expect(f).toMatchObject({
      desde: undefined,
      hasta: undefined,
      pagina: 1,
      hayFiltro: false,
    });
    expect(leer("pagina=abc").pagina).toBe(1);
    expect(leer("pagina=4").pagina).toBe(4);
  });

  it("entiende los enlaces viejos de un solo día", () => {
    expect(leer("entrega=2026-09-16")).toMatchObject({
      tipo: "entrega",
      desde: "2026-09-16",
      hasta: "2026-09-16",
    });
    expect(leer("entrada=2026-09-16")).toMatchObject({
      tipo: "entrada",
      desde: "2026-09-16",
    });
  });

  it("recorta la búsqueda a 80 caracteres y quita espacios", () => {
    expect(leer(`q=${"x".repeat(100)}`).texto).toHaveLength(80);
    expect(leer("q=%20%20ana%20").filtros.texto).toBe("ana");
  });

  it("queryFiltros solo lleva lo que hay", () => {
    expect(queryFiltros({ tipo: "entrega", texto: "" }).toString()).toBe(
      "fecha=entrega",
    );
    expect(
      queryFiltros({
        tipo: "entrada",
        desde: "2026-10-01",
        hasta: "2026-10-02",
        texto: "ana",
      }).toString(),
    ).toBe("fecha=entrada&desde=2026-10-01&hasta=2026-10-02&q=ana");
  });
});
