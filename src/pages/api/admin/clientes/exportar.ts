import type { APIRoute } from "astro";
import { listarClientes } from "~/lib/db/clientes";
import { listarSuscriptores } from "~/lib/db/suscriptores";
import { clientesAExcel, suscritosAExcel } from "~/lib/clientes-excel";
import { esAdmin } from "~/lib/auth/guardia";

export const prerender = false;

/** 404, no 401 ni 403: mismo criterio que el resto del panel (spec §7). */
const noEncontrado = () => new Response("No encontrado", { status: 404 });

/** Tope del Excel: la página pagina, el Excel lleva todos hasta aquí. */
const MAX_EXCEL = 5000;

/**
 * Lo mismo que enseña `/admin/clientes`, con su misma pestaña (`vista`) y
 * búsqueda (`q`), en un .xlsx. Todas las páginas, no solo la que se ve.
 */
export const GET: APIRoute = async ({ url, locals }) => {
  if (!esAdmin(locals.usuario)) return noEncontrado();

  const suscritos = url.searchParams.get("vista") === "suscritos";
  const texto = (url.searchParams.get("q") ?? "").slice(0, 80).trim() || undefined;

  try {
    const xlsx = suscritos
      ? await suscritosAExcel(await listarSuscriptores(MAX_EXCEL, texto))
      : await clientesAExcel(await listarClientes(MAX_EXCEL, texto));
    const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());
    const nombre = `${suscritos ? "suscritos-ofertas" : "clientes"}-${hoy}.xlsx`;
    return new Response(new Uint8Array(xlsx), {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${nombre}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[admin/clientes/exportar] no se pudo generar:", error);
    return new Response("No se pudo generar el Excel.", { status: 500 });
  }
};
