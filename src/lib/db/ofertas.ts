import { pool } from "~/lib/db/pool";
import {
  juntaOfertas,
  type OfertaNoticia,
  type OfertaProducto,
} from "~/lib/ofertas";

/**
 * Las ofertas vigentes de «Este mes», por slug de producto. Vigente quiere
 * decir: noticia (o sección) publicada, con producto, con algún precio de
 * oferta y con la fecha de fin sin pasar — hoy incluido, con el «hoy» de Madrid y no el
 * del servidor de Vercel, que va en UTC.
 *
 * Con `slugs` solo mira esos productos (el cobro pide dos o tres); sin él,
 * todos (la carta entera).
 */
export async function ofertasVigentes(
  slugs?: string[],
): Promise<Map<string, OfertaProducto>> {
  if (slugs && slugs.length === 0) return new Map();
  const filtro = slugs ? "and p.slug = any($1::text[])" : "";
  const vigente = (tabla: string) =>
    `(${tabla}.oferta_hasta is null
      or ${tabla}.oferta_hasta >= (now() at time zone 'Europe/Madrid')::date)`;
  const { rows } = await pool.query<OfertaNoticia>(
    `select p.slug,
            n.oferta_cents     as "precioCents",
            n.oferta_variantes as variantes,
            to_char(n.oferta_hasta, 'YYYY-MM-DD') as hasta
       from noticias n
       join productos p on p.id = n.producto_id
      where n.publicada
        and (n.oferta_cents is not null or n.oferta_variantes <> '{}'::jsonb)
        and ${vigente("n")}
        ${filtro}
     union all
     -- Las secciones de Este mes también rebajan (migración 019): el precio
     -- va por producto y la fecha de fin, por sección.
     select p.slug,
            sp.oferta_cents,
            sp.oferta_variantes,
            to_char(s.oferta_hasta, 'YYYY-MM-DD')
       from secciones_este_mes_productos sp
       join secciones_este_mes s on s.id = sp.seccion_id
       join productos p on p.id = sp.producto_id
      where s.publicada
        and (sp.oferta_cents is not null or sp.oferta_variantes <> '{}'::jsonb)
        and ${vigente("s")}
        ${filtro}`,
    slugs ? [slugs] : [],
  );
  return juntaOfertas(rows);
}
