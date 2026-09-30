# Pendientes — Horno San Lorenzo

## Bloquea encender los cobros
- [ ] **RGPD de las cuentas.** La política de privacidad dice literalmente que
      solo regula el formulario de contacto, y ese formulario recoge menos datos
      y tiene más garantías que el alta de cuenta (que no tiene ni casilla de
      consentimiento ni enlace). Faltan: encargados del tratamiento (Neon,
      Resend, Stripe **y ahora también Vercel Blob**, que entra con el panel de
      productos y noticias de esta rama, así que la lista se hace más larga, no
      más corta), plazo de conservación y **borrado de cuenta a petición**, que
      hoy no existe ni técnicamente. Bloquea que se registre el primer cliente
      real, no el despliegue
- [ ] **Probar una restauración de copia de seguridad**, no solo confiar en que
      Neon las hace: restaurar un volcado a una base vacía y ver que arranca.
      Esto ya no es solo prudencia: con esta rama la carta entera, las noticias
      y los pedidos viven en Postgres. Antes el contenido estaba en git y se
      recuperaba solo aunque se perdiera la base de datos; ahora, si se pierde
      la base de datos, se pierden las 98 fichas, las noticias y los pedidos a
      la vez. Esto sube de «pendiente» a «lo primero que se prueba antes de
      confiar en el sistema»
- [ ] **Las fotos ya no están en git.** Viven en Vercel Blob y no entran hoy en
      ninguna copia de seguridad. Antes una foto mala se corregía con
      `git revert`; ahora, si se borra o se sobrescribe por error desde
      `/admin/productos` o `/admin/noticias`, no hay vuelta atrás. Decidir si se
      hace un volcado periódico de Blob o se asume el riesgo por escrito
- [ ] **Separar la base de datos de desarrollo de la de producción.**
      `DATABASE_URL` sigue apuntando a la misma rama de Neon en local y en
      Vercel. Ya estaba anotado como incómodo; con la carta, las noticias y los
      pedidos viviendo ahí dentro, deja de ser incómodo y pasa a ser peligroso:
      cualquier prueba local podría escribir o borrar sobre las 98 fichas
      reales, sobre una noticia publicada o sobre un pedido de un cliente.
      Desde el 11 de septiembre de 2026 esas 98 fichas y las 5 noticias YA
      ESTÁN en producción, así que el `.env` local apunta hoy a datos reales:
      es lo primero que hay que hacer antes de volver a tocar código que
      escriba en la base. La rama `pruebas` de Neon (la de
      `DATABASE_URL_TEST`) la usan las pruebas, que borran filas: hace falta
      una tercera rama para desarrollo, no reutilizar esa
- [ ] **Retirar `src/content/products/` y `src/content/noticias/`** ahora
      que el volcado ya pasó contra producción (11 de septiembre de 2026:
      98 fichas, 5 noticias, 8 fotos en Blob, `--verificar` en verde en ambos,
      y el ensayo de romper un precio a propósito detectado por la
      verificación). Ya no son la única copia; en cuanto el obrador edite una
      ficha desde el panel, el Markdown queda desactualizado y engaña. Antes
      de borrarlos, comprobar que nada del build los importa todavía
      (`astro:content`, `getCollection`)
- [ ] **`DATABASE_URL` y `BETTER_AUTH_SECRET` en Vercel antes de fusionar
      `feat/base-de-datos-y-acceso` a `main`.** `src/middleware.ts` corre en
      todas las peticiones y importa `~/lib/auth/server`, que crea el pool de
      Postgres en cuanto se carga el módulo: sin `DATABASE_URL` ese `import`
      lanza y **el build de Vercel falla para todo el sitio**, no solo para
      cuenta o carrito. Sin `BETTER_AUTH_SECRET` pasa lo mismo al construirse
      `auth`. Las dos tienen que estar puestas en Vercel antes de fusionar,
      no después.
      Añadir también `PUBLIC_SITE_URL` al entorno de **build**, no solo al de
      ejecución: `import.meta.env.PUBLIC_SITE_URL` se resuelve en build
      (Vite la sustituye como una constante), así que si solo está en el
      entorno de ejecución llega `undefined` a `auth.baseURL` y Better Auth
      construye los enlaces de recuperación de contraseña con el `Host` de
      cada petición en vez de con el dominio real.
