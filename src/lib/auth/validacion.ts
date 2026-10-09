import { esTelefonoValido } from "~/lib/entrega";

/** Mismo mínimo que `minPasswordLength` en el servidor. Si cambia uno, cambia el otro. */
export const MIN_PASSWORD = 8;

/** Tope del nombre, el mismo en el navegador y en el servidor (`~/lib/auth/alta`). */
export const MAX_NOMBRE = 100;
export const NOMBRE_LARGO = `El nombre no puede pasar de ${MAX_NOMBRE} caracteres.`;

export type Resultado =
  | { ok: true }
  | { ok: false; errores: Record<string, string> };

const esEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

/** Tope de la razón social, el mismo en el navegador y en el servidor. */
export const MAX_EMPRESA = 160;

/** El CIF sin espacios, guiones ni puntos, y en mayúsculas: «b-12.345.678» → «B12345678». */
export const normalizaCif = (v: string) => v.replace(/[\s.\-]/g, "").toUpperCase();

/**
 * CIF de sociedad (letra, siete cifras y control), NIF de autónomo (ocho
 * cifras y letra) o NIE (X/Y/Z, siete cifras y letra). Solo la forma: el
 * dígito de control no se comprueba, que un CIF bien escrito no se rechace
 * por una regla que alguien implemente mal.
 */
export const esCifValido = (v: string) =>
  /^([ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]|\d{8}[A-Z]|[XYZ]\d{7}[A-Z])$/.test(normalizaCif(v));

/**
 * La razón social y el CIF del alta de empresa: los dos o ninguno (una
 * cuenta de particular no lleva ninguno). Devuelve los errores por campo,
 * vacío si vale. La usan el formulario y el servidor (`~/lib/auth/alta`).
 */
export function erroresEmpresa(d: { empresa?: string; cif?: string }): Record<string, string> {
  const empresa = d.empresa?.trim() ?? "";
  const cif = d.cif?.trim() ?? "";
  const errores: Record<string, string> = {};
  if (!empresa && !cif) return errores;
  if (!empresa) errores.empresa = "Escribe el nombre de la empresa.";
  else if (empresa.length > MAX_EMPRESA)
    errores.empresa = `La razón social no puede pasar de ${MAX_EMPRESA} caracteres.`;
  if (!cif) errores.cif = "Escribe el CIF de la empresa.";
  else if (!esCifValido(cif)) errores.cif = "Ese CIF no parece válido (por ejemplo, B12345678).";
  return errores;
}

export function validaRegistro(d: {
  nombre: string;
  email: string;
  telefono: string;
  password: string;
  /** Solo en el alta de empresa. */
  empresa?: string;
  cif?: string;
}): Resultado {
  const errores: Record<string, string> = { ...erroresEmpresa(d) };

  if (!d.nombre.trim()) errores.nombre = "Dinos cómo te llamas.";
  else if (d.nombre.trim().length > MAX_NOMBRE) errores.nombre = NOMBRE_LARGO;
  if (!esEmail(d.email)) errores.email = "Ese correo no parece válido.";
  if (!esTelefonoValido(d.telefono)) {
    errores.telefono = "Escribe un móvil o fijo español de nueve dígitos.";
  }
  if (d.password.length < MIN_PASSWORD) {
    errores.password = `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`;
  }

  return Object.keys(errores).length ? { ok: false, errores } : { ok: true };
}

export function validaEntrada(d: {
  email: string;
  password: string;
}): Resultado {
  const errores: Record<string, string> = {};
  if (!d.email.trim()) errores.email = "Escribe tu correo.";
  if (!d.password) errores.password = "Escribe tu contraseña.";
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true };
}

export function validaRecuperar(d: { email: string }): Resultado {
  const errores: Record<string, string> = {};
  if (!esEmail(d.email)) errores.email = "Ese correo no parece válido.";
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true };
}

export function validaNuevaContrasena(d: {
  password: string;
  confirmar: string;
}): Resultado {
  const errores: Record<string, string> = {};
  if (d.password.length < MIN_PASSWORD) {
    errores.password = `La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`;
  }
  if (d.confirmar !== d.password) {
    errores.confirmar = "Las dos contraseñas no coinciden.";
  }
  return Object.keys(errores).length ? { ok: false, errores } : { ok: true };
}
