import { describe, expect, it } from "vitest";
import {
  admiteCP,
  earliestDate,
  esTelefonoValido,
  franjasRecogida,
  isClosed,
  isDateAllowed,
  meetsMinimum,
  minimoPedidoCents,
} from "~/lib/entrega";

describe("esTelefonoValido", () => {
  it("acepta un móvil con espacios y con prefijo", () => {
    expect(esTelefonoValido("666 12 34 56")).toBe(true);
    expect(esTelefonoValido("+34 666123456")).toBe(true);
  });

  it("acepta un fijo de Madrid", () => {
    expect(esTelefonoValido("916613932")).toBe(true);
  });

  it("rechaza lo que no son nueve dígitos españoles", () => {
    expect(esTelefonoValido("12345")).toBe(false);
    expect(esTelefonoValido("1234567890")).toBe(false);
  });
});

describe("admiteCP", () => {
  it("acepta la zona de reparto", () => {
    expect(admiteCP("28001")).toBe(true);
    expect(admiteCP("28760")).toBe(true);
  });

  it("rechaza fuera de zona y formatos malos", () => {
    expect(admiteCP("08001")).toBe(false);
    expect(admiteCP("28056")).toBe(false);
    expect(admiteCP("2800")).toBe(false);
  });
});

describe("minimoPedidoCents", () => {
  it("la recogida no tiene mínimo", () => {
    expect(minimoPedidoCents("recogida", "2026-10-02")).toBe(0);
  });

  it("25 € de lunes a jueves", () => {
    // Semana del 28-9-2026: lunes a jueves, sin festivos al día siguiente.
    for (const iso of [
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
    ]) {
      expect(minimoPedidoCents("domicilio", iso)).toBe(2500);
    }
  });

  it("35 € viernes y sábado", () => {
    expect(minimoPedidoCents("domicilio", "2026-10-02")).toBe(3500);
    expect(minimoPedidoCents("domicilio", "2026-10-03")).toBe(3500);
  });

  it("35 € la víspera de un festivo entre semana", () => {
    // Lunes 7 de diciembre es festivo: el martes 8 también, y el 7 es su víspera.
    expect(minimoPedidoCents("domicilio", "2026-12-07")).toBe(3500);
    // Jueves 24 de diciembre, víspera de Navidad.
    expect(minimoPedidoCents("domicilio", "2026-12-24")).toBe(3500);
    // Jueves 31 de diciembre, víspera de Año Nuevo, cruzando de año.
    expect(minimoPedidoCents("domicilio", "2026-12-31")).toBe(3500);
    // Miércoles 9 de diciembre, día corriente después del puente.
    expect(minimoPedidoCents("domicilio", "2026-12-09")).toBe(2500);
  });
});

describe("meetsMinimum", () => {
  it("compara con el mínimo del día de entrega", () => {
    expect(meetsMinimum("domicilio", 2500, "2026-09-29")).toBe(true);
    expect(meetsMinimum("domicilio", 2499, "2026-09-29")).toBe(false);
    expect(meetsMinimum("domicilio", 3000, "2026-10-02")).toBe(false);
    expect(meetsMinimum("recogida", 100, "2026-10-02")).toBe(true);
  });
});

describe("recogida en fin de semana y festivo", () => {
  const JUEVES = new Date("2026-10-01T10:00:00");

  it("Alcobendas: sábado, domingo y festivo solo de mañana", () => {
    expect(franjasRecogida("alcobendas", "2026-10-03", JUEVES)).toEqual([
      "morning",
    ]);
    expect(franjasRecogida("alcobendas", "2026-10-04", JUEVES)).toEqual([
      "morning",
    ]);
    // Lunes 12 de octubre, festivo.
    expect(franjasRecogida("alcobendas", "2026-10-12", JUEVES)).toEqual([
      "morning",
    ]);
    expect(franjasRecogida("alcobendas", "2026-10-05", JUEVES)).toEqual([
      "morning",
      "afternoon",
    ]);
  });

  it("Pozuelo no cambia: mañana y tarde también el sábado", () => {
    expect(franjasRecogida("pozuelo", "2026-10-03", JUEVES)).toEqual([
      "morning",
      "afternoon",
    ]);
  });

  it("Pozuelo, festivo entre semana: solo de mañana (cierra a las 15:00)", () => {
    // Lunes 12 de octubre, festivo.
    expect(franjasRecogida("pozuelo", "2026-10-12", JUEVES)).toEqual([
      "morning",
    ]);
    // Un lunes normal sigue con las dos franjas.
    expect(franjasRecogida("pozuelo", "2026-10-05", JUEVES)).toEqual([
      "morning",
      "afternoon",
    ]);
  });

  it("el domingo se recoge en Alcobendas, no en Pozuelo ni a domicilio", () => {
    const domingo = new Date("2026-10-04T00:00:00");
    expect(isClosed(domingo, { mode: "recogida", storeId: "alcobendas" })).toBe(
      false,
    );
    expect(isClosed(domingo, { mode: "recogida", storeId: "pozuelo" })).toBe(
      true,
    );
    expect(isClosed(domingo, { mode: "domicilio" })).toBe(true);
    expect(
      isDateAllowed("recogida", "2026-10-04", JUEVES, {
        storeId: "alcobendas",
      }),
    ).toBe(true);
  });

  it("el sábado no hay recogida para el mismo día en Alcobendas", () => {
    const sabado = new Date("2026-10-03T10:00:00");
    expect(earliestDate("recogida", sabado, { storeId: "alcobendas" })).toBe(
      "2026-10-04",
    );
    expect(
      isDateAllowed("recogida", "2026-10-03", sabado, {
        storeId: "alcobendas",
      }),
    ).toBe(false);
  });
});

describe("recogida al día siguiente: hasta las 17:00", () => {
  it("Alcobendas", () => {
    const opts = { storeId: "alcobendas" };
    expect(
      earliestDate("recogida", new Date("2026-09-29T16:59:00"), opts),
    ).toBe("2026-09-30");
    expect(
      earliestDate("recogida", new Date("2026-09-29T17:00:00"), opts),
    ).toBe("2026-10-01");
  });

  it("Pozuelo", () => {
    const opts = { storeId: "pozuelo" };
    expect(
      earliestDate("recogida", new Date("2026-09-29T10:00:00"), opts),
    ).toBe("2026-09-30");
    expect(
      earliestDate("recogida", new Date("2026-09-29T17:00:00"), opts),
    ).toBe("2026-10-01");
    // Viernes tarde: pasado mañana es domingo, y Pozuelo no recoge en domingo.
    expect(
      earliestDate("recogida", new Date("2026-10-02T18:00:00"), opts),
    ).toBe("2026-10-05");
  });
});
