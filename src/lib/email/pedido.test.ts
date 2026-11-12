import { describe, expect, it } from "vitest";
import {
  correoCliente,
  correoObrador,
  type DatosPedido,
} from "~/lib/email/pedido";

const base: DatosPedido = {
  totalCents: 5250,
  lineas: [
    { qty: 2, nombre: "Empanada de Atún · 6 rac.", importeCents: 5000 },
    { qty: 1, nombre: "Croissant", importeCents: 250 },
  ],
  modalidad: "Recogida en tienda",
  dia: "sábado 7 de noviembre",
  franja: "Mañana",
  destino: "Pozuelo — Avda. Europa 28, entrada por C/ América",
  aDomicilio: false,
  tiendaId: "pozuelo",
  nombre: "Lucía",
  email: "lucia@example.com",
  telefono: "+34600111222",
  notas: "Sin velas",
  referencia: "cs_live_abc",
};

describe("correoObrador", () => {
  it("lleva lo necesario para prepararlo y llamar: líneas, día, teléfono y referencia", () => {
    const c = correoObrador(base);
    expect(c.asunto).toBe(
      "Pedido web — Recogida en tienda · sábado 7 de noviembre · 52,50 €",
    );
    for (const t of [c.texto, c.html]) {
      expect(t).toContain("Empanada de Atún");
      expect(t).toContain("+34600111222");
      expect(t).toContain("cs_live_abc");
      expect(t).toContain("Sin velas");
    }
  });

  it("escapa lo que escribe el cliente en el HTML", () => {
    const c = correoObrador({ ...base, notas: "<script>alert(1)</script>" });
    expect(c.html).not.toContain("<script>");
    expect(c.html).toContain("&lt;script&gt;");
  });
});

describe("correoCliente", () => {
  it("da el teléfono de la tienda donde recoge, sin número de pedido", () => {
    const c = correoCliente(base);
    expect(c.asunto).toBe("Tu pedido en Horno San Lorenzo");
    expect(c.texto).not.toMatch(/número de pedido|nº/);
    expect(c.texto).toContain("Está a nombre de Lucía");
    expect(c.html).toContain("Está a nombre de <strong>Lucía");
    expect(c.texto).toContain("¡Gracias, Lucía!");
    expect(c.texto).toContain("91 605 90 56 (Pozuelo)");
    expect(c.html).toContain('href="tel:+34916059056"');
    // Al cliente no se le repiten sus propios datos de contacto.
    expect(c.texto).not.toContain("+34600111222");
  });

  it("a domicilio, el teléfono del obrador de Alcobendas", () => {
    const c = correoCliente({
      ...base,
      aDomicilio: true,
      tiendaId: undefined,
      modalidad: "Envío a domicilio",
      destino: "C/ Mayor 1 · 28013",
    });
    expect(c.texto).toContain("916 613 932 (Alcobendas)");
    expect(c.texto).toContain("Dirección: C/ Mayor 1 · 28013");
  });

  it("sin nombre sigue siendo legible", () => {
    const c = correoCliente({ ...base, nombre: undefined });
    expect(c.asunto).toBe("Tu pedido en Horno San Lorenzo");
    expect(c.texto.startsWith("¡Gracias por tu pedido!")).toBe(true);
  });
});
