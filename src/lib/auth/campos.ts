/**
 * Campos adicionales de `user` para Better Auth, separados de `server.ts`
 * para poder probarlos sin levantar Postgres: importar `server.ts` crea el
 * pool de conexión en cuanto se carga el módulo (ver el comentario de
 * `~/lib/db/direccionesErrores`, que resuelve el mismo problema para las
 * direcciones).
 *
 * `rol` va con `input: false` a propósito: es lo único que impide que
 * alguien se dé de alta pidiendo `rol: "admin"` en el cuerpo de la
 * petición a `/sign-up/email`. Todo el plan del panel de administración se
 * apoya en esta línea. `campos.test.ts` la cubre precisamente para que,
 * si alguien la quita sin darse cuenta, una prueba falle antes de que
 * llegue a producción.
 */
export const camposAdicionales = {
  telefono: { type: "string", required: false },
  // Alta de empresa (migración 021): los dos o ninguno, lo comprueba
  // `preparaAltaUsuario`.
  empresa: { type: "string", required: false },
  cif: { type: "string", required: false },
  rol: {
    type: "string",
    required: false,
    defaultValue: "cliente",
    input: false,
  },
} as const;
