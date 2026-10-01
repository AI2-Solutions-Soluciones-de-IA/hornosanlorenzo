import {
  pool,
  type Ejecutor,
  type ClienteEnTransaccion,
} from "~/lib/db/pool";
import { slugify } from "~/lib/slug";
import { ProductoError, traduce } from "~/lib/db/productosErrores";

// Reexportado para que quien ya importaba `ProductoError` desde aquí (tests,
// y las tareas 15-19 que la citan por nombre) lo siga encontrando sin
// cambiar nada: vive en `productosErrores.ts` únicamente para que las
// pruebas de la traducción puedan importarla sin arrastrar `~/lib/db/pool`
// (ver el comentario de ese fichero). Mismo patrón que `noticias.ts`.
export { ProductoError };

/**
 * Productos y variantes. Sustituye a la colección de contenido como fuente de
 * verdad del catálogo. Único sitio con SQL de productos; hacia fuera,
 * camelCase y sin nombres de columna.
 */

export type Variante = {
  variantId: string;
  label: string;
  priceCents: number;
  orden: number;
};

/** Una foto del carrusel de la ficha, después de la principal. */
export type FotoExtra = {
  url: string;
  alt: string;
  ancho: number;
  alto: number;
};

export type Producto = {
  id: string;
  slug: string;
  name: string;
  category: string;
  seccion: string | null;
  priceCents: number | null;
  consultar: boolean;
  unit: string | null;
  shortDescription: string;
  cuerpo: string;
  allergens: string[];
  destacado: boolean;
  temporada: boolean;
  orden: number;
  imageUrl: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /** Las fotos que siguen a la principal en el carrusel de la ficha. */
  fotosExtra: FotoExtra[];
  /** La foto principal es de un producto parecido, hasta que llegue la suya. */
  fotoProvisional: boolean;
  activo: boolean;
  agotado: boolean;
  /** Etiqueta de la carta, p. ej. «Especialidad desde 1986». `null` = ninguna. */
  especialidad: string | null;
  variantes: Variante[];
};

/** Lo justo que necesita `priceOrder` para poner precio a una línea. */
export type ProductoVendible = {
  slug: string;
  name: string;
  /** Categoría y sección: los packs eligen «una empanada» por sección. */
  category: string;
  seccion: string | null;
  priceCents: number | null;
  consultar: boolean;
  activo: boolean;
  agotado: boolean;
  variantes: { variantId: string; label: string; priceCents: number }[];
};

export type DatosProducto = Omit<Producto, "id" | "slug" | "variantes"> & {
  variantes: Variante[];
  /** Solo lo usa el volcado inicial, para conservar las URLs de siempre. */
  slug?: string;
};

const CAMPOS = `
  p.id, p.slug, p.name, p.category, p.seccion,
  p.price_cents       as "priceCents",
  p.consultar, p.unit,
  p.short_description as "shortDescription",
  p.cuerpo, p.allergens,
  p.destacado, p.temporada, p.orden,
  p.image_url    as "imageUrl",
  p.image_alt    as "imageAlt",
  p.image_width  as "imageWidth",
  p.image_height as "imageHeight",
  p.fotos_extra  as "fotosExtra",
  p.foto_provisional as "fotoProvisional",
  p.activo, p.agotado, p.especialidad,
  coalesce(
    (select json_agg(json_build_object(
              'variantId', v.variant_id,
              'label', v.label,
              'priceCents', v.price_cents,
              'orden', v.orden)
            order by v.orden, v.label)
       from variantes v where v.producto_id = p.id),
    '[]'::json
  ) as variantes
`;

export async function listarProductos({
  soloActivos = true,
}: { soloActivos?: boolean } = {}): Promise<Producto[]> {
  const { rows } = await pool.query<Producto>(
    `select ${CAMPOS} from productos p
      ${soloActivos ? "where p.activo" : ""}
      order by p.orden, p.name`,
  );
  return rows;
}

