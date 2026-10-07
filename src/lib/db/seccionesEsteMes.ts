import { pool } from "~/lib/db/pool";
import { listarProductos, type Producto } from "~/lib/db/productos";

/**
 * Secciones de «Este mes» (migración 018): título, frase y productos de la
 * carta elegidos en el panel. Único sitio con SQL de las dos tablas.
 *
 * Cada producto puede llevar un precio de oferta, como el de una noticia
 * (migración 019, `~/lib/ofertas.ts`): se aplica en toda la web mientras la
 * sección esté publicada y hasta `ofertaHasta`.
 */
export type OfertaEnSeccion = {
  /** Precio de oferta si el producto no tiene tamaños. */
  ofertaCents: number | null;
  /** Precio de oferta por tamaño (`variant_id` → céntimos). */
  ofertaVariantes: Record<string, number>;
};

export type SeccionEsteMes = {
  id: string;
  titulo: string;
  descripcion: string;
  orden: number;
  publicada: boolean;
  /** Ids de los productos, en el orden elegido. */
  productoIds: string[];
  /** Ofertas por id de producto; los que no salen aquí, al precio de siempre. */
  ofertas: Record<string, OfertaEnSeccion>;
  /** Último día de las ofertas (`YYYY-MM-DD`); `null` = mientras esté publicada. */
  ofertaHasta: string | null;
};

export type DatosSeccion = Omit<SeccionEsteMes, "id" | "ofertas" | "ofertaHasta"> &
  Partial<Pick<SeccionEsteMes, "ofertas" | "ofertaHasta">>;

/** Una sección pública, con sus productos ya leídos de la carta. */
export type SeccionPublica = {
  id: string;
  titulo: string;
  descripcion: string;
  productos: Producto[];
};

const CAMPOS = `
  s.id, s.titulo, s.descripcion, s.orden, s.publicada,
  to_char(s.oferta_hasta, 'YYYY-MM-DD') as "ofertaHasta",
  coalesce(
    (select jsonb_object_agg(sp.producto_id::text, jsonb_build_object(
              'ofertaCents', sp.oferta_cents, 'ofertaVariantes', sp.oferta_variantes))
       from secciones_este_mes_productos sp
      where sp.seccion_id = s.id
        and (sp.oferta_cents is not null or sp.oferta_variantes <> '{}'::jsonb)),
    '{}'
  ) as ofertas,
  coalesce(
    (select array_agg(sp.producto_id::text order by sp.orden)
       from secciones_este_mes_productos sp where sp.seccion_id = s.id),
    '{}'
  ) as "productoIds"`;

/** Para el panel: todas, publicadas o no, en su orden. */
export async function listarSecciones(): Promise<SeccionEsteMes[]> {
  const { rows } = await pool.query<SeccionEsteMes>(
    `select ${CAMPOS} from secciones_este_mes s order by s.orden, s.created_at`,
  );
  return rows;
}

/**
 * Para la web: solo las publicadas, con los productos activos de la carta
 * (con las ofertas de Este mes aplicadas, como en el catálogo). Una sección
 * que se queda sin ningún producto activo no se enseña.
 */
export async function seccionesPublicas(): Promise<SeccionPublica[]> {
  const { rows } = await pool.query<SeccionEsteMes>(
    `select ${CAMPOS} from secciones_este_mes s
      where s.publicada order by s.orden, s.created_at`,
  );
  if (rows.length === 0) return [];
  const porId = new Map(
    (await listarProductos({ soloActivos: true, conOfertas: true })).map((p) => [p.id, p]),
  );
  return rows
    .map((s) => ({
      id: s.id,
      titulo: s.titulo,
      descripcion: s.descripcion,
      productos: s.productoIds.flatMap((id) => porId.get(id) ?? []),
    }))
    .filter((s) => s.productos.length > 0);
}

/** Escribe los productos de una sección, con su oferta: se borran y se vuelven a poner. */
async function guardaProductos(
  cliente: import("pg").PoolClient,
  seccionId: string,
  d: DatosSeccion,
) {
  await cliente.query("delete from secciones_este_mes_productos where seccion_id = $1", [seccionId]);
  for (const [orden, productoId] of [...new Set(d.productoIds)].entries()) {
    const oferta = d.ofertas?.[productoId];
    await cliente.query(
      `insert into secciones_este_mes_productos
         (seccion_id, producto_id, orden, oferta_cents, oferta_variantes)
       values ($1, $2, $3, $4, $5)`,
      [seccionId, productoId, orden, oferta?.ofertaCents ?? null, JSON.stringify(oferta?.ofertaVariantes ?? {})],
    );
  }
}

/** Lee una sección con el cliente de la transacción (nunca con `pool`: ver `crearProducto`). */
async function leeConCliente(cliente: import("pg").PoolClient, id: string): Promise<SeccionEsteMes | null> {
  const { rows } = await cliente.query<SeccionEsteMes>(
    `select ${CAMPOS} from secciones_este_mes s where s.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function crearSeccion(d: DatosSeccion): Promise<SeccionEsteMes> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const { rows } = await cliente.query<{ id: string }>(
      `insert into secciones_este_mes (titulo, descripcion, orden, publicada, oferta_hasta)
       values ($1, $2, $3, $4, $5) returning id`,
      [d.titulo, d.descripcion, d.orden, d.publicada, d.ofertaHasta ?? null],
    );
    await guardaProductos(cliente, rows[0].id, d);
    await cliente.query("commit");
    return (await leeConCliente(cliente, rows[0].id))!;
  } catch (err) {
    await cliente.query("rollback");
    throw err;
  } finally {
    cliente.release();
  }
}

export async function actualizarSeccion(id: string, d: DatosSeccion): Promise<SeccionEsteMes | null> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const { rowCount } = await cliente.query(
      `update secciones_este_mes
          set titulo = $2, descripcion = $3, orden = $4, publicada = $5,
              oferta_hasta = $6, updated_at = now()
        where id = $1`,
      [id, d.titulo, d.descripcion, d.orden, d.publicada, d.ofertaHasta ?? null],
    );
    if (!rowCount) {
      await cliente.query("rollback");
      return null;
    }
    await guardaProductos(cliente, id, d);
    await cliente.query("commit");
    return await leeConCliente(cliente, id);
  } catch (err) {
    await cliente.query("rollback");
    throw err;
  } finally {
    cliente.release();
  }
}

/** Guarda el orden elegido en el panel: `ids` de la primera a la última. */
export async function ordenarSecciones(ids: string[]): Promise<void> {
  await pool.query(
    `update secciones_este_mes s set orden = o.pos, updated_at = now()
       from unnest($1::uuid[]) with ordinality as o(id, pos)
      where s.id = o.id`,
    [ids],
  );
}

export async function borrarSeccion(id: string): Promise<boolean> {
  const { rowCount } = await pool.query("delete from secciones_este_mes where id = $1", [id]);
  return (rowCount ?? 0) > 0;
}
