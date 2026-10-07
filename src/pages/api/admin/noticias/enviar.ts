import type { APIRoute } from "astro";
import { esAdmin } from "~/lib/auth/guardia";
import { listarNoticias, obtenerNoticia, reservarEnvio, anularEnvio } from "~/lib/db/noticias";
import { suscriptoresActivos } from "~/lib/db/suscriptores";
import { correoDeOferta } from "~/lib/email/oferta";
import { enviarLote } from "~/lib/email/enviar";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/**
 * Manda una noticia publicada de Este mes a los suscritos a las ofertas.
 * Una sola vez por noticia. El precio del correo sale de la misma lectura
 * pública que la web (`obtenerNoticia` con `soloPublicada`), con las
 * ofertas ya aplicadas: lo que dice el correo es lo que se cobra.
 */
export const POST: APIRoute = async ({ request, locals, site }) => {
  if (!esAdmin(locals.usuario)) return new Response("No encontrado", { status: 404 });

  const id = ((await request.json().catch(() => null)) as { id?: unknown } | null)?.id;
  if (typeof id !== "string") return json({ error: "Falta la noticia a enviar." }, 400);

  try {
    const noticia = (await listarNoticias({ soloPublicadas: false })).find((n) => n.id === id);
    if (!noticia) return json({ error: "Esa noticia ya no existe." }, 404);
    if (!noticia.publicada)
      return json({ error: "Publica la noticia antes de enviarla a los suscritos." }, 400);

    const publica = await obtenerNoticia(noticia.slug, { soloPublicada: true });
    const suscritos = await suscriptoresActivos();
    if (!publica) return json({ error: "Esa noticia ya no existe." }, 404);
    if (suscritos.length === 0) return json({ error: "Todavía no hay nadie suscrito." }, 400);

    if (!(await reservarEnvio(id)))
      return json({ error: "Esta noticia ya se envió a los suscritos." }, 409);

    const base = import.meta.env.PUBLIC_SITE_URL || site?.toString() || "https://hornosanlorenzo.vercel.app";
    const correos = suscritos.map((s) => {
      const c = correoDeOferta(publica, base, s.token);
      return {
        para: s.email,
        asunto: c.asunto,
        texto: c.texto,
        // Gmail y compañía enseñan «Cancelar suscripción» junto al remitente.
        cabeceras: { "List-Unsubscribe": `<${c.bajaUrl}>` },
      };
    });

    const r = await enviarLote(correos);
    if (r.enviados === 0) {
      await anularEnvio(id);
      return json(
        {
          error:
            r.error === "Correo no configurado."
              ? "El correo todavía no está configurado (falta la clave de Resend). No se ha enviado nada."
              : "No se ha podido enviar. No ha salido ningún correo: puedes reintentarlo.",
        },
        503,
      );
    }
    // A medias: se queda marcada como enviada para no repetir a quien ya
    // lo recibió, y se dice cuántos salieron.
    return json({
      enviados: r.enviados,
      total: correos.length,
      aviso: r.ok ? undefined : `Solo se enviaron ${r.enviados} de ${correos.length}.`,
    });
  } catch (error) {
    console.error("[admin/noticias/enviar]", error instanceof Error ? error.message : error);
    return json({ error: "No se ha podido enviar. Inténtalo de nuevo." }, 500);
  }
};
