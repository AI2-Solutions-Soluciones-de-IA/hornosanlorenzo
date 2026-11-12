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

  it("filtra por tienda de recogida o envío a domicilio; lo demás se ignora", () => {
    const f = leer("destino=pozuelo");
    expect(f.filtros.destino).toBe("pozuelo");
    expect(f.hayFiltro).toBe(true);
    expect(queryFiltros(f).get("destino")).toBe("pozuelo");
    expect(leer("destino=domicilio").filtros.destino).toBe("domicilio");
    const raro = leer("destino=madrid");
    expect(raro.filtros.destino).toBeUndefined();
    expect(raro.hayFiltro).toBe(false);
    expect(queryFiltros(raro).has("destino")).toBe(false);
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

  it("procesado: solo «si» o «no»; lo demás no filtra", () => {
    expect(leer("procesado=no").filtros.procesado).toBe(false);
    expect(leer("procesado=si").filtros.procesado).toBe(true);
    expect(leer("procesado=si").hayFiltro).toBe(true);
    expect(leer("procesado=quizas").filtros.procesado).toBeUndefined();
    expect(queryFiltros({ tipo: "entrega", texto: "", procesado: "no" }).toString()).toBe(
      "fecha=entrega&procesado=no",
    );
  });

  it("archivo: por defecto activos; «si» o «todos», y lo demás no filtra", () => {
    expect(leer("").filtros.archivo).toBeUndefined();
    expect(leer("").hayFiltro).toBe(false);
    expect(leer("archivo=si").filtros.archivo).toBe("si");
    expect(leer("archivo=todos").filtros.archivo).toBe("todos");
    expect(leer("archivo=si").hayFiltro).toBe(true);
    expect(leer("archivo=otro").filtros.archivo).toBeUndefined();
    expect(queryFiltros({ tipo: "entrega", texto: "", archivo: "si" }).toString()).toBe("fecha=entrega&archivo=si");
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
