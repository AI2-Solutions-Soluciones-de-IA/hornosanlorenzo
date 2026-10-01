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

export function validaRegistro(d: {
  nombre: string;
  email: string;
  telefono: string;
  password: string;
}): Resultado {
  const errores: Record<string, string> = {};

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
