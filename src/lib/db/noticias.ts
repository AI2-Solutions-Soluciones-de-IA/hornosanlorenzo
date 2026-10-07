import { pool } from "~/lib/db/pool";
import { slugify } from "~/lib/slug";
import { NoticiaError, traduce } from "~/lib/db/noticiasErrores";
import { ofertasVigentes } from "~/lib/db/ofertas";
import { aplicaOferta, type ConOferta } from "~/lib/ofertas";

// Reexportado para que quien ya importaba `NoticiaError` desde aquí (tests,
// y las tareas 11-18 que la citan por nombre) lo siga encontrando sin
// cambiar nada: vive en `noticiasErrores.ts` únicamente para que las
// pruebas de la traducción puedan importarla sin arrastrar `~/lib/db/pool`
// (ver el comentario de ese fichero). Mismo patrón que `direcciones.ts`.
export { NoticiaError };

/**
 * Noticias. Único sitio con SQL de noticias; hacia fuera, camelCase.
 */

/**
 * Lo que la tarjeta de Este mes necesita del producto enlazado para pintar
 * el precio y el botón de añadir: lo mismo que `ProductCard` recibe de la
 * carta. Se lee de la ficha en cada consulta, nunca se copia a la noticia:
 * un precio cambiado en el panel se ve a la vez en la carta y en Este mes.
 */
export type ProductoEnNoticia = {
  slug: string;
  name: string;
  /** Un pack no se añade desde la noticia: hay que elegir en su ficha. */
  category: string;
  priceCents: number | null;
  consultar: boolean;
  activo: boolean;
  agotado: boolean;
  unit: string | null;
  variantes: { id: string; label: string; priceCents: number; precioAntesCents?: number }[];
} & ConOferta;

export type Noticia = {
  id: string;
  slug: string;
  titulo: string;
  excerpt: string;
  cuerpo: string;
  fecha: string;
  imageUrl: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  tags: string[];
  publicada: boolean;
  /** Producto de la carta que se puede añadir desde la noticia, si lo hay. */
  productoId: string | null;
  producto: ProductoEnNoticia | null;
  /** Precio de oferta del producto enlazado, si no tiene tamaños. */
  ofertaCents: number | null;
  /** Precio de oferta por tamaño (`variant_id` → céntimos). */
  ofertaVariantes: Record<string, number>;
  /** Último día de la oferta (`YYYY-MM-DD`); `null` = mientras esté publicada. */
  ofertaHasta: string | null;
  /** Cuándo se mandó a los suscritos a las ofertas; `null` = no se ha mandado. */
  enviadaEn: Date | null;
};

export type DatosNoticia = {
  titulo: string;
  excerpt: string;
  cuerpo: string;
  fecha: string;
  imageUrl: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  tags: string[];
  publicada: boolean;
  /** Opcional y no obligatorio en el tipo: el volcado del Markdown no lo trae. */
  productoId?: string | null;
  ofertaCents?: number | null;
  ofertaVariantes?: Record<string, number>;
  ofertaHasta?: string | null;
  /** Solo lo usa el volcado inicial, para conservar las URLs de siempre. */
  slug?: string;
};

// `producto` es una subconsulta correlada sobre `noticias.producto_id`, con
// el nombre de la tabla explícito para que valga igual en un `select ... from
// noticias` que en el `returning` de un insert o un update.
const CAMPOS = `
  id, slug, titulo, excerpt, cuerpo,
  to_char(fecha, 'YYYY-MM-DD') as fecha,
  image_url    as "imageUrl",
  image_alt    as "imageAlt",
  image_width  as "imageWidth",
  image_height as "imageHeight",
  tags, publicada,
  producto_id  as "productoId",
  oferta_cents as "ofertaCents",
  oferta_variantes as "ofertaVariantes",
  to_char(oferta_hasta, 'YYYY-MM-DD') as "ofertaHasta",
  enviada_en as "enviadaEn",
  (select json_build_object(
            'slug', p.slug, 'name', p.name, 'category', p.category,
            'priceCents', p.price_cents, 'consultar', p.consultar,
            'activo', p.activo, 'agotado', p.agotado, 'unit', p.unit,
            'variantes', coalesce(
              (select json_agg(json_build_object(
                         'id', v.variant_id, 'label', v.label,
                         'priceCents', v.price_cents)
                       order by v.orden)
                 from variantes v where v.producto_id = p.id),
              '[]'::json))
     from productos p where p.id = noticias.producto_id) as producto
`;

/**
 * Lo público (solo publicadas) lleva el producto enlazado con las ofertas
 * vigentes ya aplicadas, igual que la carta: la tarjeta cobra lo que enseña.
 * El panel lo ve sin rebajar.
 */
async function conOfertas(noticias: Noticia[]): Promise<Noticia[]> {
  const slugs = noticias.flatMap((n) => (n.producto ? [n.producto.slug] : []));
  if (slugs.length === 0) return noticias;
  const ofertas = await ofertasVigentes(slugs);
  return noticias.map((n) =>
    n.producto
      ? { ...n, producto: aplicaOferta(n.producto, ofertas.get(n.producto.slug), (v) => v.id) }
      : n,
  );
}

