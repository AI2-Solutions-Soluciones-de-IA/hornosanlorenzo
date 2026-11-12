import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { pedidosAExcel } from "~/lib/pedidos-excel";
import type { PedidoConLineas } from "~/lib/db/pedidos";

const pedido = (extra: Partial<PedidoConLineas> = {}): PedidoConLineas => ({
  id: "b560ca67-4e60-460a-93d8-2395ebfe2133",
  numero: 7,
  devueltoCents: 0,
  userId: null,
  stripeSessionId: null,
  mode: "recogida",
  fechaEntrega: "2026-09-16",
  slot: "morning",
  storeId: "alcobendas",
  address: null,
  postalCode: null,
  email: "cliente@example.com",
  telefono: "600000000",
  nombre: "Ana",
  notas: "Sin azúcar",
  subtotalCents: 1200,
  envioCents: 0,
  totalCents: 1200,
  estado: "sin_pago",
  reconstruido: false,
  procesadoEn: null,
  procesadoPor: null,
  createdAt: new Date("2026-09-11T15:00:35.355Z"),
  lineas: [
    { slug: "cebra", nombre: "Cebra", varianteLabel: "6 unidades", qty: 1, unitPriceCents: 600, detalle: null, fotoUrl: null },
    { slug: "glaseadas", nombre: "Glaseadas", varianteLabel: null, qty: 2, unitPriceCents: 300, detalle: null, fotoUrl: null },
  ],
  ...extra,
});

async function hoja(pedidos: PedidoConLineas[]) {
  const buffer = await pedidosAExcel(pedidos);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as never);
  return wb.worksheets[0];
}

describe("pedidosAExcel", () => {
  it("una fila por pedido, con todos los productos en la misma celda", async () => {
    const ws = await hoja([pedido()]);
    expect(ws.rowCount).toBe(2); // cabecera + 1 pedido (de 2 productos)
    const cabecera = ws.getRow(1).values as string[];
    expect(cabecera).toContain("Productos");
    expect(cabecera).not.toContain("Producto");
    expect(cabecera).not.toContain("Nº pedido");

    const fila = ws.getRow(2);
    const col = (nombre: string) => fila.getCell(cabecera.indexOf(nombre)).value;
    expect(col("Productos")).toBe("1× Cebra — 6 unidades · 6,00 €\n2× Glaseadas · 6,00 €");
    expect(col("Unidades")).toBe(3);
    expect(col("Total pedido (€)")).toBe(12);
    expect(col("Estado")).toBe("Sin pagar");
    expect(col("Día de entrega")).toBe("2026-09-16");
    // Entró a las 15:00 UTC = 17:00 en Madrid, el mismo día.
    expect(col("Entró el")).toBe("2026-09-11 17:00");
    expect(col("Modalidad")).toBe("Recogida en tienda");
    expect(col("Tienda o dirección")).toMatch(/Alcobendas/);
    expect(fila.getCell(cabecera.indexOf("Productos")).alignment?.wrapText).toBe(true);
  });

  it("los estados se traducen: pagado por Stripe, cobrado en tienda, sin pagar", async () => {
    const ws = await hoja([
      pedido({ estado: "pagado", stripeSessionId: "cs_1" }),
      pedido({ estado: "pagado" }),
      pedido(),
    ]);
    const cabecera = ws.getRow(1).values as string[];
    const estado = (r: number) => ws.getRow(r).getCell(cabecera.indexOf("Estado")).value;
    expect(estado(2)).toBe("Pagado por Stripe");
    expect(estado(3)).toBe("Cobrado en tienda");
    expect(estado(4)).toBe("Sin pagar");
  });

  it("un pedido reconstruido sin datos no inventa la modalidad ni el día", async () => {
    const ws = await hoja([pedido({ mode: null, fechaEntrega: null, slot: null, reconstruido: true })]);
    const cabecera = ws.getRow(1).values as string[];
    const fila = ws.getRow(2);
    expect(fila.getCell(cabecera.indexOf("Modalidad")).value).toBe("sin datos");
    expect(fila.getCell(cabecera.indexOf("Día de entrega")).value).toBe("sin datos");
  });

  it("un pack lleva sus piezas detrás del nombre, y la foto va en su columna", async () => {
    const ws = await hoja([
      pedido({
        lineas: [
          {
            slug: "pack-desayuno",
            nombre: "Pack desayuno",
            varianteLabel: null,
            qty: 1,
            unitPriceCents: 1500,
            detalle: [
              { slug: "cebra", nombre: "Cebra", varianteLabel: "6 unidades", qty: 1 },
              { slug: "glaseadas", nombre: "Glaseadas", varianteLabel: null, qty: 2 },
            ],
            fotoUrl: "https://blob.example/foto.jpg",
          },
          pedido().lineas[1],
        ],
      }),
    ]);
    const cabecera = ws.getRow(1).values as string[];
    const val = (col: string) => ws.getRow(2).getCell(cabecera.indexOf(col)).value;
    expect(val("Productos")).toBe(
      "1× Pack desayuno · 15,00 € (Cebra · 6 unidades, Glaseadas)\n2× Glaseadas · 6,00 €",
    );
    expect(val("Foto")).toBe("https://blob.example/foto.jpg");
    expect(cabecera.slice(-3)).toEqual(["Foto", "Procesado", "Procesado por"]);
  });

  it("«Procesado»: Sí con quién y cuándo (hora de Madrid), o No", async () => {
    const ws = await hoja([
      pedido({ procesadoEn: new Date("2026-11-12T08:05:00Z"), procesadoPor: "Oficina Alcobendas" }),
      pedido(),
    ]);
    const cabecera = ws.getRow(1).values as string[];
    const val = (fila: number, col: string) => ws.getRow(fila).getCell(cabecera.indexOf(col)).value;
    expect(val(2, "Procesado")).toBe("Sí");
    expect(val(2, "Procesado por")).toBe("Oficina Alcobendas · 2026-11-12 09:05");
    expect(val(3, "Procesado")).toBe("No");
    expect(val(3, "Procesado por") ?? "").toBe("");
  });

  it("sin pedidos, solo la cabecera", async () => {
    const ws = await hoja([]);
    expect(ws.rowCount).toBe(1);
  });
});
