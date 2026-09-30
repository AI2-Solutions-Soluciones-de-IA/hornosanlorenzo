import {
  ahorroPct,
  opcionesDeHueco,
  PackError,
  precioPorPersonaCents,
  precioSueltoCents,
  resolverPack,
  type DefinicionPack,
  type ProductoPieza,
} from "~/data/packs";
import type { PiezaPedido } from "~/lib/pack-pedido";

/**
 * Lo que la ficha y las tarjetas de un pack enseñan, calculado en servidor a
 * partir de su definición y de la carta. Sin base de datos: la lectura la
 * hace la página (un fallo de Postgres tiene que poder marcar la respuesta
 * como `no-store`, y eso solo funciona desde el frontmatter de la página).
 */
export type FichaPack = {
  /** En el orden de la ficha, con las opciones de cada hueco ya filtradas. */
  piezas: PiezaPedido[];
  sueltoCents: number | null;
  ahorro: number | null;
  /** null si el pack no tiene precio. */
  porPersonaCents: number | null;
  conFoto: boolean;
  /**
   * No se puede pedir hoy: el pack no tiene precio o está agotado, un hueco
   * se ha quedado sin opciones o una pieza fija no se puede vender. Mejor
   * decirlo en la ficha que dejar pedir algo que el checkout va a rechazar.
   */
  agotado: boolean;
};

/**
 * ¿Se pide solo desde su ficha? Un pack no admite compra rápida (tarjeta del
 * catálogo, noticia de Este mes): sin elegir sabores ni subir la foto, el
 * checkout lo rechaza. Donde iría el botón de añadir va «Ver el pack».
 */
export const seCompraDesdeLaFicha = (producto: { category: string }): boolean =>
  producto.category === "packs";

type PackEnCarta = {
  priceCents: number | null;
  consultar: boolean;
  agotado: boolean;
};

export function fichaPack(
  def: DefinicionPack,
  pack: PackEnCarta,
  productos: readonly ProductoPieza[],
): FichaPack {
  const piezas: PiezaPedido[] = def.piezas.map((p) =>
    p.tipo === "fija"
      ? { tipo: "fija", texto: p.titulo }
      : {
          tipo: "eleccion",
          id: p.id,
          titulo: p.titulo,
          etiqueta: p.etiqueta,
          opciones: opcionesDeHueco(p, productos).map(({ slug, name }) => ({
            slug,
            name,
          })),
        },
  );

  const sinPrecio = pack.priceCents === null || pack.consultar;
  const precio = pack.priceCents;
  const sueltoCents = precioSueltoCents(def, productos);

  return {
    piezas,
    sueltoCents,
    ahorro: precio === null ? null : ahorroPct(precio, sueltoCents),
    porPersonaCents:
      precio === null ? null : precioPorPersonaCents(precio, def),
    conFoto: def.piezas.some(
      (p) => p.tipo === "fija" && p.requiereFoto === true,
    ),
    agotado: sinPrecio || pack.agotado || !sePuedePedir(def, piezas, productos),
  };
}

/**
 * Se prueba el pack con la primera opción de cada hueco contra
 * `resolverPack`, la misma comprobación que hará el checkout: así la ficha
 * no puede discrepar de él sobre qué pieza fija está a la venta.
 */
function sePuedePedir(
  def: DefinicionPack,
  piezas: readonly PiezaPedido[],
  productos: readonly ProductoPieza[],
): boolean {
  const opciones: Record<string, string> = {};
  for (const p of piezas) {
    if (p.tipo !== "eleccion") continue;
    if (p.opciones.length === 0) return false;
    opciones[p.id] = p.opciones[0].slug;
  }
  try {
    resolverPack(def, new Map(productos.map((x) => [x.slug, x])), opciones);
    return true;
  } catch (error) {
    if (error instanceof PackError) return false;
    throw error;
  }
}
