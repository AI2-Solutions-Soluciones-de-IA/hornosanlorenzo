/**
 * Quién entra en el panel. Sin `pg` ni `astro:*` a propósito: así se puede
 * probar sin levantar nada, igual que `~/lib/auth/campos`.
 */

export const ROL_ADMIN = "admin";
/** La oficina entra en el panel, pero solo a Pedidos (7-10-2026). */
export const ROL_OFICINA = "oficina";

type Usuario = App.Locals["usuario"];

/**
 * Comparación exacta contra la constante. Nada de `includes` ni de pasar a
 * minúsculas: el papel lo escribe `scripts/hacer-admin.mjs` con este valor y
 * ninguna variante debe colar.
 */
export function esAdmin(usuario: Usuario): boolean {
  return usuario?.rol === ROL_ADMIN;
}

/** Quien puede ver y gestionar los pedidos: el admin y la oficina. */
export function vePedidos(usuario: Usuario): boolean {
  return esAdmin(usuario) || usuario?.rol === ROL_OFICINA;
}

/** Lo único del panel que abre la oficina: la página de pedidos y su API. */
const RUTAS_OFICINA = ["/admin/pedidos", "/api/admin/pedidos"];

/** Lo que abre cada papel; la entrada al panel (`/admin`) la sirve aparte. */
export function puedeEntrar(usuario: Usuario, pathname: string): boolean {
  if (esAdmin(usuario)) return true;
  if (usuario?.rol !== ROL_OFICINA) return false;
  return RUTAS_OFICINA.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/** Todo lo que hay debajo de estas rutas está cerrado. */
const RUTAS_PANEL = ["/admin", "/api/admin"];

/** `/administracion` no es `/admin`: o es exacta, o cuelga con una barra. */
const esRutaDelPanel = (pathname: string): boolean =>
  RUTAS_PANEL.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );

/**
 * Devuelve la respuesta con la que hay que cortar, o null si se puede pasar.
 *
 * Sin sesión: a la pantalla de acceso. Con sesión pero sin ser admin: 404
 * pelado. Es lo que pide la spec §7 y el motivo es concreto — un 403 le
 * confirmaría a cualquier cliente registrado que ahí detrás hay un panel de
 * administración que puede ponerse a probar.
 */
export function guardiaAdmin(contexto: {
  usuario: Usuario;
  pathname: string;
}): Response | null {
  if (!esRutaDelPanel(contexto.pathname)) return null;

  if (!contexto.usuario) {
    return new Response(null, {
      status: 302,
      headers: { location: "/acceso" },
    });
  }
  // La oficina, al entrar al panel, va directa a lo único que tiene.
  if (contexto.usuario.rol === ROL_OFICINA && contexto.pathname.replace(/\/$/, "") === "/admin") {
    return new Response(null, {
      status: 302,
      headers: { location: "/admin/pedidos" },
    });
  }
  if (!puedeEntrar(contexto.usuario, contexto.pathname)) {
    return new Response("No encontrado", { status: 404 });
  }
  return null;
}