- [ ] **Antes de poner `RESEND_API_KEY`: cerrar la fuga por tiempo de la
      recuperación de contraseña.** La respuesta de «he olvidado mi contraseña»
      dice lo mismo exista o no la cuenta, pero si existe **espera** a que salga
      el correo y si no existe no espera: se puede saber quién es cliente
      midiendo cuánto tarda. Hoy no se nota porque no hay proveedor configurado.
      El arreglo es `advanced.backgroundTasks.handler` de Better Auth con el
      `waitUntil` de Vercel, pero **exige Fluid Compute activado** en el panel
      del proyecto: sin eso, `waitUntil` es un no-op silencioso y el correo de
      recuperación podría no enviarse nunca. Comprobar primero si está activo
      (detalle en la sección «Ronda de arreglo 1» del informe de la tarea 9)
- [ ] **Validar los códigos postales de reparto.** `CP_RANGOS` en
      `src/lib/entrega.ts` bloquea el envío fuera de zona, pero los rangos los
      saqué yo de fuentes públicas, no del cliente: Madrid capital
      28001–28055,
      Alcobendas 28100–28109, Pozuelo 28220–28224, San Sebastián de los Reyes
      28700–28709, Tres Cantos 28760. Confirmarlos con el obrador antes de
      cobrar: un rango de más acepta pedidos que no se pueden repartir, y uno
      de menos rechaza clientes buenos
- [ ] **Alérgenos de las 98 fichas.** Siguen todas con `allergens: []` porque la
      carta impresa no los trae — eso no ha cambiado, y no se pueden inventar.
      Lo que sí cambió: ya no es tarea de un desarrollador editando 98 Markdown
      uno a uno. El obrador puede entrarlos él mismo, ficha a ficha, desde
      `/admin/productos`, en cuanto exista la ficha en producción (ver el punto
      del volcado, más arriba). Siguen teniendo que venir de ellos, pero ya no
      hace falta pasar por nosotros para meterlos
- [ ] Configurar las 5 variables de Stripe y Resend en Vercel (`.env.example`).
      Hasta entonces «Pagar» anota el pedido como `sin_pago` (desde el 11 de
      septiembre de 2026) y cualquiera puede dejar uno sin cobrar; el panel
      lo marca «Sin pagar». Al poner la clave, la rama deja de entrar sola
- [ ] **Falta el correo de aviso al obrador de los pedidos `sin_pago`**: el
      webhook de Stripe avisa por Resend al cobrar, pero esta rama no pasa por
      ahí. Hoy solo se ven entrando en `/admin/pedidos`
- [ ] Condiciones de compra: razón social, CIF y revisión legal
- [ ] Confirmar con el obrador gastos de envío (constante en
      `src/lib/entrega.ts`, hoy a cero). El pedido mínimo ya está: 25 € de
      lunes a jueves, 35 € viernes, sábados y vísperas de festivo
- [ ] Festivos de `FESTIVOS` en `src/lib/entrega.ts`: ¿cuentan los locales
      de Alcobendas, Pozuelo, Sanse y Tres Cantos, o solo los de Madrid
      capital? Y añadir los de 2027 cuando salga el calendario oficial
- [ ] Confirmar qué formas de pago admite cada tienda

## Carta: lo que falta
- [ ] **Fotos reales.** Las 98 fichas siguen llevando las 8 fotos del obrador
      repetidas por familia, ninguna es la del producto de su propia ficha —
      eso no ha cambiado. Lo que cambió: las fotos ya no se comitean al
      repositorio, se suben desde `/admin/productos` (Vercel Blob detrás).
      Sigue haciendo falta una sesión de fotos del obrador, producto a
      producto, pero en cuanto exista quien la tenga puede subirla directamente
      desde el panel, sin pasar por un desarrollador ni por un `git commit`
- [ ] Salado repite foto en fichas seguidas (solo hay una foto salada en el
      lote). Decidir: dejarlo, o recortar la de empanadas en dos encuadres
- [ ] Copy propio para 47 productos que hoy usan la nota de su sección
      (planchas, colección especial, brazos, empanadas, quiches, Lorenzas)
