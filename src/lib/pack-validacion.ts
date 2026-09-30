import { z } from "zod";
import type { DatosPack } from "~/lib/db/packs";
import {
  opcionesDeHueco,
  precioSueltoCents,
  type DefinicionPack,
  type HuecoEleccion,
  type ProductoPieza,
} from "~/data/packs";
import { seccionIds } from "~/data/secciones";

/**
 * Lo que manda el panel al guardar un pack: `DatosPack` sin `slug` (lo genera
 * el servidor al crear; al editar viene de la URL). Precios en céntimos enteros:
 * el panel convierte euros a céntimos antes de enviar.
 */
export type DatosPackEntrada = Omit<DatosPack, "slug">;

/**
 * `donde` sitúa el mensaje junto al campo correcto. Formato estable:
 *  - campo del pack: "nombre", "descriptor", "precio", "personas", "piezas"
 *  - una pieza por su posición (desde 1): "pieza 2"
 *  - un hueco de elección por su etiqueta: "hueco «Sabor de la empanada»"
 *    (si la etiqueta está vacía: "hueco 3", con la posición de la pieza)
 */
export type Problema = { donde: string; mensaje: string };

const MAX_HUECOS = 8; // el checkout no acepta más elecciones (pedido.ts)
const ID_HUECO = /^[a-z0-9-]{1,40}$/;

const texto = (max: number) => z.string().max(max, `Máximo ${max} caracteres.`);

const piezaFija = z.object({
  tipo: z.literal("fija"),
  slug: z.string().min(1),
  variantId: z.string().min(1).optional(),
  titulo: texto(200),
  descripcion: texto(300),
  requiereFoto: z.literal(true).optional(),
  rotulo: texto(200).optional(),
});

// `seccion` y `slugs` son ambos opcionales a propósito: que vengan los dos o
// ninguno lo cuenta `comprobarPack` con un mensaje claro, no un fallo de esquema.
const piezaHueco = z.object({
  tipo: z.literal("eleccion"),
  id: z.string(),
  titulo: texto(200),
  descripcion: texto(300),
  etiqueta: texto(100),
  variantId: z.string().min(1).optional(),
  seccion: z.string().optional(),
  slugs: z.array(z.string()).optional(),
});

const esquema = z.object({
  name: texto(120),
  priceCents: z.number().int(),
  shortDescription: texto(200),
  imageUrl: z.string().nullable(),
  imageAlt: z.string().nullable(),
  imageWidth: z.number().int().nullable(),
  imageHeight: z.number().int().nullable(),
  activo: z.boolean(),
  agotado: z.boolean(),
  orden: z.number().int(),
  definicion: z.object({
    ocasion: texto(120),
    personas: z.object({
      min: z.number().int(),
      max: z.number().int(),
      texto: texto(80),
    }),
    paraQuien: z.array(texto(400)).max(10),
    consejo: texto(600).optional(),
    piezas: z.array(z.discriminatedUnion("tipo", [piezaFija, piezaHueco])).max(30),
  }),
});

export const esquemaPack = esquema as unknown as z.ZodType<DatosPackEntrada>;

type PiezaCruda = z.infer<typeof piezaFija> | z.infer<typeof piezaHueco>;

const comillas = (s: string) => `«${s}»`;

