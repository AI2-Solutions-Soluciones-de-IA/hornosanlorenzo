import { pool, type ClienteEnTransaccion } from "~/lib/db/pool";
import type { DefinicionPack, Pieza } from "~/data/packs";

/**
 * Definiciones de pack (composición y textos de la ficha). El pack en sí es
 * una fila de `productos` (categoría `packs`); aquí se lee y escribe lo que
 * antes vivía en `src/data/packs.ts`, con exactamente ese tipo hacia fuera.
 */

type FilaPieza = {
  tipo: "fija" | "eleccion";
  titulo: string;
  descripcion: string;
  variant_id: string | null;
  slug: string | null;
  requiere_foto: boolean;
  rotulo: string | null;
  hueco_id: string | null;
  etiqueta: string | null;
  seccion: string | null;
  slugs: string[] | null;
};

type FilaDefinicion = {
  slug: string;
  ocasion: string;
  personas_min: number;
  personas_max: number;
  personas_texto: string;
  para_quien: string[];
  consejo: string | null;
  piezas: FilaPieza[];
};

function aPieza(f: FilaPieza): Pieza {
  const variante = f.variant_id !== null ? { variantId: f.variant_id } : {};
  if (f.tipo === "fija") {
    return {
      tipo: "fija",
      slug: f.slug!,
      ...variante,
      titulo: f.titulo,
      descripcion: f.descripcion,
      ...(f.requiere_foto ? { requiereFoto: true as const } : {}),
      ...(f.rotulo !== null ? { rotulo: f.rotulo } : {}),
    };
  }
  return {
    tipo: "eleccion",
    id: f.hueco_id!,
    titulo: f.titulo,
    descripcion: f.descripcion,
    etiqueta: f.etiqueta!,
    ...variante,
    ...(f.seccion !== null ? { seccion: f.seccion } : { slugs: f.slugs! }),
  } as Pieza;
}

function aDefinicion(f: FilaDefinicion): DefinicionPack {
  return {
    slug: f.slug,
    ocasion: f.ocasion,
    personas: {
      min: f.personas_min,
      max: f.personas_max,
      texto: f.personas_texto,
    },
    paraQuien: f.para_quien,
    ...(f.consejo !== null ? { consejo: f.consejo } : {}),
    piezas: f.piezas.map(aPieza),
  };
}

const SELECT = `
  select p.slug, d.ocasion, d.personas_min, d.personas_max, d.personas_texto,
         d.para_quien, d.consejo,
         coalesce((
           select json_agg(json_build_object(
             'tipo', x.tipo, 'titulo', x.titulo, 'descripcion', x.descripcion,
             'variant_id', x.variant_id, 'slug', x.slug,
             'requiere_foto', x.requiere_foto, 'rotulo', x.rotulo,
             'hueco_id', x.hueco_id, 'etiqueta', x.etiqueta,
             'seccion', x.seccion, 'slugs', x.slugs
           ) order by x.orden)
           from pack_piezas x where x.producto_id = d.producto_id
         ), '[]'::json) as piezas
    from pack_definiciones d
    join productos p on p.id = d.producto_id`;

function aMapa(filas: FilaDefinicion[]): Map<string, DefinicionPack> {
  return new Map(filas.map((f) => [f.slug, aDefinicion(f)]));
}

/** Definiciones por slug del pack. Sin filtrar por activo: eso lo decide quien llama. */
export async function definicionesPorSlugs(
  slugs: string[],
): Promise<Map<string, DefinicionPack>> {
  if (slugs.length === 0) return new Map();
  const { rows } = await pool.query<FilaDefinicion>(
    `${SELECT} where p.slug = any($1::text[]) and p.category = 'packs'`,
    [slugs],
  );
  return aMapa(rows);
}

/** Todas, para el catálogo público y la invalidación de caché. */
export async function todasLasDefiniciones(): Promise<
  Map<string, DefinicionPack>
> {
  const { rows } = await pool.query<FilaDefinicion>(
    `${SELECT} where p.category = 'packs' order by p.orden, p.slug`,
  );
  return aMapa(rows);
}

/** Rutas públicas de todas las fichas de pack (para invalidar). */
export async function rutasDePacks(): Promise<string[]> {
  const { rows } = await pool.query<{ slug: string }>(
    `select slug from productos where category = 'packs' order by orden, slug`,
  );
  return rows.map((r) => `/catalogo/${r.slug}`);
}