- [ ] Páginas de la carta de **bollería diaria** y **temporada**: no estaban en
      los rangos 5–14, así que esas dos gamas no tienen ni una ficha
- [ ] Precio de «Las Lorenzas Rellenas Saladas» y «Las Lorenzas Variadas»,
      hoy marcadas `consultar: true`

## Coherencia y deuda
- [ ] Descriptor de **Pack Reunión en Oficina**: la diapositiva dice «La reunión
      resuelta antes de las 10:30: salado serio, croissants rellenos y el dulce
      para el café». Se publicó sin «antes de las 10:30» porque esa franja de
      reparto no existe en el checkout (dice «antes de las 14:30»). Recuperar la
      frase cuando entre la franja
- [ ] Primera foto que se suba desde el panel tras el cambio de almacén (29-9):
      comprobar que su URL empieza por `xp8nqc338hkzzibd.public.blob…` y que se
      ve. La clave se probó copiando ficheros, no desde el panel desplegado
- [ ] `astro.config.mjs` cita `*-oscarsr96s-projects.vercel.app` como URL
      interna del despliegue; desde la migración a AI2 es
      `*-ai-2-solutions-7810bd50.vercel.app`. Solo el comentario
- [ ] Variables del entorno **preview** en Vercel (`DATABASE_URL`,
      `BETTER_AUTH_SECRET`): no se pudieron poner con el CLI v50 instalado, que
      pide confirmación interactiva. Sin ellas los despliegues de rama fallan al
      construir y los pull requests salen en rojo. Se arregla desde el panel o
      actualizando el CLI
- [ ] Comprobar en un despliegue real que el límite de intentos identifica la IP
      del cliente y no cae en el contador global. Es la única defensa contra
      fuerza bruta que hay
- [ ] **Pantalla para dar de alta a otro admin.** Hoy el papel se da con
      `pnpm admin correo@ejemplo.com` contra la base de datos. La spec §7 dice
      que un admin debería poder dar de alta a otro desde el panel; mientras no
      exista, cada alta pasa por alguien con acceso a `DATABASE_URL`
- [ ] **Cerrar y volver a abrir sesión después de `pnpm admin`.** El papel viaja
      en la sesión que resuelve el middleware: quien ya estuviera dentro sigue
      viendo la web como cliente hasta que vuelve a entrar
- [ ] **El panel no deja registro de quién cambia qué.** Un cambio de precio,
      de foto, de alérgenos o de una noticia publicada no queda anotado hoy con
      quién lo hizo ni cuándo. Con un solo administrador no importa; en cuanto
      haya dos, un precio mal puesto o una ficha desactivada por error no se
      puede rastrear hasta quien lo tecleó
- [ ] **Nadie ha visto el panel en un navegador de verdad.** Cada pantalla
      (`/admin/pedidos`, `/admin/clientes`, `/admin/noticias`,
      `/admin/productos`) se verificó con pruebas automáticas, `curl` y la
      salida de `pnpm build`, nunca abriéndola en un navegador. Las páginas
      PÚBLICAS sí se vieron el 11 de septiembre de 2026 en producción
      (`/catalogo/dulce` y una ficha con foto de Blob), y eso es justo lo que
      destapó que la web había salido sin imágenes (commit `968d5c1`). Falta
      la pasada visual del panel y, sobre todo, probar de principio a fin el
      flujo de subir una foto real: elegir fichero, que suba a Vercel Blob,
      guardar la ficha, y comprobar que la invalidación con
      `VERCEL_BYPASS_TOKEN` hace que se vea cambiada en `/catalogo` al
      instante (el token está puesto, pero nadie lo ha visto funcionar).
      Añadido el 11 de septiembre, también sin ver con sesión: el botón
      «Panel de administración» de la cabecera, «Marcar como cobrado» y
      «Deshacer» sobre el pedido de prueba, y que `pedidos.xlsx` abre bien en
      el Excel de Oscar
- [ ] **Borrar el pedido de prueba** «Prueba de flujo (Claude)» de producción
      (`b560ca67-…`, 6,00 €, sin pago) cuando ya no haga falta para probar
- [ ] `/acceso` sale con `cache-control: public, max-age=0, must-revalidate`,
      no `no-store` como `/carrito`; visto en producción el 11 de septiembre.
      Hoy no cachea nada porque `max-age=0`, pero la página lleva formulario
      de sesión y debería declararse `no-store` como las demás
