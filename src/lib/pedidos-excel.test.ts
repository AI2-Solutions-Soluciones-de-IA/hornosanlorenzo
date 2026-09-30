import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { pedidosAExcel } from "~/lib/pedidos-excel";
import type { PedidoConLineas } from "~/lib/db/pedidos";

const pedido = (extra: Partial<PedidoConLineas> = {}): PedidoConLineas => ({
  id: "b560ca67-4e60-460a-93d8-2395ebfe2133",
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
  it("una fila por línea de pedido, con los importes en euros como número", async () => {
    const ws = await hoja([pedido()]);
    expect(ws.rowCount).toBe(3); // cabecera + 2 líneas
    const cabecera = ws.getRow(1).values as string[];
    expect(cabecera).toContain("Producto");
    expect(cabecera).toContain("Total pedido (€)");

    const fila = ws.getRow(2);
    const col = (nombre: string) => fila.getCell(cabecera.indexOf(nombre)).value;
    expect(col("Producto")).toBe("Cebra");
    expect(col("Tamaño")).toBe("6 unidades");
    expect(col("Cantidad")).toBe(1);
    expect(col("Precio unidad (€)")).toBe(6);
    expect(col("Total pedido (€)")).toBe(12);
    expect(col("Estado")).toBe("Sin pagar");
    expect(col("Día de entrega")).toBe("2026-09-16");
    // Entró a las 15:00 UTC = 17:00 en Madrid, el mismo día.
    expect(col("Entró el")).toBe("2026-09-11 17:00");
    expect(col("Modalidad")).toBe("Recogida en tienda");
    expect(col("Tienda o dirección")).toMatch(/Alcobendas/);
  });

  it("el importe de la línea es una fórmula cantidad × precio, con su resultado", async () => {
    const ws = await hoja([pedido()]);
    const cabecera = ws.getRow(1).values as string[];
    const celda = ws.getRow(3).getCell(cabecera.indexOf("Importe línea (€)"));
    expect(celda.formula).toMatch(/\*/);
    expect(celda.result).toBe(6);
  });

  it("los estados se traducen: pagado por Stripe, cobrado en tienda, sin pagar", async () => {
    const ws = await hoja([
      pedido({ estado: "pagado", stripeSessionId: "cs_1", lineas: [pedido().lineas[0]] }),
      pedido({ estado: "pagado", lineas: [pedido().lineas[0]] }),
      pedido({ lineas: [pedido().lineas[0]] }),
    ]);
    const cabecera = ws.getRow(1).values as string[];
    const estado = (r: number) => ws.getRow(r).getCell(cabecera.indexOf("Estado")).value;
    expect(estado(2)).toBe("Pagado por Stripe");
    expect(estado(3)).toBe("Cobrado en tienda");
    expect(estado(4)).toBe("Sin pagar");
  });

  it("un pedido reconstruido sin datos no inventa la modalidad ni el día", async () => {
    const ws = await hoja([
      pedido({ mode: null, fechaEntrega: null, slot: null, reconstruido: true, lineas: [pedido().lineas[0]] }),
    ]);
    const cabecera = ws.getRow(1).values as string[];
    const fila = ws.getRow(2);
    expect(fila.getCell(cabecera.indexOf("Modalidad")).value).toBe("sin datos");
    expect(fila.getCell(cabecera.indexOf("Día de entrega")).value).toBe("sin datos");
  });

  it("una línea de pack lleva el desglose en «Lleva» y la foto, sin tamaño; una normal deja las dos vacías", async () => {
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
    const val = (fila: number, col: string) =>
      ws.getRow(fila).getCell(cabecera.indexOf(col)).value;
    // Al final, para no desplazar las columnas de quien lee por posición.
    expect(cabecera.slice(-2)).toEqual(["Lleva", "Foto"]);
    expect(val(2, "Tamaño") ?? "").toBe("");
    expect(val(2, "Lleva")).toBe("Cebra · 6 unidades · Glaseadas");
    expect(val(2, "Foto")).toBe("https://blob.example/foto.jpg");
    expect(val(3, "Lleva") ?? "").toBe("");
    expect(val(3, "Foto") ?? "").toBe("");
  });

  it("sin pedidos, solo la cabecera", async () => {
    const ws = await hoja([]);
    expect(ws.rowCount).toBe(1);
  });
});
