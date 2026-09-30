/**
 * El borrador del editor de packs del panel y su paso a lo que manda a la API.
 *
 * El formulario trabaja con texto (el precio en euros con coma, las personas
 * como las teclea quien rellena) y con una `clave` por pieza para React. Aquí
 * vive la única conversión a `DatosPackEntrada`, que es lo que valida
 * `comprobarPack` y guarda `/api/admin/packs`.
 *
 * Sin nada de servidor: lo importa la isla.
 */
import type { PackAdmin, ProductoCarta } from "~/lib/admin-packs-api";
import {
  comprobarPack,
  esquemaPack,
  problemasDeEsquema,
  type DatosPackEntrada,
  type Problema,
} from "~/lib/pack-validacion";
import type { Pieza } from "~/data/packs";
import { eurosACentimos } from "~/lib/euros";

export { eurosACentimos };

export type PiezaFijaBorrador = {
  clave: string;
  tipo: "fija";
  slug: string;
  /** "" = sin tamaño. */
  variantId: string;
  titulo: string;
  descripcion: string;
  requiereFoto: boolean;
  rotulo: string;
};

export type HuecoBorrador = {
  clave: string;
  tipo: "eleccion";
  /** Se genera una vez al crear el hueco y no se toca nunca: es la clave del carrito. */
  id: string;
  titulo: string;
  descripcion: string;
  etiqueta: string;
  /** "" = sin tamaño común. */
  variantId: string;
  modo: "seccion" | "lista";
  seccion: string;
  slugs: string[];
};

export type PiezaBorrador = PiezaFijaBorrador | HuecoBorrador;

export type Borrador = {
  name: string;
  precioEuros: string;
  shortDescription: string;
  orden: number;
  activo: boolean;
  agotado: boolean;
  destacado: boolean;
  imageUrl: string | null;
  imageAlt: string;
  imageWidth: number | null;
  imageHeight: number | null;
  ocasion: string;
  personasMin: string;
  personasMax: string;
  personasTexto: string;
  paraQuien: string[];
  consejo: string;
  piezas: PiezaBorrador[];
};

/** Céntimos → euros con coma, para precargar el formulario: «39,50». */
export function centimosAEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

const ALFABETO = "abcdefghijklmnopqrstuvwxyz0123456789";

/** `h-` + 6 minúsculas o cifras, distinto de los que ya hay en el pack. */
export function nuevoIdHueco(
  existentes: ReadonlySet<string>,
  azar: () => number = Math.random,
): string {
  for (;;) {
    let id = "h-";
    for (let i = 0; i < 6; i++)
      id += ALFABETO[Math.floor(azar() * ALFABETO.length) % ALFABETO.length];
    if (!existentes.has(id)) return id;
  }
}

let contadorClaves = 0;
/** Clave local de React; no se manda nunca. */
const nuevaClave = () => `k${++contadorClaves}`;

export function piezaFijaVacia(): PiezaFijaBorrador {
  return {
    clave: nuevaClave(),
    tipo: "fija",
    slug: "",
    variantId: "",
    titulo: "",
    descripcion: "",
    requiereFoto: false,
    rotulo: "",
  };
}

export function huecoVacio(idsEnUso: ReadonlySet<string>): HuecoBorrador {
  return {
    clave: nuevaClave(),
    tipo: "eleccion",
    id: nuevoIdHueco(idsEnUso),
    titulo: "",
    descripcion: "",
    etiqueta: "",
    variantId: "",
    modo: "seccion",
    seccion: "",
    slugs: [],
  };
}

export const idsDeHuecos = (piezas: readonly PiezaBorrador[]): Set<string> =>
  new Set(piezas.flatMap((p) => (p.tipo === "eleccion" ? [p.id] : [])));

export function borradorVacio(): Borrador {
  return {
    name: "",
    precioEuros: "",
    shortDescription: "",
    orden: 100,
    activo: true,
    agotado: false,
    destacado: false,
    imageUrl: null,
    imageAlt: "",
    imageWidth: null,
    imageHeight: null,
    ocasion: "",
    personasMin: "",
    personasMax: "",
    personasTexto: "",
    paraQuien: [],
    consejo: "",
    piezas: [],
  };
}

