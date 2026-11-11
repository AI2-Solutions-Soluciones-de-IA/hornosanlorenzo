import { describe, expect, it } from "vitest";
import { avisoDeCupo, gastadoDe } from "~/lib/email/cupo";

const AHORA = new Date("2026-11-12T23:30:00Z");

describe("gastadoDe", () => {
  it("lee las dos cabeceras, sin importar mayúsculas", () => {
    expect(gastadoDe({ "X-Resend-Daily-Quota": "81", "x-resend-monthly-quota": "900" })).toEqual({ dia: 81, mes: 900 });
  });
  it("sin cabeceras (o con basura), null", () => {
    expect(gastadoDe(null)).toEqual({ dia: null, mes: null });
    expect(gastadoDe({ "x-resend-daily-quota": "" , "x-resend-monthly-quota": "abc" })).toEqual({ dia: null, mes: null });
  });
});

describe("avisoDeCupo", () => {
  it("por debajo de los umbrales, nada", () => {
    expect(avisoDeCupo({ dia: 79, mes: 2399 }, AHORA)).toBeNull();
    expect(avisoDeCupo({ dia: null, mes: null }, AHORA)).toBeNull();
  });
  it("desde 80 en el día, aviso diario con la clave del día UTC", () => {
    const a = avisoDeCupo({ dia: 80, mes: 500 }, AHORA)!;
    expect(a.clave).toBe("dia:2026-11-12");
    expect(a.asunto).toContain("80 de 100");
    expect(a.texto).toContain("se seguirán cobrando");
  });
  it("desde 2.400 en el mes, el mensual (aunque también se pase el diario)", () => {
    const a = avisoDeCupo({ dia: 95, mes: 2400 }, AHORA)!;
    expect(a.clave).toBe("mes:2026-11");
    expect(a.asunto).toContain("2400 de 3000");
  });
});
