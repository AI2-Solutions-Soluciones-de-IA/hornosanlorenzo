import ExcelJS from "exceljs";
import type { PedidoConLineas } from "~/lib/db/pedidos";
import { MODE_COPY, ENTREGA_DOMICILIO_COPY } from "~/lib/entrega";
import { stores } from "~/data/stores";
import { etiquetaPieza } from "~/data/packs";

/**
 * Los pedidos del panel en una hoja de cálculo: una fila por línea de
 * pedido (por producto), no por pedido, para que en Excel se pueda sumar y
 * filtrar por producto sin desmontar celdas. Los importes van en euros como
 * número, con formato de moneda, nunca como texto; el importe de la línea es
 * una fórmula (cantidad × precio) para que Excel lo recalcule si alguien
 * corrige una cantidad a mano.
 *
 * Sin `pg` ni `astro:*` a propósito: recibe los pedidos ya leídos y devuelve
 * bytes, así se prueba sin base de datos.
 */

const SIN_DATOS = "sin datos";
const SLOT_LABEL = { morning: "mañana", afternoon: "tarde" } as const;
const FUENTE = { name: "Arial", size: 10 };

const COLUMNAS: { header: string; key: string; width: number }[] = [
  { header: "Entró el", key: "entrada", width: 17 },
  { header: "Día de entrega", key: "entrega", width: 14 },
  { header: "Franja", key: "franja", width: 22 },
  { header: "Modalidad", key: "modalidad", width: 20 },
  { header: "Tienda o dirección", key: "destino", width: 40 },
  { header: "Nombre", key: "nombre", width: 22 },
  { header: "Teléfono", key: "telefono", width: 14 },
  { header: "Correo", key: "email", width: 28 },
  { header: "Producto", key: "producto", width: 30 },
  { header: "Tamaño", key: "tamano", width: 16 },
  { header: "Cantidad", key: "cantidad", width: 10 },
  { header: "Precio unidad (€)", key: "precio", width: 16 },
  { header: "Importe línea (€)", key: "importe", width: 16 },
  { header: "Reparto (€)", key: "reparto", width: 12 },
  { header: "Total pedido (€)", key: "total", width: 16 },
  { header: "Estado", key: "estado", width: 18 },
  { header: "Notas", key: "notas", width: 40 },
  { header: "Referencia", key: "id", width: 38 },
  // Al final a propósito: quien lea el Excel por posición no ve desplazadas
  // las columnas de siempre.
  { header: "Lleva", key: "detalle", width: 50 },
  { header: "Foto", key: "foto", width: 40 },
];

const EUROS = '#,##0.00 "€"';

/** `created_at` viene en UTC; el obrador vive en hora de Madrid. */
function entradaEnMadrid(fecha: Date): string {
  const partes = new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(fecha);
  const v = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? "";
  return `${v("year")}-${v("month")}-${v("day")} ${v("hour")}:${v("minute")}`;
}

function estadoLegible(p: PedidoConLineas): string {
  if (p.estado === "sin_pago") return "Sin pagar";
  return p.stripeSessionId ? "Pagado por Stripe" : "Cobrado en tienda";
}

function destino(p: PedidoConLineas): string {
  if (p.mode === null) return SIN_DATOS;
  if (p.mode === "domicilio") {
    return [p.address, p.postalCode].filter(Boolean).join(" · ") || SIN_DATOS;
  }
  const tienda = stores.find((s) => s.id === p.storeId);
  return tienda ? `${tienda.shortName} — ${tienda.address}` : SIN_DATOS;
}

function franja(p: PedidoConLineas): string {
  if (p.mode === "recogida") return p.slot ? SLOT_LABEL[p.slot] : SIN_DATOS;
  if (p.mode === "domicilio") return ENTREGA_DOMICILIO_COPY;
  return SIN_DATOS;
}

export async function pedidosAExcel(pedidos: PedidoConLineas[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Horno San Lorenzo";
  const ws = wb.addWorksheet("Pedidos", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = COLUMNAS;

  const cabecera = ws.getRow(1);
  cabecera.font = { ...FUENTE, bold: true };
  cabecera.alignment = { vertical: "middle" };

  const colCantidad = COLUMNAS.findIndex((c) => c.key === "cantidad") + 1;
  const colPrecio = COLUMNAS.findIndex((c) => c.key === "precio") + 1;
  const letra = (n: number) => ws.getColumn(n).letter;

  for (const p of pedidos) {
    for (const l of p.lineas) {
      const fila = ws.addRow({
        entrada: entradaEnMadrid(p.createdAt),
        entrega: p.fechaEntrega ?? SIN_DATOS,
        franja: franja(p),
        modalidad: p.mode ? MODE_COPY[p.mode].label : SIN_DATOS,
        destino: destino(p),
        nombre: p.nombre ?? "",
        telefono: p.telefono,
        email: p.email,
        producto: l.nombre,
        tamano: l.varianteLabel ?? "",
        detalle: l.detalle?.map(etiquetaPieza).join(" · ") ?? "",
        foto: l.fotoUrl ?? "",
        cantidad: l.qty,
        precio: l.unitPriceCents / 100,
        reparto: p.envioCents / 100,
        total: p.totalCents / 100,
        estado: estadoLegible(p),
        notas: p.notas ?? "",
        id: p.id,
      });
      const n = fila.number;
      fila.getCell("importe").value = {
        formula: `${letra(colCantidad)}${n}*${letra(colPrecio)}${n}`,
        result: (l.qty * l.unitPriceCents) / 100,
      };
      fila.font = FUENTE;
      for (const key of ["precio", "importe", "reparto", "total"]) {
        fila.getCell(key).numFmt = EUROS;
      }
    }
  }

  ws.autoFilter = { from: "A1", to: `${letra(COLUMNAS.length)}1` };

  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes as ArrayBuffer);
}
