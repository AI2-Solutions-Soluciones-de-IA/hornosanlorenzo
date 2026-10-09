import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { clientesAExcel, suscritosAExcel } from "~/lib/clientes-excel";

async function hoja(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  return wb.worksheets[0];
}

describe("clientesAExcel", () => {
  it("una fila por cliente, con los pedidos como número y el alta en hora de Madrid", async () => {
    const ws = await hoja(
      await clientesAExcel([
        {
          id: "u1",
          nombre: "Ana López",
          email: "ana@example.com",
          telefono: "600000000",
          empresa: "Bar Pepe, S.L.",
          cif: "B12345678",
          rol: null,
          creadoEn: new Date("2026-10-01T22:30:00Z"),
          pedidos: 3,
        },
        {
          id: "u2",
          nombre: "Admin",
          email: "admin@example.com",
          telefono: null,
          empresa: null,
          cif: null,
          rol: "admin",
          creadoEn: new Date("2026-09-01T10:00:00Z"),
          pedidos: 0,
        },
      ]),
    );
    expect(ws.name).toBe("Clientes");
    expect(ws.getRow(1).values).toEqual([undefined, "Nombre", "Correo", "Teléfono", "Empresa", "CIF", "Pedidos pagados", "Alta", "Admin"]);
    expect(ws.getRow(2).values).toEqual([undefined, "Ana López", "ana@example.com", "600000000", "Bar Pepe, S.L.", "B12345678", 3, "2026-10-02 00:30", ""]);
    expect(ws.getRow(3).getCell(3).value).toBe("");
    expect(ws.getRow(3).getCell(8).value).toBe("Sí");
    expect(ws.rowCount).toBe(3);
  });
});

describe("suscritosAExcel", () => {
  it("correo, si tiene cuenta y fecha de suscripción", async () => {
    const ws = await hoja(
      await suscritosAExcel([
        { email: "a@example.com", esCliente: true, creadoEn: new Date("2026-10-07T09:00:00Z") },
      ]),
    );
    expect(ws.name).toBe("Suscritos a ofertas");
    expect(ws.getRow(1).values).toEqual([undefined, "Correo", "Cuenta en la web", "Suscrito el"]);
    expect(ws.getRow(2).values).toEqual([undefined, "a@example.com", "Sí", "2026-10-07 11:00"]);
  });
});