- [ ] Borrar `.superpowers/` (informes SDD del plan 2): el despliegue ya está
      confirmado y no aportan nada al repositorio
- [ ] **Firma en versión clara.** La cabecera es teja y el logo es moka: hoy se
      invierte a blanco por CSS (`[filter:brightness(0)_invert(1)]` en
      `Header.astro`), lo que aplana el acento teja del «desde 1986». Pedir al
      cliente el PNG de la firma en blanco y quitar el filtro
- [ ] **Copy de «Particulares» inventado.** La sección 01 de
      `/a-quien-servimos` (lead, bullets y cita) la escribí yo por analogía con
      Hostelería y Empresas: el brief solo traía esos dos canales. Validar con
      el cliente antes de enseñarlo
- [ ] Los tres servicios de la home (`src/data/services.ts`) siguen siendo
      «Reparto propio · Empresas y oficinas · Hostelería»: no casan con los tres
      públicos nuevos (Particulares · Hostelería · Empresas). Unificar
- [ ] Sin WhatsApp en todo el sitio (decisión del 9 de septiembre de 2026): la
      única vía de pedido es Stripe, que aún no tiene claves. Hasta
      configurarlo, el checkout solo puede ofrecer teléfono
- [ ] `src/components/Firma.astro` quedó sin uso al poner el logo en PNG en la
      cabecera: borrarlo o reutilizarlo en documentos
- [ ] `/catalogo/empanada-de-zorza` ya no existe (ahora `-picadillo-adobado`) y
      no hay redirección
- [ ] Pozuelo abre domingos según su ficha, pero el checkout bloquea todos los
      domingos (`isClosed` en `src/lib/entrega.ts`). Preguntar al obrador
- [ ] Taxonomía legacy en `src/data/categories.ts`: `temporada` se quedó a cero
      productos y la etiqueta de `bolleria` ya no describe su contenido
- [ ] Nombres desalineados: el pie dice «Nuestros productos» y «Packs y promos»
      frente a «Tienda Online» y «Packs» del menú; y «Carta» no está en el pie
- [ ] El hero usa `--color-cream`, el mismo tono que ahora tiene la banda
      superior: cabecera y hero se funden
- [ ] La cabecera sticky en móvil ocupa ~132 px con el CTA. Valorar sacarlo
      del sticky si molesta al hacer scroll
- [ ] SVG oficial de Bizum para el pie (Simple Icons no lo trae)
- [ ] Foto real de cajitas para el submenú de «Packs»
- [ ] Decidir si se recupera, reformulado, el copy retirado de Tradición
      («cero mejorantes, conservantes y colorantes»): el manual prohíbe las
      promesas de salud, pero puede ser un argumento de venta real

## Más adelante
- [ ] **Llevar el cómputo a Cloud Run** cuando el proyecto esté asentado. Del
      análisis de costes del 9 de septiembre de 2026: Vercel Pro son ~20 €/mes
      —Hobby no vale, es solo uso no comercial y esto cobra con Stripe— y Cloud
      Run a este tráfico son ~2–5 € porque escala a cero. La base de datos **se
      queda donde esté**: Cloud SQL no tiene plan gratuito, no baja a cero y es
      justo la pieza cara (~10–30 €/mes). O sea, la jugada es mover el cómputo,
      no «migrar a Google Cloud». Son unas horas, no una migración, porque el
      diseño ya no depende del proveedor
      (`docs/superpowers/specs/2026-09-09-registro-usuarios-y-panel-admin-design.md`, §5.3).
      Ojo con Cloudflare como alternativa barata: su entorno no es Node del todo
      y `pg` no funciona ahí sin cambiar a un driver por HTTP. Cloud Run sí, es
      un contenedor de Node normal.
      Los precios salen de mi entrenamiento, no de sus webs: confírmalos antes
      de decidir
- [ ] Bloque E: alta B2B real con validación de CIF, precios por cliente y
      packs XL descontados. Necesita backend (auth + base de datos)
- [ ] Si algún día se quieren cuentas de usuario, el alta de `/acceso` está
      montada para admitir contraseña. Hoy no la pide a propósito
