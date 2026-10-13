import { site } from "~/data/site";
import { stores } from "~/data/stores";
import { fromISO, toISO } from "~/lib/entrega";

/**
 * Límites del pedido online. Por encima de ellos el pedido se cierra hablando
 * con la oficina, no por la web. Para cambiarlos basta con tocar las
 * constantes: el carrito, la ficha, el calendario y el servidor leen de aquí.
 */

/** Unidades de un mismo producto (sume las líneas que sume) por pedido. */
export const MAX_UNIDADES_POR_PRODUCTO = 10;

/** Importe máximo de un pedido online, en céntimos. */
export const MAX_IMPORTE_PEDIDO_CENTS = 40_000;

/**
 * Capacidad del obrador: unidades encargadas en total para un mismo día de
 * entrega o recogida, sumando todos los pedidos. Un pack cuenta los
 * productos que lleva (en el límite por producto, en cambio, es uno más).
 * Los festivos no cambian nada: solo cuenta el día de la semana.
 */
export const MAX_UNIDADES_DIA = 50;
/** Viernes y sábados. */
export const MAX_UNIDADES_DIA_FIN_DE_SEMANA = 100;

/**
 * Minutos que un pedido a medio pagar guarda su hueco. Stripe no deja que su
 * página de pago caduque antes de 30 minutos: si alguien tarda más que esto y
 * otro cliente necesita el hueco, se le cierra la página de pago.
 */
export const MINUTOS_RESERVA = 15;

export function maxUnidadesDelDia(dateISO: string): number {
  const dia = fromISO(dateISO).getDay();
  return dia === 5 || dia === 6 ? MAX_UNIDADES_DIA_FIN_DE_SEMANA : MAX_UNIDADES_DIA;
}

/** La oficina es la del obrador central. */
const oficina = stores[0];
export const OFICINA_CONTACTO = {
  phone: oficina.phone,
  phoneDisplay: oficina.phoneDisplay,
  email: site.email,
} as const;

const CONSULTA_OFICINA = `consulta directamente con nuestra oficina: ${OFICINA_CONTACTO.phoneDisplay} · ${OFICINA_CONTACTO.email}`;

export const LIMITE_UNIDADES_COPY = `Máximo ${MAX_UNIDADES_POR_PRODUCTO} unidades de un mismo producto por pedido. Para pedir más, ${CONSULTA_OFICINA}.`;

export const LIMITE_IMPORTE_COPY = `El pedido online admite hasta ${MAX_IMPORTE_PEDIDO_CENTS / 100} €. Para pedidos de importe superior, ${CONSULTA_OFICINA}.`;

export const DIA_COMPLETO_COPY = `Ese día ya no nos caben tantos encargos. Elige otro día o ${CONSULTA_OFICINA}.`;

/** Debajo del calendario, cuando hay algún día tachado. */
export const DIAS_TACHADOS_COPY = `Los días tachados ya no tienen hueco para tu pedido. Elige otro o ${CONSULTA_OFICINA}.`;

type Linea = { slug: string; qty: number };

/**
 * Unidades que ocupan unas líneas en la capacidad del día: una suelta, la
 * suya; un pack, sus piezas por cada pack. Vale para el carrito (desglose en
 * texto, una entrada por pieza) y para el servidor (piezas con su `qty`).
 */
export const unidadesTotales = (
  items: readonly { qty: number; detalle?: readonly (string | { qty: number })[] }[],
): number =>
  items.reduce((n, i) => {
    const porPack = i.detalle?.length
      ? i.detalle.reduce((m, d) => m + (typeof d === "string" ? 1 : d.qty), 0)
      : 1;
    return n + i.qty * porPack;
  }, 0);

/** ¿Cabe un pedido de `unidades` en un día que ya tiene `encargadas`? */
export const cabeEnElDia = (dateISO: string, encargadas: number, unidades: number): boolean =>
  encargadas + unidades <= maxUnidadesDelDia(dateISO);

/**
 * Días del rango `desde`–`hasta` (incluidos) en los que ya no cabe un pedido
 * de `unidades`, sabiendo lo encargado en cada uno.
 */
export function diasSinHueco(
  desde: string,
  hasta: string,
  encargadas: ReadonlyMap<string, number>,
  unidades: number,
): string[] {
  const fuera: string[] = [];
  for (let d = fromISO(desde); toISO(d) <= hasta; d.setDate(d.getDate() + 1)) {
    const iso = toISO(d);
    if (!cabeEnElDia(iso, encargadas.get(iso) ?? 0, unidades)) fuera.push(iso);
  }
  return fuera;
}

/** Unidades de cada producto, sumando sus líneas (tamaños, sabores de pack…). */
export function unidadesPorProducto(
  items: readonly Linea[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) m.set(i.slug, (m.get(i.slug) ?? 0) + i.qty);
  return m;
}

/** Cuántas unidades más de `slug` caben antes de llegar al límite. */
export function unidadesLibres(items: readonly Linea[], slug: string): number {
  const usadas = unidadesPorProducto(items).get(slug) ?? 0;
  return Math.max(0, MAX_UNIDADES_POR_PRODUCTO - usadas);
}

/** El primer producto que pasa del límite de unidades, o null. */
export function productoSobreLimite(items: readonly Linea[]): string | null {
  for (const [slug, n] of unidadesPorProducto(items))
    if (n > MAX_UNIDADES_POR_PRODUCTO) return slug;
  return null;
}

export const superaImporte = (cents: number): boolean =>
  cents > MAX_IMPORTE_PEDIDO_CENTS;
