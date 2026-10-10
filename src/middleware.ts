import { defineMiddleware } from "astro:middleware";
import { auth } from "~/lib/auth/server";
import { guardiaAdmin } from "~/lib/auth/guardia";

export const onRequest = defineMiddleware(async (context, next) => {
  // Las páginas prerenderizadas se generan en build, sin petición real: no
  // hay cabeceras que leer y `auth.api.getSession` solo gastaría una
  // consulta a Postgres por página estática para nada. Sin este corte,
  // Astro además avisa de que `Astro.request.headers` no existe ahí.
  if (context.isPrerendered) {
    context.locals.usuario = null;
    return next();
  }

  // Este middleware corre en TODAS las peticiones, no solo en las de
  // autenticación. Si `getSession` lanza —un corte momentáneo con Postgres,
  // una cookie corrupta, un fallo interno de Better Auth— no puede tumbar el
  // resto del sitio: degrada a "sin sesión" y deja pasar la petición.
  // Alguien que no pueda identificarse debe poder seguir comprando como
  // invitado.
  try {
    const sesion = await auth.api.getSession({
      headers: context.request.headers,
    });

    context.locals.usuario = sesion?.user ?? null;
  } catch (error) {
    // Nunca volcar cookies, tokens ni la cadena de conexión: solo el motivo.
    console.error(
      "No se pudo resolver la sesión, se sirve como invitado:",
      error instanceof Error ? error.message : error,
    );
    context.locals.usuario = null;
  }

  // El panel se cierra aquí y no en cada página: un componente `.astro` no
  // puede cortar una petición devolviendo una Response, y una comprobación
  // repetida en cada fichero es una comprobación que algún día falta en el
  // fichero nuevo. Si `getSession` falló arriba, `usuario` es null y esto
  // manda a /acceso, que es el fallo seguro.
  //
  // Se mira también la ruta que Astro ha casado (`routePattern`), no solo la
  // URL: si alguna variante de la URL se le escapa a la comparación de
  // texto pero acaba sirviendo una página del panel, la página casada sigue
  // siendo `/admin/...` y se corta igual.
  const usuario = context.locals.usuario;
  const corte =
    guardiaAdmin({ usuario, pathname: context.url.pathname }) ??
    guardiaAdmin({ usuario, pathname: context.routePattern });
  if (corte) return corte;

  return next();
});