function piezaABorrador(p: Pieza): PiezaBorrador {
  if (p.tipo === "fija") {
    return {
      clave: nuevaClave(),
      tipo: "fija",
      slug: p.slug,
      variantId: p.variantId ?? "",
      titulo: p.titulo,
      descripcion: p.descripcion,
      requiereFoto: p.requiereFoto === true,
      rotulo: p.rotulo ?? "",
    };
  }
  const porSeccion = "seccion" in p;
  return {
    clave: nuevaClave(),
    tipo: "eleccion",
    id: p.id,
    titulo: p.titulo,
    descripcion: p.descripcion,
    etiqueta: p.etiqueta,
    variantId: p.variantId ?? "",
    modo: porSeccion ? "seccion" : "lista",
    seccion: porSeccion ? p.seccion : "",
    slugs: porSeccion ? [] : [...p.slugs],
  };
}

export function borradorDesdePack(p: PackAdmin): Borrador {
  const d = p.definicion;
  return {
    name: p.name,
    precioEuros: centimosAEuros(p.priceCents),
    shortDescription: p.shortDescription,
    orden: p.orden,
    activo: p.activo,
    agotado: p.agotado,
    destacado: p.destacado,
    imageUrl: p.imageUrl,
    imageAlt: p.imageAlt ?? "",
    imageWidth: p.imageWidth,
    imageHeight: p.imageHeight,
    ocasion: d.ocasion,
    personasMin: String(d.personas.min),
    personasMax: String(d.personas.max),
    personasTexto: d.personas.texto,
    paraQuien: [...d.paraQuien],
    consejo: d.consejo ?? "",
    piezas: d.piezas.map(piezaABorrador),
  };
}

/** Lo que se propone para «personas»: «4–6 personas», o «6 personas» si coinciden. */
export function textoPersonas(min: string, max: string): string {
  const a = min.trim();
  const b = max.trim();
  if (!a || !b) return "";
  return a === b ? `${a} personas` : `${a}–${b} personas`;
}

const entero = (texto: string): number => {
  const n = Number(texto.trim());
  return texto.trim() !== "" && Number.isInteger(n) ? n : 0;
};

/** Una pieza del borrador tal y como la guarda la API (y la lee `opcionesDeHueco`). */
export function piezaAEntrada(p: PiezaBorrador): Pieza {
  if (p.tipo === "fija") {
    return {
      tipo: "fija",
      slug: p.slug,
      ...(p.variantId ? { variantId: p.variantId } : {}),
      titulo: p.titulo.trim(),
      descripcion: p.descripcion.trim(),
      ...(p.requiereFoto ? { requiereFoto: true as const } : {}),
      ...(p.requiereFoto && p.rotulo.trim() ? { rotulo: p.rotulo.trim() } : {}),
    };
  }
  return {
    tipo: "eleccion",
    id: p.id,
    titulo: p.titulo.trim(),
    descripcion: p.descripcion.trim(),
    etiqueta: p.etiqueta.trim(),
    ...(p.variantId ? { variantId: p.variantId } : {}),
    ...(p.modo === "seccion"
      ? { seccion: p.seccion }
      : { slugs: [...p.slugs] }),
  };
}

/** El cuerpo de POST/PUT `/api/admin/packs`. */
export function aEntrada(b: Borrador): DatosPackEntrada {
  const consejo = b.consejo.trim();
  return {
    name: b.name.trim(),
    priceCents: eurosACentimos(b.precioEuros) ?? 0,
    shortDescription: b.shortDescription.trim(),
    imageUrl: b.imageUrl,
    imageAlt: b.imageUrl ? b.imageAlt.trim() || null : null,
    imageWidth: b.imageUrl ? b.imageWidth : null,
    imageHeight: b.imageUrl ? b.imageHeight : null,
    activo: b.activo,
    agotado: b.agotado,
    destacado: b.destacado,
    orden: b.orden,
    definicion: {
      ocasion: b.ocasion.trim(),
      personas: {
        min: entero(b.personasMin),
        max: entero(b.personasMax),
        texto: b.personasTexto.trim(),
      },
      paraQuien: b.paraQuien.map((f) => f.trim()).filter((f) => f !== ""),
      ...(consejo ? { consejo } : {}),
      piezas: b.piezas.map(piezaAEntrada),
    },
  };
}

/** Sube (-1) o baja (+1) un elemento; si se saldría, devuelve la misma lista. */
export function mover<T>(lista: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= lista.length) return lista as T[];
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}

