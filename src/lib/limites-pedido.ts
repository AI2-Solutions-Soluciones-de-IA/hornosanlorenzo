import { site } from "~/data/site";
import { stores } from "~/data/stores";

/**
 * Límites del pedido online. Por encima de ellos el pedido se cierra hablando
 * con la oficina, no por la web. Para cambiarlos basta con tocar estas dos
 * constantes: el carrito, la ficha y el servidor leen de aquí.
 */

/** Unidades de un mismo producto (sume las líneas que sume) por pedido. */
export const MAX_UNIDADES_POR_PRODUCTO = 10;

/** Importe máximo de un pedido online, en céntimos. */
export const MAX_IMPORTE_PEDIDO_CENTS = 40_000;

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

type Linea = { slug: string; qty: number };

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