/**
 * La consulta que arma un `Producto` a partir de su slug, parametrizada por
 * quién la ejecuta: el pool (uso normal, vía `obtenerProducto`) o un
 * `PoolClient` ya abierto. Existe para que `crearProducto` y
 * `actualizarProducto` puedan releer la fila recién escrita con el mismo
 * cliente que ya tienen reservado — ver el comentario en esas dos
 * funciones sobre por qué esa lectura no puede pasar por `pool`.
 */
async function buscaPorSlug(
  ejecutor: Ejecutor,
  slug: string,
  { soloActivo = false }: { soloActivo?: boolean } = {},
): Promise<Producto | null> {
  const { rows } = await ejecutor.query<Producto>(
    `select ${CAMPOS} from productos p
      where p.slug = $1 ${soloActivo ? "and p.activo" : ""}`,
    [slug],
  );
  return rows[0] ?? null;
}

export async function obtenerProducto(
  slug: string,
  opts: { soloActivo?: boolean } = {},
): Promise<Producto | null> {
  return buscaPorSlug(pool, slug, opts);
}

/**
 * Proyección de `ProductoVendible`, compartida por `productosParaPedido` y
 * `productosDeSecciones` para que las dos devuelvan exactamente lo mismo.
 */
const SELECT_VENDIBLE = `
  select p.slug, p.name, p.category, p.seccion,
         p.price_cents as "priceCents",
         p.consultar, p.activo, p.agotado,
         coalesce(
           (select json_agg(json_build_object(
                     'variantId', v.variant_id,
                     'label', v.label,
                     'priceCents', v.price_cents)
                   order by v.orden)
              from variantes v where v.producto_id = p.id),
           '[]'::json
         ) as variantes
    from productos p`;

/**
 * Lo que necesita el checkout: solo los productos pedidos, no el catálogo
 * entero. Devuelve también `activo` y `agotado` **sin filtrar por ellos** a
 * propósito: `priceOrder` tiene que poder decir «"X" ya no está disponible»
 * o «"X" se ha agotado», que no es lo mismo que «ese producto no existe».
 */
export async function productosParaPedido(
  slugs: string[],
): Promise<Map<string, ProductoVendible>> {
  if (slugs.length === 0) return new Map();

  const { rows } = await pool.query<ProductoVendible>(
    `${SELECT_VENDIBLE}
      where p.slug = any($1::text[])`,
    [slugs],
  );

  return new Map(rows.map((p) => [p.slug, p]));
}

/**
 * Todos los productos de unas secciones, para que un pack ofrezca «una
 * empanada» o «una quiche» a elegir. Igual que `productosParaPedido`, **no
 * filtra** por activo ni agotado: eso lo decide `opcionesDeHueco`, que es
 * quien sabe si un hueco se queda sin opciones. En orden de carta.
 */
export async function productosDeSecciones(
  secciones: string[],
): Promise<ProductoVendible[]> {
  if (secciones.length === 0) return [];

  const { rows } = await pool.query<ProductoVendible>(
    `${SELECT_VENDIBLE}
      where p.seccion = any($1::text[])
      order by p.orden, p.name`,
    [secciones],
  );
  return rows;
}

/**
 * Crear y editar comparten el guardado de variantes, y va en transacción: un
 * producto con las variantes a medias es un producto con precios erróneos.
 * Mismo patrón que `crearPedidoReconstruido` en `~/lib/db/pedidos.ts`: se
 * borran y se vuelven a escribir dentro de la transacción, para que el
 * proyecto tenga una sola forma de sustituir un conjunto de filas hijas en
 * vez de dos.
 */
