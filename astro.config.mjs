import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import vercel from "@astrojs/vercel";

const SITE =
  process.env.PUBLIC_SITE_URL ?? "https://hornosanlorenzo.vercel.app";

export default defineConfig({
  site: SITE,
  // Estático por defecto: solo las rutas de /api se sirven bajo demanda
  // (`export const prerender = false`), porque un cobro nunca puede calcularse
  // en el navegador.
  output: "static",
  // Las páginas que leen de la base de datos van con `prerender = false`:
  // el ISR las cachea igual que si fueran estáticas y el panel las
  // invalida al guardar (`src/lib/cache.ts`).
  adapter: vercel({
    // Optimización de imágenes de Vercel (`/_vercel/image?url=...`) en vez del
    // endpoint `/_image` de Astro. El endpoint de Astro, en servidor, obtiene el
    // original haciendo `fetch` a su propio origen, y en Vercel ese origen es la
    // URL interna del despliegue (`*-oscarsr96s-projects.vercel.app`), que está
    // detrás de Vercel Authentication: el fetch recibe un 302 al SSO y el
    // endpoint responde 404. Mientras la home y el catálogo eran estáticos no se
    // notaba, porque las imágenes se generaban al construir; al pasar a ISR,
    // TODA imagen de una página con `prerender = false` pasaba por ahí y la web
    // salió a producción sin una sola foto (11 de septiembre de 2026).
    imageService: true,
    imagesConfig: {
      // Vercel solo sirve anchos de esta lista y el adaptador redondea al más
      // cercano: son los `widths` que ya usan los componentes, más dos grandes
      // para las fotos de 1600 px del panel.
      sizes: [
        200, 220, 300, 320, 400, 480, 600, 640, 800, 900, 1200, 1600, 1920,
      ],
      // Repetido a propósito respecto a `image.remotePatterns` de más abajo:
      // el adaptador (9.0.5) promete copiarlos de ahí, pero su
      // `isAcceptedPattern` descarta todo patrón que lleve `protocol`
      // (`!== "http" || !== "https"` es siempre cierto), y sin esta entrada
      // Vercel se niega a optimizar las fotos de Blob. Lo que se pone aquí
      // sí se copia tal cual al `config.json`.
      remotePatterns: [
        { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      ],
    },
    isr: {
      // El mismo valor tiene que estar en el entorno de CONSTRUCCIÓN y en el
      // de ejecución en Vercel: aquí se lee al construir, y `src/lib/cache.ts`
      // al invalidar. Si no coinciden, la invalidación se ignora en silencio.
      bypassToken: process.env.VERCEL_BYPASS_TOKEN,
      // Sin esto el adaptador escribe `expiration: false` en el
      // `prerender-config.json` (su valor por defecto): una entrada cacheada
      // NUNCA caduca por tiempo y solo se refresca al invalidar o al
      // desplegar. Eso convierte cualquier respuesta degradada en la verdad
      // permanente del sitio: si Postgres parpadea justo cuando alguien pide
      // /catalogo/dulce por primera vez, la página vacía que devuelve el
      // `try/catch` se guarda y todo el mundo ve la tienda vacía hasta el
      // siguiente despliegue, con un 200 que no dispara ninguna alarma.
      // Diez minutos es la red debajo: la invalidación bajo demanda sigue
      // dando al obrador el cambio al instante, esto solo garantiza que
      // ningún error se quede a vivir. Va junto con el `no-store` que ponen
      // las páginas al degradar (`~/lib/lectura-publica.ts`): con la red
      // sola, la tienda seguiría vacía diez minutos por cada parpadeo.
      expiration: 600,
      // Ninguna página con sesión puede entrar en una caché compartida: lo
      // que se guardara ahí se le serviría a la siguiente persona. Esta lista
      // es una medida de seguridad, no de rendimiento.
      //
      // El adaptador decide si una ruta va a ISR comparando cada entrada de
      // `exclude` con el `route.pattern` de Astro: si es string, por
      // IGUALDAD EXACTA; si es RegExp, con `.test()`. Un string solo protege
      // ESA ruta exacta, nunca sus hijas. `/admin`, `/cuenta`, `/carrito` y
      // `/api` no son un único fichero dinámico: son ficheros sueltos
      // (`pedidos.astro`, `clientes.astro`, `checkout.ts`, y los que se
      // añadan), así que un string por ruta se queda corto en cuanto se
      // añade una página nueva bajo ese árbol y la deja cacheada sin avisar.
      // Por eso las cinco raíces con sesión van con string (la raíz exacta)
      // + regex (`/^\/raíz\//`, el árbol entero) — no solo las que ya tienen
      // hijas hoy, sino todas, porque la próxima página que se añada bajo
      // cualquiera de ellas no debe depender de acordarse de tocar esta
      // lista.
      //
      // Probé primero el patrón con corchetes que usa Astro para rutas
      // dinámicas (p. ej. `"/admin/[...ruta]"`) pensando que el adaptador lo
      // interpretaría como "todo el árbol". Con un build real
      // (`task-8-report.md`) vi que sí genera una regla de enrutado que
      // cubre el árbol, pero la comparación de arriba (la que decide si esa
      // ruta entra en el mapeo a ISR) sigue siendo por igualdad exacta y ese
      // string nunca es igual a `route.pattern` de una página real, así que
      // cada hija se colaba igualmente en el mapeo a ISR. Que esas páginas
      // no acabaran sirviéndose desde ahí era solo porque la regla de
      // enrutado quedaba antes en `config.json` que esa entrada de ISR
      // sobrante: un accidente del ORDEN en que el adaptador genera las
      // reglas, no una garantía del patrón. De ahí la regex: hace que la
      // comparación misma excluya la ruta, sin entradas muertas ni depender
      // de ese orden.
      exclude: [
        "/admin",
        /^\/admin\//,
        "/cuenta",
        /^\/cuenta\//,
        "/carrito",
        /^\/carrito\//,
        "/acceso",
        /^\/acceso\//,
        /^\/api\//,
        // La baja de las ofertas: depende del token y recibe un POST.
        "/baja",
        // «Pedido confirmado» enseña el número del pedido de cada cliente.
        "/pedido/gracias",
      ],
    },
  }),
  // Las fotos del panel viven en Vercel Blob: sin esto, `<Image>` no las
  // optimiza (y ni siquiera las sirve, según el caso).
  image: {
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
    ],
  },
  // Desde Astro 5.15 el servidor solo se fía de la cabecera Host (y de las
  // X-Forwarded-*) si el dominio está en esta lista. Sin ella, en Vercel cada
  // petición se ve como `https://localhost`, y la comprobación de origen de
  // Astro rechaza con un 403 todo POST tipo formulario: subir fotos en el
  // panel daba «Algo ha fallado» (5 de octubre de 2026). Vercel solo enruta
  // aquí los dominios del proyecto, así que `*.vercel.app` cubre producción
  // y previews sin abrir nada a terceros.
  security: {
    allowedDomains: [
      { protocol: "https", hostname: new URL(SITE).hostname },
      { protocol: "https", hostname: "*.vercel.app" },
    ],
  },
  trailingSlash: "never",
  // «Hostelería y Empresas» pasó a ser «A quién servimos»: la URL vieja puede
  // estar compartida por ahí fuera, así que se redirige en vez de romperse.
  redirects: {
    "/hosteleria-y-empresas": "/a-quien-servimos",
  },
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  build: {
    inlineStylesheets: "auto",
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
});
