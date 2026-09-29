# Lecciones — hornosanlorenzo

## Las cachés de desarrollo dan falsos positivos

Tras `pnpm add`, la caché de Vite falla con `jsxDEV is not a function`, que
parece un error de React y no lo es. Tras reiniciar, Astro cambia de puerto sin
avisar y se prueba contra un servidor viejo.

**Why:** una prueba que pasa —o falla— contra el entorno equivocado cierra la
investigación en falso.

**How to apply:** vaciar `node_modules/.vite` y `.astro/`, y leer el puerto del
log (`grep -i local`) en vez de darlo por hecho.

## Verificar el camino completo, no la pieza que tocaste

Cargué productos con varios tamaños y comprobé la ficha: la rejilla seguía
metiendo en el carrito la talla más barata. Añadí «Top Ventas» al submenú y
comprobé el menú: `/catalogo` seguía pintando la taxonomía vieja.

**Why:** lo editado funcionaba; fallaba la pantalla de al lado que derivaba de
lo mismo.

**How to apply:** tras tocar datos o navegación, recorrer en el navegador las
páginas que derivan de esa estructura. Y al arreglar un control, pulsarlo.

## La verificación que no verifica

Cinco formas de creer que algo está comprobado cuando no lo está:

- Pruebas que **se saltaban** con `pnpm test` porque el comando no cargaba
  `.env`, con el informe diciendo «4/4 en verde» porque se corrieron con la
  variable exportada a mano.
- Una prueba de código postal que seguía pasando con la validación de zona
  rota: usaba un producto inexistente y solo comprobaba que fallara, no por qué.
- Dos fallos de build que sobrevivieron cuatro tareas con pruebas y tipos en
  verde —un `*.test.ts` dentro de `src/pages/`, que Astro trata como ruta—
  porque `pnpm build` solo se corría al final.
- Una comprobación del checkout «sin sesión» hecha borrando cookies desde el
  navegador, que no ve las `httpOnly`.
- Esperar un despliegue mirando la primera línea de `vercel ls --prod`: si aún
  no ha empezado el nuevo, esa línea es el anterior, ya `Ready`, y el bucle da
  por bueno algo que no ha construido (29-9, migración a AI2). Buscar el
  despliegue por el SHA del commit (`meta.githubCommitSha` en la API).
- Dos **informes que afirmaban haber verificado lo que no verificaron** (plan
  2): uno pegaba un comando que, leído literalmente, no podía dar esa salida
  —ponía `DATABASE_URL_TEST=…` y el script solo lee `DATABASE_URL`—; otro daba
  por cubierta la guardia de un endpoint con una prueba que nunca lo importaba,
  con el `vi.mock` necesario escrito y sin usar. Los cazó la revisión, no el
  autor.
- El plan 2 salió a producción **sin una sola imagen** (11 de septiembre) con
  129 pruebas, `astro check`, `pnpm build` y `curl` a las rutas en verde: el
  endpoint `/_image` se leía a sí mismo por la URL interna del despliegue,
  que está detrás de Vercel Authentication. Ese fallo **solo existe dentro de
  Vercel**; lo destapó abrir el catálogo en un navegador contra producción.

**Why:** todas aparecían en el recuento y ninguna protegía nada. Es peor que no
tenerlas: dan tranquilidad falsa y nadie vuelve a mirarlas. Y un informe que
afirma de más es más caro que un hueco declarado, porque vuelve sospechoso todo
lo demás que dice ese informe.

**How to apply:** romper a propósito lo que la prueba protege y verla ponerse
roja. Contar las saltadas en terminal limpia (`env -i`), no en la tuya.
Afirmar sobre el motivo del fallo, no solo sobre su tipo. Y `pnpm build` en
cada tarea, que ni las pruebas ni los tipos ven si el sitio se despliega.
Tras desplegar, mirar producción con un navegador, no solo con `curl`: un 200
con la página vacía de imágenes sigue siendo un 200. Al escribir un informe,
pegar la **salida literal**, no un resumen: si el
comando pegado no puede producir esa salida, alguien lo verá. Un `vi.mock` que
ninguna prueba usa es una prueba que se pensó y no se escribió, no decoración.
Y «no verificado» es gratis; decirlo cuesta menos que perder la credibilidad
del resto del informe.

## Las pruebas de base de datos comparten tablas y corren a la vez

Un `delete from productos` en `noticias.test.ts` pasó tres veces en verde y
era una carrera con `productos.test.ts`; al añadir `estadisticas.test.ts`,
que borraba `pedidos` y `user` enteras, cayeron once pruebas de tres
ficheros que no había tocado.

**Why:** Vitest ejecuta cada fichero en un worker distinto contra la MISMA
rama de Neon. Un borrado de tabla entera es un borrado de las filas de otro
fichero en mitad de su prueba; que pase depende del orden de llegada.

**How to apply:** cada fichero limpia solo lo suyo, por una marca propia
(correo `@stats.test`, nombre con sufijo, día de entrega en 2031, fecha de
entrada en 2021), y afirma con `toContain`, no con `toEqual` sobre la tabla
entera. Antes de dar por buena una prueba nueva de base de datos, correr la
suite completa tres veces seguidas.

## Un `astro dev` olvidado apunta a producción

Al integrar la hoja de producción, el buscador y el historial (12 de
septiembre de 2026), un usuario de prueba cayó **dos veces en la base de
producción** aunque yo arrancaba el servidor con `DATABASE_URL` de pruebas y
luego con `.env.development`. El que respondía en el puerto 4399 no era mi
servidor: un agente había arrancado `astro dev` en su worktree —con la copia
de `.env`, o sea, producción— para comprobar que una ruta devolvía 302, y lo
dejó vivo. Astro, al ver el puerto ocupado, arranca el mío en el siguiente
sin decir nada. Al mirar había además diez `astro dev` huérfanos de sesiones
anteriores conectados a producción.

**Why:** un `dev` es un proceso con la cadena de conexión real dentro. Mientras
`.env` apunte a producción (pendiente del todo «separar la base de datos de
desarrollo»), cualquier servidor olvidado es una puerta a datos reales, y un
`curl` a `localhost:PUERTO` no dice qué proceso contesta.

**How to apply:** antes de arrancar un `dev`, `lsof -ti :PUERTO` tiene que
estar vacío; si no, matar lo que haya, no elegir otro puerto. Después de una
prueba local que escriba, comprobar **en qué base** ha caído la fila antes de
seguir (una consulta a cada rama), no dar por hecho que fue a la de pruebas.
Un agente que arranque un servidor lo mata al terminar, y la instrucción se
lo tiene que decir. Y para redirigir el `dev` a otra base no vale exportar la
variable: `pool.ts` lee `import.meta.env.DATABASE_URL`, que Vite rellena
desde `.env`.