async function guardaVariantes(
  cliente: ClienteEnTransaccion,
  productoId: string,
  variantes: Variante[],
): Promise<void> {
  // Se borran y se vuelven a escribir: es lo único que deja el resultado
  // igual a lo que enseña el formulario, sin acumular las que se quitaron.
  await cliente.query("delete from variantes where producto_id = $1", [
    productoId,
  ]);
  for (const v of variantes) {
    await cliente.query(
      `insert into variantes (producto_id, variant_id, label, price_cents, orden)
       values ($1,$2,$3,$4,$5)`,
      [productoId, v.variantId, v.label, v.priceCents, v.orden],
    );
  }
}

const VALORES = (datos: DatosProducto) => [
  datos.name,
  datos.category,
  datos.seccion,
  datos.priceCents,
  datos.consultar,
  datos.unit,
  datos.shortDescription,
  datos.cuerpo,
  datos.allergens,
  datos.destacado,
  datos.temporada,
  datos.orden,
  datos.imageUrl,
  datos.imageAlt,
  datos.imageWidth,
  datos.imageHeight,
  datos.activo,
  datos.agotado,
  datos.especialidad,
  // `pg` pasaría un array de JS como array de Postgres, no como JSON.
  JSON.stringify(datos.fotosExtra),
  datos.fotoProvisional,
];

export async function crearProducto(datos: DatosProducto): Promise<Producto> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const { rows } = await cliente.query<{ id: string; slug: string }>(
      `insert into productos
         (name, category, seccion, price_cents, consultar, unit,
          short_description, cuerpo, allergens, destacado, temporada, orden,
          image_url, image_alt, image_width, image_height, activo, agotado,
          especialidad, fotos_extra, foto_provisional, slug)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       returning id, slug`,
      [...VALORES(datos), datos.slug ?? slugify(datos.name)],
    );
    await guardaVariantes(cliente, rows[0].id, datos.variantes);
    await cliente.query("commit");
    // Se relee con `cliente`, no con `obtenerProducto` (que usa `pool`):
    // `cliente` ya tiene una conexión reservada del pool, y `pool.query`
    // pediría una segunda. Con varias escrituras a la vez y el pool a
    // tope (`max: 3` en `pool.ts`), cada `cliente` quedaría esperando un
    // hueco para esta lectura mientras él mismo ocupa uno de los que
    // faltan — interbloqueo, no solo lentitud. `connectionTimeoutMillis`
    // en `pool.ts` es la segunda barrera, por si esto se reintroduce.
    return (await buscaPorSlug(cliente, rows[0].slug))!;
  } catch (err) {
    await cliente.query("rollback");
    traduce(err);
  } finally {
    cliente.release();
  }
}

/**
 * El slug NO se recalcula al editar: cambiar el nombre de una ficha no puede
 * romper la URL que ya está compartida ni el enlace que tiene alguien en un
 * carrito a medio hacer.
 */
export async function actualizarProducto(
  id: string,
  datos: DatosProducto,
): Promise<Producto | null> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const { rows } = await cliente.query<{ slug: string }>(
      `update productos set
         name = $1, category = $2, seccion = $3, price_cents = $4,
         consultar = $5, unit = $6, short_description = $7, cuerpo = $8,
         allergens = $9, destacado = $10, temporada = $11, orden = $12,
         image_url = $13, image_alt = $14, image_width = $15, image_height = $16,
         activo = $17, agotado = $18, especialidad = $19, fotos_extra = $20,
         foto_provisional = $21, updated_at = now()
       where id = $22
       returning slug`,
      [...VALORES(datos), id],
    );

    if (rows.length === 0) {
      await cliente.query("rollback");
      return null;
    }

    await guardaVariantes(cliente, id, datos.variantes);
    await cliente.query("commit");
    // Mismo motivo que en `crearProducto`: releer con `cliente`, no con
    // `obtenerProducto`/`pool`, para no pedir una segunda conexión
    // mientras esta sigue reservada.
    return await buscaPorSlug(cliente, rows[0].slug);
  } catch (err) {
    await cliente.query("rollback");
    traduce(err);
  } finally {
    cliente.release();
  }
}
