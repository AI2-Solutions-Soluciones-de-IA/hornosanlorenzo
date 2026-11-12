/**
 * Quién entra en el panel. Sin `pg` ni `astro:*` a propósito: así se puede
 * probar sin levantar nada, igual que `~/lib/auth/campos`.
 */
import type { DestinoPedido } from "~/lib/db/pedidos";

export const ROL_ADMIN = "admin";
/** La oficina entra en el panel, pero solo a Pedidos (7-10-2026). */
export const ROL_OFICINA = "oficina";
/**
 * La oficina de cada tienda (6-11-2026): Pedidos, y de ellos solo los suyos
 * (Alcobendas lleva además los envíos a domicilio, que salen de su
 * obrador). La de Alcobendas ve también Clientes, que es solo consulta
 * (12-11-2026; Pozuelo la tuvo unas horas y se le quitó).
 */
export const ROL_OFICINA_ALCOBENDAS = "oficina_alcobendas";
export const ROL_OFICINA_POZUELO = "oficina_pozuelo";

/** Qué pedidos ve cada oficina; la que no está aquí (`oficina`), todos. */
const DESTINOS_DE_OFICINA: Record<string, DestinoPedido[]> = {
  [ROL_OFICINA_ALCOBENDAS]: ["alcobendas", "domicilio"],
  [ROL_OFICINA_POZUELO]: ["pozuelo"],
};

/** Los papeles que entran al panel solo para Pedidos. */
const ROLES_OFICINA: readonly string[] = [
  ROL_OFICINA,
  ROL_OFICINA_ALCOBENDAS,
  ROL_OFICINA_POZUELO,
];

const esOficina = (usuario: Usuario): boolean =>
  ROLES_OFICINA.includes(usuario?.rol ?? "");

type Usuario = App.Locals["usuario"];

/**
 * Comparación exacta contra la constante. Nada de `includes` ni de pasar a
 * minúsculas: el papel lo escribe `scripts/hacer-admin.mjs` con este valor y
 * ninguna variante debe colar.
 */
export function esAdmin(usuario: Usuario): boolean {
  return usuario?.rol === ROL_ADMIN;
}

/** Quien puede ver y gestionar los pedidos: el admin y las oficinas. */
export function vePedidos(usuario: Usuario): boolean {
  return esAdmin(usuario) || esOficina(usuario);
}

/**
 * Los destinos de pedido a los que se limita este usuario, o `undefined`
 * si los ve todos (admin y oficina general). Solo tiene sentido para quien
 * `vePedidos`.
 */
export function destinosVisibles(usuario: Usuario): DestinoPedido[] | undefined {
  return DESTINOS_DE_OFICINA[usuario?.rol ?? ""];
}

/** Lo que abre la oficina general: la página de pedidos y su API. */
const RUTAS_OFICINA = ["/admin/pedidos", "/api/admin/pedidos"];

/**
 * Lo que abre la oficina de Alcobendas: Pedidos y Clientes (la lista de
 * cuentas y de suscritos, y su Excel: solo consulta), desde el 12-11-2026.
 */
const RUTAS_OFICINA_CLIENTES = [...RUTAS_OFICINA, "/admin/clientes", "/api/admin/clientes"];

const veClientesOficina = (usuario: Usuario): boolean => usuario?.rol === ROL_OFICINA_ALCOBENDAS;

/** Quien ve la sección Clientes: el admin y la oficina de Alcobendas. */
export function veClientes(usuario: Usuario): boolean {
  return esAdmin(usuario) || veClientesOficina(usuario);
}

/** Lo que abre cada papel; la entrada al panel (`/admin`) la sirve aparte. */
export function puedeEntrar(usuario: Usuario, pathname: string): boolean {
  if (esAdmin(usuario)) return true;
  if (!esOficina(usuario)) return false;
  const rutas = veClientesOficina(usuario) ? RUTAS_OFICINA_CLIENTES : RUTAS_OFICINA;
  return rutas.some((base) => pathname === base || pathname.startsWith(`${base}/`));
}

/** Todo lo que hay debajo de estas rutas está cerrado. */
const RUTAS_PANEL = ["/admin", "/api/admin"];

/** `/administracion` no es `/admin`: o es exacta, o cuelga con una barra. */
const esRutaDelPanel = (pathname: string): boolean =>
  RUTAS_PANEL.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );

/**
 * Astro enruta `//admin/clientes` a la página `/admin/clientes` (quita una
 * barra inicial antes de buscar la ruta), pero al middleware le llega la URL
 * tal cual. Sin juntar las barras, la guardia veía una ruta que "no es del
 * panel" y dejaba pintar la lista de clientes a cualquiera (auditoría del
 * 10-10-2026). Aquí se compara la ruta que de verdad se va a servir.
 */
export const normalizaRuta = (pathname: string): string =>
  pathname.replace(/\/{2,}/g, "/");

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
  const pathname = normalizaRuta(contexto.pathname);
  if (!esRutaDelPanel(pathname)) return null;

  if (!contexto.usuario) {
    return new Response(null, {
      status: 302,
      headers: { location: "/acceso" },
    });
  }
  // La oficina, al entrar al panel, va directa a lo único que tiene.
  if (
    esOficina(contexto.usuario) &&
    pathname.replace(/\/$/, "") === "/admin"
  ) {
    return new Response(null, {
      status: 302,
      headers: { location: "/admin/pedidos" },
    });
  }
  if (!puedeEntrar(contexto.usuario, pathname)) {
    return new Response("No encontrado", { status: 404 });
  }
  return null;
}
