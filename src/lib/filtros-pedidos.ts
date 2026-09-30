import type { FiltrosPedidos } from "~/lib/db/pedidos";

/**
 * Los filtros de `/admin/pedidos` leídos de la URL:
 * `?fecha=entrega|entrada&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&q=texto&pagina=N`.
 *
 * Lo leen la página y el Excel, y por eso vive aquí: si cada uno los leyera
 * a su manera, el Excel dejaría de ser «lo que se ve».
 *
 * Solo se acepta la forma de fecha; cualquier otra cosa se ignora en vez de
 * llegar a la consulta. Se siguen entendiendo los enlaces viejos de un solo
 * día (`?entrega=` y `?entrada=`), que pueden estar guardados en marcadores.
 */

export type TipoFecha = "entrega" | "entrada";

export type FiltrosLeidos = {
  tipo: TipoFecha;
  desde?: string;
  hasta?: string;
  texto: string;
  /** Empieza en 1. */
  pagina: number;
  /** Lo que se pasa a `listarPedidos` / `contarPedidos`. */
  filtros: FiltrosPedidos;
  hayFiltro: boolean;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function leerFiltrosPedidos(params: URLSearchParams): FiltrosLeidos {
  const fecha = (clave: string): string | undefined => {
    const v = params.get(clave) ?? "";
    return FECHA.test(v) ? v : undefined;
  };

  let tipo: TipoFecha =
    params.get("fecha") === "entrada" ? "entrada" : "entrega";
  let desde = fecha("desde");
  let hasta = fecha("hasta");
  // Enlace viejo de un solo día.
  if (!desde && !hasta) {
    const viejo = fecha("entrega") ?? fecha("entrada");
    if (viejo) {
      tipo = fecha("entrega") ? "entrega" : "entrada";
      desde = hasta = viejo;
    }
  }
  // Un rango al revés se da la vuelta: nadie quiere «ningún pedido» por eso.
  if (desde && hasta && hasta < desde) [desde, hasta] = [hasta, desde];

  // La búsqueda va parametrizada en la consulta, así que no hay que
  // desconfiar de su contenido; el tope de 80 solo evita que una URL
  // manipulada arrastre un patrón kilométrico hasta Postgres.
  const texto = (params.get("q") ?? "").slice(0, 80).trim();

  const n = Number.parseInt(params.get("pagina") ?? "", 10);
  const pagina = Number.isFinite(n) && n > 0 ? n : 1;

  const filtros: FiltrosPedidos = {
    ...(tipo === "entrega"
      ? { entregaDesde: desde, entregaHasta: hasta }
      : { entradaDesde: desde, entradaHasta: hasta }),
    texto: texto || undefined,
  };

  return {
    tipo,
    desde,
    hasta,
    texto,
    pagina,
    filtros,
    hayFiltro: Boolean(desde || hasta || texto),
  };
}

/** La query de estos filtros, sin la página (para enlaces y el Excel). */
export function queryFiltros(
  f: Pick<FiltrosLeidos, "tipo" | "desde" | "hasta" | "texto">,
): URLSearchParams {
  const q = new URLSearchParams();
  q.set("fecha", f.tipo);
  if (f.desde) q.set("desde", f.desde);
  if (f.hasta) q.set("hasta", f.hasta);
  if (f.texto) q.set("q", f.texto);
  return q;
}