export async function listarNoticias({
  soloPublicadas,
}: {
  soloPublicadas: boolean;
}): Promise<Noticia[]> {
  const { rows } = await pool.query<Noticia>(
    `select ${CAMPOS} from noticias
      ${soloPublicadas ? "where publicada" : ""}
      order by fecha desc, created_at desc`,
  );
  return soloPublicadas ? conOfertas(rows) : rows;
}

export async function obtenerNoticia(
  slug: string,
  { soloPublicada = false }: { soloPublicada?: boolean } = {},
): Promise<Noticia | null> {
  const { rows } = await pool.query<Noticia>(
    `select ${CAMPOS} from noticias
      where slug = $1 ${soloPublicada ? "and publicada" : ""}`,
    [slug],
  );
  if (!rows[0]) return null;
  return soloPublicada ? (await conOfertas(rows))[0] : rows[0];
}

/** Sin producto no hay oferta: no se guarda una que no se aplicaría a nada. */
function valoresOferta(datos: DatosNoticia) {
  const conProducto = Boolean(datos.productoId);
  return [
    conProducto ? (datos.ofertaCents ?? null) : null,
    // `pg` pasaría un objeto de JS tal cual; la columna es jsonb.
    JSON.stringify(conProducto ? (datos.ofertaVariantes ?? {}) : {}),
    conProducto ? (datos.ofertaHasta ?? null) : null,
  ];
}

export async function crearNoticia(datos: DatosNoticia): Promise<Noticia> {
  try {
    const { rows } = await pool.query<Noticia>(
      `insert into noticias
         (slug, titulo, excerpt, cuerpo, fecha, image_url, image_alt,
          image_width, image_height, tags, publicada, producto_id,
          oferta_cents, oferta_variantes, oferta_hasta)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       returning ${CAMPOS}`,
      [
        datos.slug ?? slugify(datos.titulo),
        datos.titulo,
        datos.excerpt,
        datos.cuerpo,
        datos.fecha,
        datos.imageUrl,
        datos.imageAlt,
        datos.imageWidth,
        datos.imageHeight,
        datos.tags,
        datos.publicada,
        datos.productoId ?? null,
        ...valoresOferta(datos),
      ],
    );
    return rows[0];
  } catch (err) {
    traduce(err);
  }
}

/**
 * El slug NO se recalcula al editar: si alguien corrige una errata del título,
 * la URL que ya está compartida por ahí fuera tiene que seguir funcionando.
 */
export async function actualizarNoticia(
  id: string,
  datos: DatosNoticia,
): Promise<Noticia | null> {
  try {
    const { rows } = await pool.query<Noticia>(
      `update noticias set
         titulo = $2, excerpt = $3, cuerpo = $4, fecha = $5,
         image_url = $6, image_alt = $7, image_width = $8, image_height = $9,
         tags = $10, publicada = $11, producto_id = $12,
         oferta_cents = $13, oferta_variantes = $14, oferta_hasta = $15,
         updated_at = now()
       where id = $1
       returning ${CAMPOS}`,
      [
        id,
        datos.titulo,
        datos.excerpt,
        datos.cuerpo,
        datos.fecha,
        datos.imageUrl,
        datos.imageAlt,
        datos.imageWidth,
        datos.imageHeight,
        datos.tags,
        datos.publicada,
        datos.productoId ?? null,
        ...valoresOferta(datos),
      ],
    );
    return rows[0] ?? null;
  } catch (err) {
    traduce(err);
  }
}

/**
 * Devuelve el slug de la noticia borrada, o null si no había ninguna con ese
 * id. El slug hace falta arriba: una noticia borrada tiene que desaparecer
 * también de SU PROPIA página (`/noticias/<slug>`), no solo de los listados,
 * y esa ruta solo se puede invalidar sabiendo cuál era. Con un simple
 * recuento, la promoción con el precio mal se quedaba viva en su URL —
 * compartida e indexada— hasta el siguiente despliegue.
 */
export async function borrarNoticia(id: string): Promise<string | null> {
  const { rows } = await pool.query<{ slug: string }>(
    "delete from noticias where id = $1 returning slug",
    [id],
  );
  return rows[0]?.slug ?? null;
}

/**
 * Reserva el envío de una noticia a los suscritos: la marca como enviada
 * solo si no lo estaba, en una sentencia, para que dos clics seguidos no
 * manden el correo dos veces. `false` si ya estaba enviada (o no existe).
 */
export async function reservarEnvio(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "update noticias set enviada_en = now() where id = $1 and enviada_en is null",
    [id],
  );
  return (rowCount ?? 0) > 0;
}

/** Deshace la reserva cuando el envío no llegó a salir, para poder reintentar. */
export async function anularEnvio(id: string): Promise<void> {
  await pool.query("update noticias set enviada_en = null where id = $1", [id]);
}