export type DatosPack = {
  /** Solo al crear; al editar no cambia (es la URL y la referencia de pedidos). */
  slug?: string;
  name: string;
  priceCents: number;
  shortDescription: string; // el descriptor de la ficha
  imageUrl: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  activo: boolean;
  agotado: boolean;
  destacado: boolean;
  orden: number;
  definicion: Omit<DefinicionPack, "slug">;
};

async function guardaDefinicion(
  cliente: ClienteEnTransaccion,
  productoId: string,
  def: DatosPack["definicion"],
): Promise<void> {
  await cliente.query(
    `insert into pack_definiciones
       (producto_id, ocasion, personas_min, personas_max, personas_texto,
        para_quien, consejo)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (producto_id) do update set
       ocasion = excluded.ocasion, personas_min = excluded.personas_min,
       personas_max = excluded.personas_max,
       personas_texto = excluded.personas_texto,
       para_quien = excluded.para_quien, consejo = excluded.consejo`,
    [
      productoId,
      def.ocasion,
      def.personas.min,
      def.personas.max,
      def.personas.texto,
      [...def.paraQuien],
      def.consejo ?? null,
    ],
  );
  // Mismo patrón que `guardaVariantes`: se borran y se reescriben.
  await cliente.query("delete from pack_piezas where producto_id = $1", [
    productoId,
  ]);
  let orden = 0;
  for (const p of def.piezas) {
    orden += 1;
    const fija = p.tipo === "fija";
    await cliente.query(
      `insert into pack_piezas
         (producto_id, orden, tipo, titulo, descripcion, variant_id,
          slug, requiere_foto, rotulo, hueco_id, etiqueta, seccion, slugs)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        productoId,
        orden,
        p.tipo,
        p.titulo,
        p.descripcion,
        p.variantId ?? null,
        fija ? p.slug : null,
        fija ? (p.requiereFoto ?? false) : false,
        fija ? (p.rotulo ?? null) : null,
        fija ? null : p.id,
        fija ? null : p.etiqueta,
        !fija && "seccion" in p ? p.seccion : null,
        !fija && "slugs" in p ? [...p.slugs] : null,
      ],
    );
  }
}

const VALORES = (d: DatosPack) => [
  d.name,
  d.priceCents,
  d.shortDescription,
  d.imageUrl,
  d.imageAlt,
  d.imageWidth,
  d.imageHeight,
  d.activo,
  d.agotado,
  d.orden,
  d.destacado,
];

/** Crea el pack (fila de productos + definición + piezas). Devuelve el slug. */
export async function crearPack(
  datos: DatosPack & { slug: string },
): Promise<string> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const { rows } = await cliente.query<{ id: string }>(
      `insert into productos
         (name, price_cents, short_description, image_url, image_alt,
          image_width, image_height, activo, agotado, orden, destacado,
          slug, category, seccion, consultar, unit, cuerpo, allergens,
          temporada, especialidad)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
               $12,'packs','packs',false,null,'','{}',false,null)
       returning id`,
      [...VALORES(datos), datos.slug],
    );
    await guardaDefinicion(cliente, rows[0].id, datos.definicion);
    await cliente.query("commit");
    return datos.slug;
  } catch (err) {
    await cliente.query("rollback").catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}

/** Sustituye todo lo editable de un pack existente. Error si no existe o no es un pack. */
export async function actualizarPack(
  slug: string,
  datos: DatosPack,
): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const { rows } = await cliente.query<{ id: string }>(
      `update productos set
         name = $1, price_cents = $2, short_description = $3, image_url = $4,
         image_alt = $5, image_width = $6, image_height = $7, activo = $8,
         agotado = $9, orden = $10, destacado = $11, updated_at = now(),
         category = 'packs', seccion = 'packs', consultar = false, unit = null,
         cuerpo = '', allergens = '{}'
       where slug = $12 and category = 'packs'
       returning id`,
      [...VALORES(datos), slug],
    );
    if (rows.length === 0) {
      throw new Error(`«${slug}» no existe o no es un pack.`);
    }
    await guardaDefinicion(cliente, rows[0].id, datos.definicion);
    await cliente.query("commit");
  } catch (err) {
    await cliente.query("rollback").catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
}
