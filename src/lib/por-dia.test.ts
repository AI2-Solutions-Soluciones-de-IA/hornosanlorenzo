import { describe, expect, it } from "vitest";
import { conDiasVacios } from "~/lib/por-dia";

const fila = (dia: string, pedidos: number) => ({ dia, pedidos, productos: pedidos * 2, importeCents: pedidos * 1000 });

describe("tablas por día con los días vacíos", () => {
  it("rellena a cero los días sin pedidos, cruzando de mes", () => {
    const r = conDiasVacios([fila("2026-11-28", 23), fila("2026-11-29", 2)], "2026-11-26", "2026-12-02");
    expect(r.map((d) => d.dia)).toEqual([
      "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02",
    ]);
    expect(r[2]).toEqual(fila("2026-11-28", 23));
    expect(r[6]).toEqual({ dia: "2026-12-02", pedidos: 0, productos: 0, importeCents: 0 });
  });

  it("en rangos de más de un trimestre deja solo los días con pedidos", () => {
    const filas = [fila("2026-03-01", 1)];
    expect(conDiasVacios(filas, "2026-01-01", "2026-12-31")).toEqual(filas);
  });
});
