import type { APIRoute } from "astro";
import { listarPedidos } from "~/lib/db/pedidos";
import { pedidosAExcel } from "~/lib/pedidos-excel";
import { vePedidos } from "~/lib/auth/guardia";
import { leerFiltrosPedidos } from "~/lib/filtros-pedidos";

export const prerender = false;

/** 404, no 401 ni 403: mismo criterio que el resto del panel (spec §7). */
const noEncontrado = () => new Response("No encontrado", { status: 404 });

/**
 * Tope del Excel. La página pagina; el Excel no, lleva todos los que casan
 * con los filtros. El tope solo evita que un rango de años entero tumbe la
 * función.
 */
const MAX_EXCEL = 2000;

/**
 * Los mismos pedidos que enseña `/admin/pedidos`, con sus mismos filtros
 * (rango de fechas y búsqueda, leídos por `leerFiltrosPedidos`), en un
 * .xlsx. Todas las páginas, no solo la que se está viendo.
 */
export const GET: APIRoute = async ({ url, locals }) => {
  if (!vePedidos(locals.usuario)) return noEncontrado();

  const { tipo, desde, hasta, filtros } = leerFiltrosPedidos(url.searchParams);

  try {
    const pedidos = await listarPedidos(MAX_EXCEL, filtros);
    const xlsx = await pedidosAExcel(pedidos);
    const rango = desde && hasta && desde !== hasta ? `${desde}-a-${hasta}` : (desde ?? (hasta && `hasta-${hasta}`));
    const nombre = `pedidos${rango ? `-${tipo}-${rango}` : ""}.xlsx`;
    return new Response(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${nombre}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[admin/pedidos/exportar] no se pudo generar:", error);
    return new Response("No se pudo generar el Excel.", { status: 500 });
  }
};