/**
 * Los `donde` que corresponden a una pieza (índice desde 0), en el formato de
 * `Problema`: la posición siempre, y un hueco además por su etiqueta.
 */
export function dondeDePieza(p: PiezaBorrador, i: number): string[] {
  const n = i + 1;
  if (p.tipo === "fija") return [`pieza ${n}`];
  const et = p.etiqueta.trim();
  return [`pieza ${n}`, et ? `hueco «${et}»` : `hueco ${n}`];
}

export const problemasDe = (
  ps: readonly Problema[],
  donde: readonly string[],
): Problema[] => ps.filter((p) => donde.includes(p.donde));

/**
 * `comprobarPack` sobre el borrador, en el navegador y con la carta que
 * cargó el panel: lo mismo que dirá el servidor al guardar. Suma los fallos
 * de forma (longitudes, números) y cambia el mensaje de una pieza fija sin
 * producto, que el validador cuenta como «el producto «»».
 */
export function comprobarBorrador(
  b: Borrador,
  carta: readonly ProductoCarta[],
): { errores: Problema[]; avisos: Problema[] } {
  const entrada = aEntrada(b);
  const { errores, avisos } = comprobarPack(entrada, carta);

  const sinProducto = new Set<string>();
  b.piezas.forEach((p, i) => {
    if (p.tipo === "fija" && p.slug === "") sinProducto.add(`pieza ${i + 1}`);
  });
  // Lo mismo con un hueco «de una sección» sin sección: «La sección «» no existe».
  const sinSeccion = new Map<string, string>();
  b.piezas.forEach((p, i) => {
    if (p.tipo === "eleccion" && p.modo === "seccion" && p.seccion === "") {
      const donde = dondeDePieza(p, i)[1];
      const et = p.etiqueta.trim();
      sinSeccion.set(donde, `Elige la sección de la carta del hueco ${et ? `«${et}»` : `de la pieza ${i + 1}`}.`);
    }
  });
  const res: Problema[] = [];

  // Precio y personas: si lo escrito no se entiende, decirlo, en vez de
  // «tiene que ser mayor que 0» o «el mínimo no puede ser mayor que el máximo».
  let precioPropio: string | null = null;
  if (b.precioEuros.trim() === "") precioPropio = "Escribe el precio del pack.";
  else if (eurosACentimos(b.precioEuros) === null) {
    precioPropio = "No es un precio válido: escribe por ejemplo 39,50";
  }
  if (precioPropio) res.push({ donde: "precio", mensaje: precioPropio });
  const min = b.personasMin.trim();
  const max = b.personasMax.trim();
  let personasPropio: string | null = null;
  if (min === "" || max === "") personasPropio = "Escribe el mínimo y el máximo de personas.";
  else if (!/^\d+$/.test(min) || !/^\d+$/.test(max)) personasPropio = "Escribe un número entero de personas.";
  if (personasPropio) res.push({ donde: "personas", mensaje: personasPropio });
  const propios = new Set([...(precioPropio ? ["precio"] : []), ...(personasPropio ? ["personas"] : [])]);

  for (const donde of sinProducto) {
    res.push({ donde, mensaje: `Elige el producto de la ${donde}.` });
  }
  for (const e of errores) {
    if (propios.has(e.donde)) continue;
    if (sinProducto.has(e.donde) && e.mensaje.includes("«»")) continue;
    if (sinSeccion.has(e.donde) && e.mensaje.includes("La sección «»")) {
      res.push({ donde: e.donde, mensaje: sinSeccion.get(e.donde)! });
      continue;
    }
    res.push(e);
  }

  const esquema = esquemaPack.safeParse(entrada);
  if (!esquema.success) {
    const ya = new Set(res.map((e) => e.donde));
    for (const p of problemasDeEsquema(esquema.error.issues)) {
      if (!ya.has(p.donde)) res.push(p);
    }
  }
  return { errores: res, avisos };
}

/**
 * ¿Hay errores de piezas o huecos? Son los únicos que dependen de la carta
 * (producto que no existe, tamaño que no tiene, hueco sin opciones, pieza sin
 * precio): con uno de estos, antes de bloquear el guardado, el panel vuelve
 * a leer la carta por si la que tiene es vieja.
 */
export const hayErroresDePiezas = (errores: readonly Problema[]): boolean =>
  errores.some((e) => /^(pieza|hueco) /.test(e.donde));
