import { authClient } from "~/lib/auth/cliente";

type Tono = "claro" | "moka";

// El sitio es estático: casi todas las páginas se generan en build, sin
// petición ni sesión. Esta isla resuelve la sesión con
// `authClient.useSession()` en vez de leer `Astro.locals.usuario` (que en
// una página prerenderizada siempre es `null`).
//
// Se monta con `client:load`, no `client:only`: el store de sesión de
// Better Auth empieza siempre en `{ data: null }` —no hace red hasta que se
// monta en el navegador—, así que tanto el render de servidor (build) como
// el primer pintado del cliente (antes de hidratar) producen el mismo
// marcado de «sin sesión». Eso deja un `<a href="/acceso">` de verdad en el
// HTML construido, sin depender de que llegue el bundle: si no hay sesión
// no cambia nada; si la hay, la hidratación lo sustituye por «Mi cuenta» +
// «Salir» en cuanto resuelve.
const ESTILOS: Record<
  Tono,
  {
    contenedor: string;
    enlaceEnGrupo: string;
    salir: string;
  }
> = {
  // Banda superior de escritorio: fondo teja, texto en leche.
  claro: {
    contenedor: "hidden lg:inline-flex items-center gap-3",
    // La visibilidad y el `inline-flex` los pone el `contenedor`.
    enlaceEnGrupo:
      "inline-flex items-center h-10 px-4 whitespace-nowrap border border-[color:var(--color-leche)]/45 text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-leche)] hover:bg-[color:var(--color-leche)] hover:text-[color:var(--color-teja)] transition-colors",
    salir:
      "text-[11px] font-medium uppercase tracking-[0.14em] text-[color:var(--color-leche)] underline underline-offset-4 hover:text-[color:var(--color-latte)] transition-colors",
  },
  // Panel del menú móvil: fondo latte, texto en moka con filete avellana.
  moka: {
    contenedor: "flex items-center gap-3 mt-4",
    enlaceEnGrupo: "btn btn-secundario",
    salir:
      "text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--color-moka)] underline underline-offset-4 hover:text-[color:var(--color-caramelo)] transition-colors",
  },
};

async function salir() {
  await authClient.signOut();
  window.location.href = "/";
}

export default function AccesoSesion({ tono }: { tono: Tono }) {
  const { data } = authClient.useSession();
  const estilo = ESTILOS[tono];

  if (!data?.user) {
    return (
      <div className={estilo.contenedor}>
        <a
          href="/acceso?modo=registro"
          data-mobile-nav-link
          className={estilo.enlaceEnGrupo}
        >
          Regístrate
        </a>
        {/* Para quien ya tiene cuenta: /acceso abre en «Entrar». */}
        <a href="/acceso" data-mobile-nav-link className={estilo.salir}>
          Accede
        </a>
      </div>
    );
  }

  // Solo un atajo visible: quién puede entrar en /admin lo decide el
  // middleware en el servidor con la sesión, no este `rol` que viene del
  // navegador. Va aquí, en la isla, y no en el HTML de la cabecera, porque
  // la home y el catálogo se sirven desde una caché compartida (ISR): un
  // botón de admin pintado en servidor se lo vería la siguiente persona.
  const esAdmin = (data.user as { rol?: string }).rol === "admin";

  return (
    <div className={estilo.contenedor}>
      {esAdmin && (
        <a href="/admin" data-mobile-nav-link className={estilo.enlaceEnGrupo}>
          Panel de administración
        </a>
      )}
      <a href="/cuenta" data-mobile-nav-link className={estilo.enlaceEnGrupo}>
        Mi cuenta
      </a>
      <button type="button" className={estilo.salir} onClick={salir}>
        Salir
      </button>
    </div>
  );
}
