import ExcelJS from "exceljs";
import type { Cliente } from "~/lib/db/clientes";
import type { Suscriptor } from "~/lib/db/suscriptores";

/**
 * Los clientes del panel en una hoja de cálculo, con el mismo estilo que el
 * Excel de pedidos (`pedidos-excel.ts`): Arial 10, cabecera en negrita y
 * fija, y filtro en la primera fila. Sin `pg` ni `astro:*`: recibe las filas
 * ya leídas y devuelve bytes, así se prueba sin base de datos.
 */

const FUENTE = { name: "Arial", size: 10 };

/** Las fechas vienen en UTC; el obrador vive en hora de Madrid. */
function enMadrid(fecha: Date): string {
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

async function libro(
  nombre: string,
  columnas: { header: string; key: string; width: number }[],
  filas: Record<string, unknown>[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Horno San Lorenzo";
  const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columnas;
  const cabecera = ws.getRow(1);
  cabecera.font = { ...FUENTE, bold: true };
  for (const f of filas) ws.addRow(f).font = FUENTE;
  ws.autoFilter = { from: "A1", to: `${ws.getColumn(columnas.length).letter}1` };
  const bytes = await wb.xlsx.writeBuffer();
  return Buffer.from(bytes as ArrayBuffer);
}

export function clientesAExcel(clientes: Cliente[]): Promise<Buffer> {
  return libro(
    "Clientes",
    [
      { header: "Nombre", key: "nombre", width: 28 },
      { header: "Correo", key: "email", width: 32 },
      { header: "Teléfono", key: "telefono", width: 14 },
      { header: "Pedidos pagados", key: "pedidos", width: 16 },
      { header: "Alta", key: "alta", width: 17 },
      { header: "Admin", key: "admin", width: 8 },
    ],
    clientes.map((c) => ({
      nombre: c.nombre,
      email: c.email,
      telefono: c.telefono ?? "",
      pedidos: c.pedidos,
      alta: enMadrid(c.creadoEn),
      admin: c.rol === "admin" ? "Sí" : "",
    })),
  );
}

export function suscritosAExcel(suscritos: Suscriptor[]): Promise<Buffer> {
  return libro(
    "Suscritos a ofertas",
    [
      { header: "Correo", key: "email", width: 34 },
      { header: "Cuenta en la web", key: "cuenta", width: 16 },
      { header: "Suscrito el", key: "alta", width: 17 },
    ],
    suscritos.map((s) => ({
      email: s.email,
      cuenta: s.esCliente ? "Sí" : "No",
      alta: enMadrid(s.creadoEn),
    })),
  );
}
