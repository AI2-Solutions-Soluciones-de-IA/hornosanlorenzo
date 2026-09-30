/**
 * Contrato de `/api/admin/packs`, compartido con la isla del editor.
 * Solo tipos: nada de servidor, para que la isla lo importe sin arrastrar
 * código que no puede ir al navegador.
 *
 *  GET  /api/admin/packs            -> RespuestaGetPacks
 *  POST /api/admin/packs            -> 201 RespuestaGuardarPack | 400 RespuestaErrores
 *       cuerpo: DatosPackEntrada (sin slug; lo genera el servidor con el nombre)
 *  PUT  /api/admin/packs?slug=<slug> -> 200 RespuestaGuardarPack | 400 RespuestaErrores
 *       | 404 { error }. El slug va SIEMPRE en la query (nunca en el cuerpo) y
 *       no se puede cambiar: es la URL y la referencia de los pedidos.
 */
import type { DatosPackEntrada, Problema } from "~/lib/pack-validacion";

export type { DatosPackEntrada, Problema };

/** Un pack tal y como lo edita el panel: la entrada más lo que se calcula. */
export type PackAdmin = DatosPackEntrada & {
  slug: string;
  /** Suma de las piezas al precio de carta (opción más barata en cada hueco); null si no se puede calcular. */
  sueltoCents: number | null;
  /** % de ahorro entero, o null si no ahorra o no se puede calcular. */
  ahorroPct: number | null;
};

/** Lo que el editor necesita saber de un producto de la carta para elegir piezas. */
export type ProductoCarta = {
  slug: string;
  name: string;
  seccion: string | null;
  priceCents: number | null;
  consultar: boolean;
  activo: boolean;
  agotado: boolean;
  variantes: { variantId: string; label: string; priceCents: number }[];
};

export type RespuestaGetPacks = {
  packs: PackAdmin[];
  /** Todos los productos que NO son pack, activos o no. */
  carta: ProductoCarta[];
};

export type RespuestaGuardarPack = {
  slug: string;
  /** Lo dudoso que no impide guardar (p. ej. «no ahorra nada»). */
  avisos: Problema[];
};

export type RespuestaErrores = { errores: Problema[] };
