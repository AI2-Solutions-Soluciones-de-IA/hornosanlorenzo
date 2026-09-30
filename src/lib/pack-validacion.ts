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
  slug: z.string().min(1).max(120),
  variantId: z.string().min(1).max(40).optional(),
  titulo: texto(200),
  descripcion: texto(300),
  requiereFoto: z.literal(true).optional(),
  rotulo: texto(200).optional(),
});

// `seccion` y `slugs` son ambos opcionales a propósito: que vengan los dos o
// ninguno lo cuenta `comprobarPack` con un mensaje claro, no un fallo de esquema.
const piezaHueco = z.object({
  tipo: z.literal("eleccion"),
  id: z.string().max(40),
  titulo: texto(200),
  descripcion: texto(300),
  etiqueta: texto(100),
  variantId: z.string().min(1).max(40).optional(),
  seccion: z.string().max(40).optional(),
  slugs: z.array(z.string().max(120)).max(50).optional(),
});

const esquema = z.object({
  name: texto(120),
  priceCents: z.number().int().max(1_000_000),
  shortDescription: texto(200),
  imageUrl: z.string().max(500).url().nullable(),
  imageAlt: z.string().max(200).nullable(),
  imageWidth: z.number().int().min(1).max(20000).nullable(),
  imageHeight: z.number().int().min(1).max(20000).nullable(),
  activo: z.boolean(),
  agotado: z.boolean(),
  orden: z.number().int().min(0).max(9999),
  destacado: z.boolean().default(false),
  definicion: z.object({
    ocasion: texto(120),
    personas: z.object({
      min: z.number().int().min(1).max(1000),
      max: z.number().int().max(1000),
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
  else if (!/[\p{L}\p{N}]/u.test(datos.name)) error("nombre", "El nombre tiene que llevar alguna letra o número.");
  if (datos.shortDescription.trim().length < 3) {
    error("descriptor", "Escribe una frase corta que describa el pack (mínimo 3 letras).");
  }
  if (!(datos.priceCents > 0)) error("precio", "El precio tiene que ser mayor que 0 €.");

  const { min, max } = datos.definicion.personas;
  if (!(min >= 1)) error("personas", "El mínimo de personas tiene que ser al menos 1.");
  else if (min > max) error("personas", "El mínimo de personas no puede ser mayor que el máximo.");

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
      if (pieza.titulo.trim() === "") error(donde, `La pieza ${n} necesita un título: es lo que se lee en la ficha.`);
      if (pieza.requiereFoto) fotos.push(n);
      const x = porSlug.get(pieza.slug);
      if (!x) {
        error(donde, `La pieza ${n} usa el producto «${pieza.slug}», que no existe en la carta o es otro pack.`);
        return;
      }
      const errAntes = errores.length;
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
      if (errores.length === errAntes && (x.consultar || (!tieneTamanos && x.priceCents === null))) {
        error(donde, `${comillas(x.name)} no tiene precio de venta online: no se puede incluir en un pack.`);
      }
      if (!x.activo || x.agotado) avisadas.push(x.name);
      return;
    }

    huecos++;
    const et = pieza.etiqueta.trim();
    const donde = et ? `hueco ${comillas(et)}` : `hueco ${n}`;
    if (et === "") error(donde, `El hueco de la pieza ${n} necesita una etiqueta: es el nombre del desplegable («Sabor de la empanada»).`);
    if (pieza.titulo.trim() === "") error(donde, `El hueco ${et ? comillas(et) : `de la pieza ${n}`} necesita un título: es lo que se lee en la ficha.`);
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
    if (pieza.variantId) {
      // Estructural: un tamaño que ningún producto del hueco tiene (activo o no)
      // no se arregla esperando; que hoy no haya nada vendible, sí.
      const admitidos = tieneSeccion
        ? carta.filter((x) => x.seccion === pieza.seccion)
        : carta.filter((x) => pieza.slugs!.includes(x.slug));
      if (!admitidos.some((x) => x.variantes.some((v) => v.variantId === pieza.variantId))) {
        error(donde, `El tamaño ${comillas(pieza.variantId)} del hueco ${nombreHueco} no lo tiene ningún producto de su sección o lista.`);
        return;
      }
    }
    if (opcionesDeHueco(pieza as HuecoEleccion, carta).length === 0) {
      aviso(donde, `Hoy no hay ninguna opción disponible en ${nombreHueco}: la ficha saldrá como no disponible hasta que vuelva a haberla.`);
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
    } else if (suelto !== null && datos.priceCents * 2 < suelto) {
      aviso("precio", "El pack sale a menos de la mitad de lo que cuestan sus piezas: ¿está bien escrito el precio?");
    }
  }

  return { errores, avisos };
}

type IssueZod = {
  code: string;
  path: readonly PropertyKey[];
  origin?: string; // zod 4
  type?: string; // zod 3
  expected?: string;
};

const CAMPOS_RAIZ: Record<string, string> = {
  name: "nombre",
  priceCents: "precio",
  shortDescription: "descriptor",
  orden: "orden",
  activo: "estado",
  agotado: "estado",
  imageUrl: "foto",
  imageAlt: "foto",
  imageWidth: "foto",
  imageHeight: "foto",
};

const CAMPOS_DEFINICION: Record<string, string> = {
  ocasion: "ocasión",
  personas: "personas",
  paraQuien: "para quién",
  consejo: "consejo",
  piezas: "piezas",
};

/** `donde` de un fallo de esquema, en el formato documentado en `Problema`. */
function dondeDeIssue(path: readonly PropertyKey[]): string {
  const [raiz, campo, indice] = path.map(String);
  if (raiz !== "definicion") return CAMPOS_RAIZ[raiz] ?? "pack";
  if (campo === "piezas" && indice !== undefined && /^\d+$/.test(indice)) {
    return `pieza ${Number(indice) + 1}`;
  }
  return CAMPOS_DEFINICION[campo] ?? "pack";
}

function mensajeDeIssue(i: IssueZod): string {
  const tipo = i.origin ?? i.type;
  const numero = tipo === "number" || tipo === "int";
  if (i.code === "too_small") return numero ? "Está fuera de rango." : "Falta rellenarlo.";
  if (i.code === "too_big") return numero ? "Está fuera de rango." : "Es demasiado largo.";
  if (i.code === "invalid_type") {
    if (i.expected === "number" || i.expected === "int") return "No es un número válido.";
    if (i.expected === "string") return "Falta rellenarlo.";
  }
  return "Revisa este dato.";
}

/**
 * Los fallos de `esquemaPack` como `Problema[]`: un mensaje en castellano por
 * cada `donde` (el primero que aparece), como mucho 8.
 */
export function problemasDeEsquema(
  issues: readonly { code: string; path: readonly PropertyKey[] }[],
): Problema[] {
  const vistos = new Set<string>();
  const res: Problema[] = [];
  for (const crudo of issues) {
    const i = crudo as IssueZod;
    const donde = dondeDeIssue(i.path);
    if (vistos.has(donde)) continue;
    vistos.add(donde);
    res.push({ donde, mensaje: mensajeDeIssue(i) });
    if (res.length === 8) break;
  }
  return res;
}
