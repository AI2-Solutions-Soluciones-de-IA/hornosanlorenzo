import { APIError } from "better-auth/api";
import { esTelefonoValido, normalizaTelefono } from "~/lib/entrega";
import { MAX_NOMBRE, NOMBRE_LARGO, erroresEmpresa, normalizaCif } from "~/lib/auth/validacion";

/**
 * Razón social y CIF del alta de empresa (los dos o ninguno), con las mismas
 * reglas que el formulario. Devuelve los valores limpios para guardar, `null`
 * en una cuenta de particular.
 */
function datosEmpresa(user: Record<string, any>): { empresa: string | null; cif: string | null } {
  const empresa = typeof user.empresa === "string" ? user.empresa : "";
  const cif = typeof user.cif === "string" ? user.cif : "";
  const errores = erroresEmpresa({ empresa, cif });
  if (errores.empresa) throw new APIError("BAD_REQUEST", { code: "INVALID_COMPANY", message: errores.empresa });
  if (errores.cif) throw new APIError("BAD_REQUEST", { code: "INVALID_CIF", message: errores.cif });
  return empresa.trim() ? { empresa: empresa.trim(), cif: normalizaCif(cif) } : { empresa: null, cif: null };
}

export type DatosPersonales = { name: string; telefono: string };

export type ResultadoValidacionDatos =
  | { ok: true; data: DatosPersonales }
  | { ok: false; code: "INVALID_NAME" | "INVALID_PHONE"; message: string };

/**
 * Valida y normaliza nombre y teléfono con las mismas reglas en todos los
 * sitios donde se pueden guardar: el alta (`preparaAltaUsuario`, más abajo)
 * y la edición desde `/cuenta` (`src/pages/api/cuenta/datos.ts`). Sería
 * absurdo poder guardar editando un teléfono que el alta rechaza.
 *
 * El teléfono es el dato con el que el repartidor llama cuando no encuentra
 * el portal. Se normaliza con `normalizaTelefono` (para no guardar
 * «666 12 34 56» y «+34666123456» como si fueran cosas distintas) y se
 * recorta el nombre, rechazando el dato si queda vacío.
 */
export function validaDatosPersonales(
  input: Record<string, unknown>,
): ResultadoValidacionDatos {
  const nombre = typeof input.name === "string" ? input.name.trim() : "";
  if (!nombre) {
    return {
      ok: false,
      code: "INVALID_NAME",
      message: "Dinos cómo te llamas.",
    };
  }
  // Sin tope, un alta podía guardar un nombre de miles de caracteres y
  // descuadrar el panel y los pedidos.
  if (nombre.length > MAX_NOMBRE) {
    return { ok: false, code: "INVALID_NAME", message: NOMBRE_LARGO };
  }

  const telefonoBruto =
    typeof input.telefono === "string" ? input.telefono : "";
  if (!esTelefonoValido(telefonoBruto)) {
    return {
      ok: false,
      code: "INVALID_PHONE",
      message: "Escribe un móvil o fijo español de nueve dígitos.",
    };
  }

  return {
    ok: true,
    data: { name: nombre, telefono: normalizaTelefono(telefonoBruto) },
  };
}

/**
 * Lógica de `databaseHooks.user.create.before` (Better Auth), separada de
 * `server.ts` para poder probarla sin levantar Postgres: importar
 * `server.ts` crea el pool de conexión en cuanto se carga el módulo.
 *
 * `validaRegistro`, en `~/lib/auth/validacion`, solo corre en el navegador.
 * Quien llame a `/sign-up/email` directamente, sin pasar por el formulario,
 * se saltaría esa validación, así que aquí se repite con
 * `validaDatosPersonales`.
 *
 * Ya no es el único enganche: `preparaActualizacionUsuario`, más abajo,
 * aplica las mismas reglas en `databaseHooks.user.update.before`, para el
 * endpoint `update-user` de Better Auth.
 *
 * Un `APIError` lanzado aquí llega tal cual al cliente (código + mensaje),
 * no como un 500: Better Auth captura el fallo de `createUser` y, al ser un
 * `APIError`, lo relanza sin envolverlo.
 */
export async function preparaAltaUsuario(
  user: Record<string, any>,
): Promise<{ data: Record<string, any> }> {
  const resultado = validaDatosPersonales(user);
  if (!resultado.ok) {
    throw new APIError("BAD_REQUEST", {
      code: resultado.code,
      message: resultado.message,
    });
  }

  return {
    data: {
      ...user,
      name: resultado.data.name,
      telefono: resultado.data.telefono,
      ...datosEmpresa(user),
    },
  };
}

// `validaDatosPersonales` exige nombre y teléfono a la vez: le vale para el
// alta, donde los dos son obligatorios, pero no para una actualización
// parcial. Este valor pasa la validación de teléfono (nueve dígitos,
// empieza por 6-9) y se usa solo para rellenar el hueco del campo que no
// se está tocando; su resultado se descarta siempre, nunca se guarda.
const TELEFONO_MARCADOR = "600000000";
const NOMBRE_MARCADOR = "·";

/**
 * Lógica de `databaseHooks.user.update.before` (Better Auth), para el
 * endpoint `update-user`. A diferencia del alta, aquí los campos pueden
 * venir ausentes porque no se están cambiando — no es lo mismo «no envío
 * teléfono» que «envío un teléfono vacío» — así que solo se valida lo que
 * llega.
 *
 * Reutiliza `validaDatosPersonales` en vez de repetir sus reglas: al campo
 * ausente se le pasa un valor ya válido (los marcadores de arriba) solo
 * para que la validación combinada no lo rechace, y se descarta su
 * resultado antes de devolver los datos.
 */
export async function preparaActualizacionUsuario(
  user: Record<string, any>,
): Promise<{ data: Record<string, any> }> {
  const tocaNombre = "name" in user;
  const tocaTelefono = "telefono" in user;
  // La razón social y el CIF, si llegan, con las reglas del alta (juntos).
  const empresa = "empresa" in user || "cif" in user ? datosEmpresa(user) : null;

  if (!tocaNombre && !tocaTelefono) {
    return { data: empresa ? { ...user, ...empresa } : user };
  }

  const resultado = validaDatosPersonales({
    name: tocaNombre ? user.name : NOMBRE_MARCADOR,
    telefono: tocaTelefono ? user.telefono : TELEFONO_MARCADOR,
  });

  if (!resultado.ok) {
    throw new APIError("BAD_REQUEST", {
      code: resultado.code,
      message: resultado.message,
    });
  }

  const data: Record<string, any> = { ...user, ...(empresa ?? {}) };
  if (tocaNombre) data.name = resultado.data.name;
  if (tocaTelefono) data.telefono = resultado.data.telefono;

  return { data };
}
