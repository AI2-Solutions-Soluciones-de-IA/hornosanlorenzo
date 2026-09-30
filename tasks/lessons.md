# Lecciones — hornosanlorenzo

Formato: **regla** — por qué (el caso que la originó) — cómo aplicarla.

## Verificar

- **Una prueba vale si se pone roja al romper lo que protege.** Pruebas saltadas por no cargar `.env`, una que fallaba por el motivo equivocado, un `vi.mock` escrito y sin usar: sumaban en el recuento y no protegían nada. → Romperlo a propósito; contar las saltadas en terminal limpia (`env -i`); afirmar sobre el motivo del fallo, no solo su tipo.
- **Informe = salida literal, y «no verificado» cuando no lo está.** Dos informes afirmaron de más (un comando que no podía dar esa salida) y volvieron sospechoso todo lo demás. → Pegar la salida tal cual; declarar los huecos.
- **`pnpm build` en cada tarea y producción en un navegador.** Un `*.test.ts` en `src/pages/` rompía el build con pruebas y tipos en verde; el sitio salió sin imágenes con `curl` dando 200 (fallo que solo existe dentro de Vercel). → Build por tarea; tras desplegar, abrir las páginas.
- **Recorrer el camino completo, no solo la pieza tocada.** La ficha estaba bien y la rejilla metía la talla más barata; el menú bien y `/catalogo` con la taxonomía vieja. → Tras tocar datos o navegación, abrir las pantallas que derivan de ellos y pulsar el control arreglado.
- **Layout: medir anchos intermedios, menús abiertos y páginas cortas.** Un desplegable `opacity-0` daba scroll lateral a 1024 px; la cabecera `sticky` dejaba el final del menú móvil inalcanzable; en el panel el título caía 250 px en una página corta (`h-screen` repartido entre filas del grid). → `scrollWidth <= innerWidth` a 375/768/1024/1280, con menús cerrados y abiertos, y una página con poco contenido.
- **El checkout «sin sesión» no se prueba borrando cookies desde la página**: no ve las `httpOnly`. → Contexto de navegador nuevo.

## Entorno y datos

- **El `.env` local es producción y un `astro dev` olvidado escribe en ella.** Un usuario de prueba cayó dos veces en producción: contestaba el `dev` de un agente, no el mío (Astro se muda de puerto sin avisar); había diez huérfanos más. Exportar `DATABASE_URL` no sirve: Vite la lee de `.env`. → `lsof -ti :PUERTO` vacío antes de arrancar; todo agente mata su servidor; tras escribir, comprobar en qué base cayó la fila. Para probar el panel: worktree en el scratchpad con su propio `.env` (`DATABASE_URL` = rama de pruebas, `BETTER_AUTH_SECRET`, `PUBLIC_SITE_URL=http://localhost:PUERTO` o da `INVALID_ORIGIN`), `pnpm install --offline` (un `node_modules` enlazado rompe Astro), alta por `/api/auth/sign-up/email` con `telefono` y `scripts/hacer-admin.mjs`. Al acabar, borrar lo sembrado, matar el `dev` y quitar el worktree.
- **Las pruebas de base de datos comparten tablas y corren a la vez.** Un `delete` de tabla entera tumbó once pruebas de otros ficheros (un worker por fichero, misma rama de Neon). → Cada fichero limpia solo lo suyo por una marca propia (correo, sufijo, fecha lejana) y afirma con `toContain`; suite completa tres veces antes de dar una prueba por buena.
- **Cachés de desarrollo dan falsos positivos.** Tras `pnpm add`, `jsxDEV is not a function` parece React y es Vite. → Vaciar `node_modules/.vite` y `.astro/`; leer el puerto del log.

## Salida a producción

- **Migración antes que el código que la lee.** El plan de packs lo tenía al revés: sin la tabla, `priceOrder` fallaba en todos los carritos. → Solo lectura → migración → datos → código → verificar.
- **Un despliegue se verifica por su SHA.** La primera línea de `vercel ls` puede ser el anterior ya `Ready`, y el CLI de este equipo mira otro scope. → `gh api repos/AI2-Solutions-Soluciones-de-IA/hornosanlorenzo/commits/<SHA>/status`.

## CSS

- **`hidden` no se puede deshacer en `@media print`.** Tailwind v4 lo pone con `!important` en su capa base y un `!important` en capa gana al que no la tiene: la hoja paginada imprimía solo la página a la vista. → Atributo propio (`data-fuera`) oculto dentro de `@media screen`; comprobar con `emulateMedia({ media: "print" })`.
