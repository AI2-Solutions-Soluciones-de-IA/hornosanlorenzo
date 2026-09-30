/**
 * Paginación del panel: la cuenta de páginas, qué números enseñar y las
 * clases de los botones. La usan Pedidos y Clientes (en servidor, con
 * enlaces), Productos (en la isla, con botones) y la hoja de Producción (con
 * un script, para poder imprimirla entera). Las clases viven aquí para que
 * las cuatro se vean iguales.
 */

export type Pagina = { pagina: number; paginas: number; desde: number; hasta: number };

/**
 * Página pedida, acotada a las que hay. `desde`/`hasta` son las posiciones
 * (empezando en 1) de lo que se enseña: «21–40 de 45». Con 0 elementos,
 * una sola página vacía.
 */
export function paginar(total: number, porPagina: number, pedida: number): Pagina {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(Math.max(1, Math.trunc(pedida) || 1), paginas);
  const desde = total === 0 ? 0 : (pagina - 1) * porPagina + 1;
  return { pagina, paginas, desde, hasta: Math.min(pagina * porPagina, total) };
}

/** Lee `?pagina=N`; lo que no sea un entero positivo es la 1. */
export function leerPagina(params: URLSearchParams): number {
  const n = Number.parseInt(params.get("pagina") ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Qué números enseñar: la primera, la última y las vecinas de la actual; lo
 * de en medio se resume en «…». Con 20 páginas y la 10 abierta:
 * 1 … 9 10 11 … 20.
 */
export function numerosPagina(pagina: number, paginas: number): (number | "…")[] {
  const numeros: (number | "…")[] = [];
  for (let n = 1; n <= paginas; n++) {
    if (n === 1 || n === paginas || Math.abs(n - pagina) <= 1) numeros.push(n);
    else if (numeros.at(-1) !== "…") numeros.push("…");
  }
  return numeros;
}

/** «21–40 de 45 pedidos», o «1 pedido» si solo hay uno. */
export function resumenPagina(p: Pagina, total: number, uno: string, varios: string): string {
  if (total === 1) return `1 ${uno}`;
  if (p.paginas === 1) return `${total} ${varios}`;
  return `${p.desde}–${p.hasta} de ${total} ${varios}`;
}

export const CLASES_PAGINACION = {
  nav: "mt-6 flex flex-wrap items-center justify-center gap-2 text-sm",
  boton:
    "min-w-10 px-3 py-2 text-center border border-[color:var(--color-avellana)] tabular-nums hover:bg-[color:var(--color-latte)] cursor-pointer",
  actual:
    "min-w-10 px-3 py-2 text-center border border-[color:var(--color-moka)] tabular-nums bg-[color:var(--color-moka)] text-[color:var(--color-leche)]",
  apagado:
    "px-3 py-2 border border-[color:var(--color-line)] text-[color:var(--color-ink-muted)]",
  puntos: "px-2 text-[color:var(--color-ink-muted)]",
} as const;