export function comprobarPack(
  datos: DatosPackEntrada,
  carta: readonly ProductoPieza[],
): { errores: Problema[]; avisos: Problema[] } {
  const errores: Problema[] = [];
  const avisos: Problema[] = [];
  const error = (donde: string, mensaje: string) => errores.push({ donde, mensaje });
  const aviso = (donde: string, mensaje: string) => avisos.push({ donde, mensaje });

  if (datos.name.trim().length < 2) error("nombre", "El nombre del pack necesita al menos 2 letras.");
  if (datos.shortDescription.trim().length < 3) {
    error("descriptor", "Escribe una frase corta que describa el pack (mínimo 3 letras).");
  }
  if (!(datos.priceCents > 0)) error("precio", "El precio tiene que ser mayor que 0 €.");

  const { min, max } = datos.definicion.personas;
  if (min > max) error("personas", "El mínimo de personas no puede ser mayor que el máximo.");

  const piezas = datos.definicion.piezas as readonly PiezaCruda[];
  if (piezas.length === 0) error("piezas", "El pack necesita al menos una pieza.");

  const porSlug = new Map(carta.map((p) => [p.slug, p]));
  const fotos: number[] = [];
  const huecosVistos = new Set<string>();
  const avisadas: string[] = [];
  let huecos = 0;

  piezas.forEach((pieza, i) => {
    const n = i + 1;
    if (pieza.tipo === "fija") {
      const donde = `pieza ${n}`;
      if (pieza.requiereFoto) fotos.push(n);
      const x = porSlug.get(pieza.slug);
      if (!x) {
        error(donde, `La pieza ${n} usa el producto «${pieza.slug}», que no existe en la carta o es otro pack.`);
        return;
      }
      const tieneTamanos = x.variantes.length > 0;
      if (!pieza.variantId) {
        if (tieneTamanos) {
          error(donde, `La pieza ${n} es ${comillas(x.name)}, que tiene varios tamaños: elige uno.`);
        }
      } else {
        const v = x.variantes.find((v) => v.variantId === pieza.variantId);
        if (!v) {
          error(donde, `La pieza ${n} pide el tamaño ${comillas(pieza.variantId)} y ${comillas(x.name)} no lo tiene.`);
        }
      }
      if (!x.activo || x.agotado) avisadas.push(x.name);
      return;
    }

    huecos++;
    const et = pieza.etiqueta.trim();
    const donde = et ? `hueco ${comillas(et)}` : `hueco ${n}`;
    const nombreHueco = et ? comillas(et) : `de la pieza ${n}`;
    if (!ID_HUECO.test(pieza.id)) {
      error(donde, `El hueco ${nombreHueco} tiene un identificador no válido (solo minúsculas, números y guiones, hasta 40).`);
    } else if (huecosVistos.has(pieza.id)) {
      error(donde, `El hueco ${nombreHueco} repite el identificador «${pieza.id}»: cada hueco necesita uno distinto.`);
    }
    huecosVistos.add(pieza.id);

    const tieneSeccion = pieza.seccion !== undefined;
    const tieneSlugs = pieza.slugs !== undefined;
    if (tieneSeccion && tieneSlugs) {
      error(donde, `El hueco ${nombreHueco} tiene a la vez una sección y una lista de productos: elige solo una de las dos.`);
      return;
    }
    if (!tieneSeccion && !tieneSlugs) {
      error(donde, `El hueco ${nombreHueco} no dice entre qué productos se elige: indica una sección o una lista.`);
      return;
    }
    if (tieneSeccion) {
      if (!(seccionIds as readonly string[]).includes(pieza.seccion!)) {
        error(donde, `La sección «${pieza.seccion}» del hueco ${nombreHueco} no existe en la carta.`);
        return;
      }
    } else {
      if (pieza.slugs!.length === 0) {
        error(donde, `La lista de productos del hueco ${nombreHueco} está vacía.`);
        return;
      }
      const faltan = pieza.slugs!.filter((s) => !porSlug.has(s));
      for (const s of faltan) {
        error(donde, `El producto «${s}» del hueco ${nombreHueco} no existe en la carta o es un pack.`);
      }
      if (faltan.length > 0) return;
    }
    if (opcionesDeHueco(pieza as HuecoEleccion, carta).length === 0) {
      error(donde, `Hoy no se puede vender ninguna opción del hueco ${nombreHueco}: todas están agotadas, desactivadas o no tienen el tamaño pedido.`);
    }
  });

  if (fotos.length > 1) {
    error(`pieza ${fotos[1]}`, "Solo una pieza del pack puede pedir la foto del cliente.");
  }
  if (huecos > MAX_HUECOS) {
    error("piezas", `Un pack admite como máximo ${MAX_HUECOS} huecos de elección y este tiene ${huecos}.`);
  }

  for (const nombre of new Set(avisadas)) {
    aviso("piezas", `${comillas(nombre)} está agotado o desactivado hoy: la ficha saldrá como no disponible.`);
  }

  // Solo se compara con el precio suelto si el pack se puede calcular.
  if (datos.priceCents > 0 && errores.length === 0) {
    const def = { slug: "", ...datos.definicion } as DefinicionPack;
    const suelto = precioSueltoCents(def, carta);
    if (suelto !== null && datos.priceCents >= suelto) {
      aviso("precio", "Este pack no ahorra nada: cuesta lo mismo o más que comprar las piezas sueltas.");
    }
  }

  return { errores, avisos };
}
