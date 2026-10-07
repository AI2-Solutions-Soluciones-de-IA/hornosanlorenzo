import { describe, expect, it } from "vitest";
import { correoDeOferta } from "~/lib/email/oferta";

const base = "https://hornosanlorenzo.vercel.app";
const noticia = {
  slug: "oferta-de-octubre",
  titulo: "La Santiago, a precio de oferta",
  excerpt: "Todo octubre, nuestra tarta de Santiago más barata.",
  producto: {
    name: "La Santiago",
    priceCents: 1500,
    precioAntesCents: 1700,
    ofertaHasta: "2026-10-31",
    variantes: [],
  },
};

describe("correoDeOferta", () => {
  it("lleva título, entradilla, precio rebajado con el de antes, enlace y baja", () => {
    const c = correoDeOferta(noticia, base, "tok123");
    expect(c.asunto).toBe("La Santiago, a precio de oferta");
    expect(c.texto).toContain("Todo octubre, nuestra tarta de Santiago más barata.");
    expect(c.texto).toMatch(/La Santiago: 15,00\s€ \(antes 17,00\s€\), hasta el 31 de octubre/);
    expect(c.texto).toContain(`${base}/noticias/oferta-de-octubre`);
    expect(c.texto).toContain(`${base}/baja?t=tok123`);
    expect(c.bajaUrl).toBe(`${base}/baja?t=tok123`);
  });

  it("con tamaños, un renglón por cada tamaño rebajado", () => {
    const c = correoDeOferta(
      {
        ...noticia,
        producto: {
          name: "Bombón Noir",
          priceCents: 1650,
          ofertaHasta: null,
          variantes: [
            { label: "S", priceCents: 1650 },
            { label: "M", priceCents: 2200, precioAntesCents: 2600 },
          ],
        },
      },
      base,
      "t",
    );
    expect(c.texto).toMatch(/Bombón Noir \(M\): 22,00\s€ \(antes 26,00\s€\)/);
    expect(c.texto).not.toContain("(S)");
    expect(c.texto).not.toContain("hasta el");
  });

  it("sin producto ni oferta, solo la noticia", () => {
    const c = correoDeOferta({ ...noticia, producto: null }, base, "t");
    expect(c.texto).not.toContain("antes");
    expect(c.texto).toContain(noticia.excerpt);
  });
});
