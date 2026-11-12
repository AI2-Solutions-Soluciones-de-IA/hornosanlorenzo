import { describe, expect, it } from "vitest";
import { nombreConTipo } from "~/data/secciones";

describe("nombreConTipo: el producto con su tipo, fuera de la carta", () => {
  it("antepone el tipo de su sección", () => {
    expect(nombreConTipo("Bonito", "empanadas")).toBe("Empanada · Bonito");
    expect(nombreConTipo("Selva Negra", "brazos")).toBe("Brazo · Selva Negra");
    expect(nombreConTipo("Selva Negra", "tartas-obrador")).toBe("Tarta · Selva Negra");
    expect(nombreConTipo("Variados · 24 ud", "las-lorenzas")).toBe("Mini croissants dulces · Variados · 24 ud");
    expect(nombreConTipo("Salmón con Cebolla Caramelizada y Philadelphia", "supremas")).toBe(
      "Suprema de hojaldre · Salmón con Cebolla Caramelizada y Philadelphia",
    );
  });

  it("no lo repite si el nombre ya lo dice (sin mirar mayúsculas ni tildes)", () => {
    expect(nombreConTipo("Tarta Cremosa de Queso al Horno · Sin gluten", "dulce-para-todos")).toBe(
      "Tarta Cremosa de Queso al Horno · Sin gluten",
    );
    expect(nombreConTipo("Bocaditos Nata y Trufa", "bocados")).toBe("Bocaditos Nata y Trufa");
  });

  it("sin tipo en la sección, o sin sección conocida, el nombre tal cual", () => {
    expect(nombreConTipo("Pack Cumpleaños", "packs")).toBe("Pack Cumpleaños");
    expect(nombreConTipo("Barra Gallega", "pan")).toBe("Barra Gallega");
    expect(nombreConTipo("Algo", null)).toBe("Algo");
    expect(nombreConTipo("Algo", "no-existe")).toBe("Algo");
  });
});
