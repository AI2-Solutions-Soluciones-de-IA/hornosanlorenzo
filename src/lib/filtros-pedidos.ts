import type { DestinoPedido, FiltrosPedidos } from "~/lib/db/pedidos";
import { leerPagina } from "~/lib/paginacion";

/**
 * Los filtros de `/admin/pedidos` leídos de la URL:
 * `?fecha=entrega|entrada&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&q=texto
 * &destino=alcobendas|pozuelo|domicilio&procesado=no|si&pagina=N`.
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
  destino?: DestinoPedido;
  /** «Sin procesar» (`no`) o «Procesados» (`si`); sin él, todos. */
  procesado?: "si" | "no";
  /** Empieza en 1. */
  pagina: number;
  /** Lo que se pasa a `listarPedidos` / `contarPedidos`. */
  filtros: FiltrosPedidos;
  hayFiltro: boolean;
};

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const DESTINOS: readonly DestinoPedido[] = ["alcobendas", "pozuelo", "domicilio"];

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

  const d = params.get("destino");
  const destino = DESTINOS.find((x) => x === d);

  const pr = params.get("procesado");
  const procesado = pr === "si" || pr === "no" ? pr : undefined;

  const pagina = leerPagina(params);

  const filtros: FiltrosPedidos = {
    ...(tipo === "entrega"
      ? { entregaDesde: desde, entregaHasta: hasta }
      : { entradaDesde: desde, entradaHasta: hasta }),
    texto: texto || undefined,
    ...(destino ? { destino } : {}),
    ...(procesado ? { procesado: procesado === "si" } : {}),
  };

  return {
    tipo,
    desde,
    hasta,
    texto,
    destino,
    procesado,
    pagina,
    filtros,
    hayFiltro: Boolean(desde || hasta || texto || destino || procesado),
  };
}

/** La query de estos filtros, sin la página (para enlaces y el Excel). */
export function queryFiltros(
  f: Pick<FiltrosLeidos, "tipo" | "desde" | "hasta" | "texto" | "destino" | "procesado">,
): URLSearchParams {
  const q = new URLSearchParams();
  q.set("fecha", f.tipo);
  if (f.desde) q.set("desde", f.desde);
  if (f.hasta) q.set("hasta", f.hasta);
  if (f.texto) q.set("q", f.texto);
  if (f.destino) q.set("destino", f.destino);
  if (f.procesado) q.set("procesado", f.procesado);
  return q;
}
