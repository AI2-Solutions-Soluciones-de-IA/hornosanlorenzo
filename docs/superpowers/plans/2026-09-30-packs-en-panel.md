# Packs editables desde el panel y menú lateral — plan de implementación

> **Para quien lo ejecute:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development`
> (recomendada) o `superpowers:executing-plans` para implementarlo tarea a tarea. Los pasos van
> con casilla (`- [ ]`) para poder marcarlos.

**Objetivo:** que Oscar cree y edite packs desde `/admin/packs`, separados de Productos, y todo:
nombre, precio, foto, activo/agotado, textos de la ficha y la composición (piezas fijas, huecos a
elegir, foto del cliente). Y que el menú del panel pase de una fila arriba a una columna lateral.

**Arquitectura:** el pack sigue siendo **una fila de `productos`** (categoría y sección `packs`):
carrito, checkout, pedidos, Excel y producción no cambian de camino. Lo que hoy vive en código
(`packs` y `packPorSlug` en `src/data/packs.ts`) pasa a **dos tablas nuevas**:
`pack_definiciones` (una fila por pack, textos) y `pack_piezas` (sus piezas en orden). El tipo
`DefinicionPack` y las funciones puras de `src/data/packs.ts` (`resolverPack`,
`opcionesDeHueco`, `precioSueltoCents`…) **no cambian**: el repositorio nuevo devuelve
exactamente ese tipo. Los 7 packs actuales se vuelcan a las tablas con un script, conservando
los `id` de los huecos (`empanada`, `plancha`, `quiche1`…) para que los carritos abiertos sigan
valiendo.

**Stack:** Astro 5 · React (islas) · `pg` 8 · Zod 3 · Vitest · Tailwind 4 · pnpm.

**Antecedentes:** `docs/superpowers/plans/2026-09-30-packs.md` (los packs tal y como están hoy en
producción). Decisión de Oscar del 30-9-2026: **todo editable, incluida la composición**; packs
en una sección propia del panel; menú lateral.

---

## Restricciones globales

- **PRODUCCIÓN NO SE TOCA HASTA LA TAREA 9.** El `.env` del repo principal apunta a la base de
  **producción** (Neon `ep-frosty-rain`). Se trabaja en un worktree cuyo `.env` tiene
  `DATABASE_URL` = rama de **pruebas** (`ep-lucky-surf`). Antes de cualquier script, migración o
  `dev`: `grep -o "^DATABASE_URL=[^@]*@[^.]*" .env` tiene que decir `ep-lucky-surf`.
- **El precio lo calcula el servidor** (`priceOrder`). El panel no manda importes derivados: el
  precio del pack es el campo que Oscar escribe; el «comprado suelto» y el ahorro se calculan.
- **Solo `src/lib/db/pool.ts` importa `pg`**; los nombres de columna no salen de `src/lib/db/`.
- **Migraciones acumulativas** (`db/migrations/013_*.sql`), nunca se edita una aplicada.
- **Pruebas con Postgres bajo `describeSiHayBD`**, `import()` dinámico en `beforeAll`, y cada
  fichero limpia **solo lo suyo** (Vitest corre ficheros en paralelo contra la misma rama:
  `tasks/lessons.md`).
- **Commit solo en verde, encadenado con `&&`**: `pnpm test && pnpm check && pnpm build && git commit …`.
- **Marca:** sin esquinas redondeadas, sin sombras, sin degradados; filete de 1 px avellana; CTA
  caramelo; un solo acento teja por pieza; iconos de trazo, nunca rellenos.
- **Lo que ve el cliente no cambia** con la migración de código a base de datos: mismas fichas,
  mismos precios, mismos desplegables, mismos `id` de hueco. La Tarea 9 lo comprueba comparando
  el HTML de antes y después.
- **Panel en castellano**, con mensajes para una persona sin conocimientos técnicos.

## Foco de revisión

1. **Editar un pack con carritos abiertos:** si Oscar borra o renombra un hueco, un carrito que
   ya lo tenía se rechaza en el checkout con un mensaje claro («… vuelve a elegir»), nunca se
   cobra mal. Los `id` de hueco existentes no cambian al editar otros campos (Tareas 3 y 6).
2. **Un pack guardado que no se puede vender** (pieza fija que no existe, tamaño que el producto
   no tiene, hueco sin ninguna opción, dos piezas con foto, precio ≥ suelto): lo imposible se
   rechaza al guardar con un mensaje que dice qué pieza falla; lo dudoso (sin ahorro) se avisa
   pero se deja guardar (Tarea 3).
3. **Un producto que se desactiva o cambia de precio en Productos** tiene que reflejarse en las
   fichas de TODOS los packs que lo usan, también los creados desde el panel (invalidación de
   caché dinámica, Tarea 4).
4. **Productos ya no puede crear ni editar packs** (ni convertir un producto en pack): si no,
   aparecería un pack sin definición. La API lo rechaza, no solo el formulario (Tarea 5).
5. **Fallo de Postgres** al leer definiciones en una página pública: la página no se cachea y el
   pack sale «No disponible», igual que hoy (Tarea 4).

---

## Mapa de ficheros

| Fichero | Qué hace |
| --- | --- |
| `db/migrations/013_pack_definiciones.sql` | Tablas `pack_definiciones` y `pack_piezas` |
| `src/lib/db/packs.ts` (+ test) | Lee definiciones (`DefinicionPack`) y guarda un pack entero en una transacción |
| `scripts/packs-iniciales.json` · `scripts/volcar-packs.mjs` | Los 7 packs de hoy, en datos; el script los mete en las tablas |
| `src/lib/pack-validacion.ts` (+ test) | Esquema Zod del formulario y comprobaciones contra la carta |
| `src/data/packs.ts` | Pierde `packs` y `packPorSlug`; se quedan tipos y funciones puras |
| `src/lib/pedido.ts`, `src/pages/catalogo/[slug].astro`, `src/pages/catalogo/packs.astro`, `src/components/ElementoCatalogo.astro`, `src/components/CatalogoGrid.astro`, páginas que usan la rejilla, `src/pages/index.astro`, `src/lib/cache.ts` | Leen definiciones de la base de datos |
| `src/pages/api/admin/packs.ts` (+ `src/tests/api-admin-packs.test.ts`) | Listar, crear y editar packs |
| `src/pages/api/admin/productos.ts`, `src/islands/AdminProductos.tsx`, `src/pages/admin/productos.astro` | Productos deja fuera los packs |
| `src/pages/admin/packs.astro`, `src/islands/AdminPacks.tsx`, `src/islands/admin-packs/*` | La sección del panel |
| `src/layouts/AdminLayout.astro` | Menú lateral |

---

### Tarea 1: Tablas y repositorio de definiciones

**Files:** Create `db/migrations/013_pack_definiciones.sql`, `src/lib/db/packs.ts`,
`src/lib/db/packs.test.ts`.

**Interfaces — Produces:**

```ts
// src/lib/db/packs.ts
import type { DefinicionPack } from "~/data/packs";

/** Definiciones por slug del pack. Sin filtrar por activo: eso lo decide quien llama. */
export function definicionesPorSlugs(slugs: string[]): Promise<Map<string, DefinicionPack>>;
/** Todas, para el catálogo público y la invalidación de caché. */
export function todasLasDefiniciones(): Promise<Map<string, DefinicionPack>>;
/** Rutas públicas de todas las fichas de pack (para invalidar). */
export function rutasDePacks(): Promise<string[]>;

export type DatosPack = {
  /** Solo al crear; al editar no cambia (es la URL y la referencia de pedidos). */
  slug?: string;
  name: string;
  priceCents: number;
  shortDescription: string; // el descriptor de la ficha
  imageUrl: string | null; imageAlt: string | null;
  imageWidth: number | null; imageHeight: number | null;
  activo: boolean; agotado: boolean; orden: number;
  definicion: Omit<DefinicionPack, "slug">;
};
/** Crea el pack (fila de productos + definición + piezas). Devuelve el slug. */
export function crearPack(datos: DatosPack & { slug: string }): Promise<string>;
/** Sustituye todo lo editable de un pack existente. Error si no existe o no es un pack. */
export function actualizarPack(slug: string, datos: DatosPack): Promise<void>;
```

- [ ] **Paso 1: migración.**

```sql
-- Packs editables desde el panel (30-9-2026). El pack sigue siendo una fila
-- de `productos` (categoría `packs`): nombre, precio, foto y activo viven
-- allí. Aquí va lo que antes estaba en `src/data/packs.ts`.
create table if not exists pack_definiciones (
  producto_id    uuid primary key references productos(id) on delete cascade,
  ocasion        text not null,
  personas_min   integer not null check (personas_min > 0),
  personas_max   integer not null check (personas_max >= personas_min),
  personas_texto text not null,
  para_quien     text[] not null default '{}',
  consejo        text
);

create table if not exists pack_piezas (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references pack_definiciones(producto_id) on delete cascade,
  orden         integer not null,
  tipo          text not null check (tipo in ('fija', 'eleccion')),
  titulo        text not null,
  descripcion   text not null default '',
  variant_id    text,
  -- fija
  slug          text,
  requiere_foto boolean not null default false,
  rotulo        text,
  -- eleccion
  hueco_id      text,
  etiqueta      text,
  seccion       text,
  slugs         text[],
  check (
    (tipo = 'fija' and slug is not null and hueco_id is null and etiqueta is null
       and seccion is null and slugs is null)
    or
    (tipo = 'eleccion' and slug is null and hueco_id is not null and etiqueta is not null
       and requiere_foto = false and rotulo is null
       and ((seccion is not null) <> (slugs is not null)))
  ),
  unique (producto_id, orden),
  unique (producto_id, hueco_id)
);
create index if not exists pack_piezas_por_pack on pack_piezas (producto_id, orden);
```

- [ ] **Paso 2: pruebas que fallan** (`describeSiHayBD`; marca propia: slugs `test-packdb-…`):
  crear un pack con una fija con `variantId` y `rotulo` + `requiereFoto`, una fija sin variante,
  un hueco por sección con variante y un hueco de lista cerrada; `definicionesPorSlugs` devuelve un
  `DefinicionPack` **idéntico** (`toEqual`) al de entrada, con las piezas en orden y los campos
  opcionales ausentes (no `null`) cuando no se dieron; `actualizarPack` sustituye piezas y textos
  y mantiene el `id` de la fila de productos (los pedidos antiguos no apuntan a él, pero
  `rutasDePacks` sí); `actualizarPack` de un slug que no es pack lanza; `crearPack` con un slug
  repetido lanza; `rutasDePacks` incluye `/catalogo/test-packdb-…`; `todasLasDefiniciones` no
  devuelve productos que no son packs.
- [ ] **Paso 3:** implementar. Una consulta con `json_agg(... order by orden)` para las piezas,
  mapeo a `DefinicionPack` en una función `aDefinicion(fila)` que omite claves nulas. Escrituras en
  **una transacción**: `productos` (insert o update, siempre `category='packs'`,
  `seccion='packs'`, `consultar=false`, `unit=null`, `cuerpo=''`, `allergens='{}'`,
  `destacado=false`, `temporada=false`, `especialidad=null`), `pack_definiciones` (upsert) y
  `pack_piezas` (delete + insert, mismo patrón que `guardaVariantes` en `productos.ts`).
- [ ] **Paso 4:** `pnpm db:migrar` (en el worktree → pruebas) y pruebas en verde. Commit.

---

### Tarea 2: Volcar los 7 packs de hoy a las tablas

**Files:** Create `scripts/packs-iniciales.json`, `scripts/volcar-packs.mjs`. Test: prueba en
`src/data/packs.test.ts`.

- [ ] **Paso 1: el JSON sale del código actual, no a mano.** Genera `scripts/packs-iniciales.json`
  con `JSON.stringify(packs, null, 2)` del array `packs` de `src/data/packs.ts` (por ejemplo con
  una prueba de un solo uso o `vite-node`), y añade en `src/data/packs.test.ts` una prueba que
  compare el JSON con `packs` (`toEqual`). Esa prueba se borra en la Tarea 4 junto con `packs`;
  mientras tanto garantiza que el volcado es fiel.
- [ ] **Paso 2: el script.** Mismo esqueleto que `scripts/crear-packs.mjs` (en seco por defecto;
  `--aplicar` exige `--copia=<fichero>`; una transacción; `--sin-invalidar`). Para cada pack del
  JSON: si la fila de `productos` no existe o no es `category='packs'` → error y no se aplica
  nada; si ya tiene definición → «ya tiene definición, no se toca»; si no → inserta
  `pack_definiciones` y `pack_piezas` con el mismo mapeo que `crearPack` (copia la función de
  mapeo en el `.mjs` con un comentario que apunte a `src/lib/db/packs.ts`: un `.mjs` no puede
  importar TypeScript). Al final, en seco o no, **relee** con la misma consulta que
  `definicionesPorSlugs` y compara con el JSON: si algo no cuadra, lo dice.
- [ ] **Paso 3:** ejecutarlo en la rama de pruebas (crea antes las fichas con
  `scripts/crear-packs.mjs --aplicar --sin-invalidar` si las pruebas las borraron). Commit.

---

### Tarea 3: Validación de un pack

**Files:** Create `src/lib/pack-validacion.ts`, `src/lib/pack-validacion.test.ts`.

**Interfaces — Produces:**

```ts
export const esquemaPack: z.ZodType<DatosPackEntrada>; // lo que manda el panel
export type Problema = { donde: string; mensaje: string }; // donde: "precio", "pieza 3", "hueco «Sabor…»"
export function comprobarPack(
  datos: DatosPackEntrada,
  carta: readonly ProductoPieza[],  // todos los productos NO pack, activos o no
): { errores: Problema[]; avisos: Problema[] };
```

- [ ] **Paso 1: pruebas que fallan.** Errores (no deja guardar):
  - nombre < 2, descriptor < 3, precio ≤ 0, `personas.min > max`, ninguna pieza;
  - pieza fija con un slug que no está en la carta, o que es un pack;
  - pieza fija sin `variantId` de un producto con tamaños, o con un `variantId` que no tiene;
  - más de una pieza con `requiereFoto`; `rotulo` sin `requiereFoto` se permite;
  - hueco con `seccion` y `slugs` a la vez, o con ninguno; `slugs` vacío; `seccion` fuera de
    `seccionIds`; un slug de la lista que no existe;
  - `id` de hueco repetido o que no casa `^[a-z0-9-]{1,40}$`; más de 8 huecos (el checkout no
    acepta más de 8 elecciones, `pedido.ts`);
  - hueco sin **ninguna** opción vendible hoy (`opcionesDeHueco` vacío).
  Avisos (deja guardar):
  - precio ≥ «comprado suelto» («este pack no ahorra nada»);
  - alguna pieza fija agotada o desactivada hoy («la ficha saldrá como no disponible»).
- [ ] **Paso 2:** implementar reutilizando `opcionesDeHueco`, `precioSueltoCents` de
  `~/data/packs`. Mensajes en castellano llano: «La pieza 2 pide el tamaño «XL» y «Plancha de
  Oreo» no lo tiene».
- [ ] **Paso 3:** verde. Commit.

---

### Tarea 4: El sitio lee las definiciones de la base de datos

**Files:** Modify `src/data/packs.ts` (quitar `packs`, `packPorSlug` y la prueba del JSON),
`src/lib/pedido.ts` (+ test), `src/pages/catalogo/[slug].astro`, `src/pages/catalogo/packs.astro`,
`src/components/ElementoCatalogo.astro`, `src/components/CatalogoGrid.astro`, las páginas que
pintan `CatalogoGrid` o `ElementoCatalogo` (`src/pages/index.astro`, `src/pages/catalogo/*.astro`),
`src/lib/cache.ts`, `src/pages/api/admin/productos.ts`, `src/lib/lectura-publica.ts`.

**Interfaces:** `lectura-publica.ts` gana `definicionesPublicas(respuesta): Promise<Map<string,
DefinicionPack>>` con el mismo contrato de fallo que `catalogoPublico` (si Postgres falla: mapa
vacío + `no-store`). `CatalogoGrid` y `ElementoCatalogo` reciben `defsPacks: Map<string,
DefinicionPack>` por prop.

- [ ] **Paso 1: `priceOrder`.** Sustituye `packPorSlug` por una lectura
  `definicionesPorSlugs(slugs del carrito)` al principio (una consulta). La coherencia
  categoría/definición que ya existe se queda. En `pedido.test.ts`, dobla `~/lib/db/packs` junto a
  `~/lib/db/productos`. Antes de `resolverPack`, si las claves de `opciones` no son exactamente
  los `id` de hueco de la definición actual → `OrderError("«<pack>» ha cambiado desde que lo
  añadiste: quítalo del carrito y vuelve a elegirlo.")`. Prueba nueva (foco 1): un carrito con
  `opciones: { empanada, plancha }` de un pack cuya definición ahora tiene un hueco `sabor` en vez
  de `plancha` → ese mensaje, no «Elección no válida» ni «Elige…».
- [ ] **Paso 2: páginas.** `[slug].astro` y `/catalogo/packs` leen la definición de la base de
  datos; fallo → mismo tratamiento que hoy (sin caché, «No disponible»). La rejilla y la home
  pasan `defsPacks` leído una vez por página.
- [ ] **Paso 3: caché (foco 3).** `RUTAS_CATALOGO` deja de listar las fichas de pack (era la lista
  del código). `api/admin/productos.ts`, al guardar, invalida
  `[...RUTAS_CATALOGO, ...(await rutasDePacks()), "/catalogo/<slug>"]`; si `rutasDePacks` falla,
  invalida el resto igualmente y lo registra.
- [ ] **Paso 4:** quitar `packs`/`packPorSlug` de `src/data/packs.ts` y todo import que quede
  (`grep -rn "packPorSlug\|packs\b" src`); la prueba de los 7 packs de `packs.test.ts` pasa a
  leer `scripts/packs-iniciales.json` (las cifras del pptx siguen fijadas).
- [ ] **Paso 5:** navegador en el worktree (rama de pruebas, con el volcado de la Tarea 2
  aplicado): `/catalogo/packs` y las 7 fichas iguales que antes. Commit.

---

### Tarea 5: API del panel y Productos sin packs

**Files:** Create `src/pages/api/admin/packs.ts`, `src/tests/api-admin-packs.test.ts`. Modify
`src/pages/api/admin/productos.ts`, `src/pages/admin/productos.astro`, `src/islands/AdminProductos.tsx`.

- [ ] **Paso 1: pruebas que fallan** (mismo patrón que `src/tests/api-admin.test.ts`):
  - sin sesión de admin → 404, como el resto del panel;
  - `GET` → packs (fila + definición + suelto/ahorro calculados) y la carta resumida para el editor
    (slug, nombre, sección, precio, tamaños, activo, agotado);
  - `POST` válido → 201 con el slug (sale de `slugify(name)`; si choca, sufijo `-2`, `-3`…);
    inválido → 400 con `{ errores: Problema[] }`; con avisos → 201 con `{ avisos }`;
  - `PUT` de un slug inexistente → 404; válido → 200; no permite cambiar el slug;
  - invalida `/catalogo/packs`, `/catalogo/<slug>`, `/`, `/catalogo` y `/catalogo/top-ventas`;
  - `productos.ts` `POST`/`PUT` con `category: "packs"` → 400 «Los packs se crean y editan en la
    sección Packs», y `PUT` sobre un producto que ES pack → mismo 400 (foco 4).
- [ ] **Paso 2:** implementar. `esquemaPack` + `comprobarPack` contra la carta leída en el momento.
- [ ] **Paso 3:** `admin/productos.astro` filtra `category !== "packs"`; el selector de categoría
  de `AdminProductos` no ofrece «Packs». Commit.

---

### Tarea 6: La sección Packs del panel

**Files:** Create `src/pages/admin/packs.astro`, `src/islands/AdminPacks.tsx`,
`src/islands/admin-packs/EditorPack.tsx`, `src/islands/admin-packs/EditorPiezas.tsx`, y los
ayudantes puros que salgan (con pruebas). Toma como modelo de estilo y de flujo
`src/islands/AdminProductos.tsx` (lista + formulario, guardado con `fetch`, mensajes).

- [ ] **Lista:** nombre, precio, suelto, ahorro (o «sin ahorro» en tinta), personas, activo/agotado,
  y «Editar». Botón «Nuevo pack».
- [ ] **Formulario, por bloques con filete:**
  1. *El pack:* nombre, precio (euros con coma, como en Productos), descriptor, orden, activo,
     agotado, foto (mismo subidor que Productos: `/api/admin/imagen`, carpeta `productos`).
  2. *La ficha:* ocasión, personas mín./máx. y texto (se propone «<mín>–<máx> personas» y se puede
     cambiar), «para quién» (lista de frases: añadir, quitar, subir, bajar), consejo del obrador.
  3. *Qué lleva:* lista ordenada de piezas; cada una se sube, se baja o se quita.
     - Pieza fija: producto (desplegable agrupado por sección de la carta, sin packs), tamaño (solo
       si el producto tiene; sus etiquetas), título y descripción de la ficha, «lleva la foto del
       cliente» y, si la lleva, el rótulo para el obrador.
     - Hueco a elegir: título, descripción, etiqueta del desplegable, «de una sección»
       (desplegable de `secciones`) o «de una lista» (casillas con los productos), tamaño común
       opcional, y debajo, **las opciones que verá hoy el cliente** (`opcionesDeHueco`).
     - El `id` de un hueco nuevo se genera una vez (`h-` + 6 caracteres aleatorios en minúscula) y
       no cambia nunca al editar; los de los 7 packs volcados se conservan (foco 1).
  4. *Resumen vivo:* comprado suelto, ahorro, €/persona (mismas funciones que la web) y los
     errores y avisos de `comprobarPack` antes de guardar.
- [ ] **Guardar:** muestra los errores de la API junto a su pieza; con avisos, guarda y los
  enseña. Al crear, pasa a editar el pack creado. Enlace «Ver en la web».
- [ ] **Prueba en navegador** en el worktree (rama de pruebas; `lsof -ti :4321` vacío antes;
  **matar el `dev` al terminar**): crear un pack nuevo con una fija, un hueco por sección y uno de
  lista; verlo en `/catalogo/packs` y en su ficha; añadirlo al carrito y anotar el pedido (sin
  Stripe) → la fila cae en `ep-lucky-surf` y el desglose es el de la definición; editar el precio
  y quitar un hueco → la ficha cambia; un carrito con el hueco viejo se rechaza con mensaje claro.
  Capturas a 1280 y 375 px. Commit.

---

### Tarea 7: Menú lateral del panel

**Files:** Modify `src/layouts/AdminLayout.astro`.

- [ ] Desde `md`: columna fija a la izquierda (ancho ~13rem, filete de 1 px a la derecha, fondo
  leche) con «Panel», las secciones —Resumen, Producción, Pedidos, Productos, **Packs**, Clientes,
  Este mes— una por línea, la actual en latte con `aria-current="page"`, y «Salir» al pie. El
  contenido ocupa el resto, con el título arriba como hoy. Por debajo de `md`: la fila de hoy, con
  desplazamiento horizontal (`overflow-x: auto`) en vez de saltar de línea. `nav` con
  `aria-label="Secciones del panel"`.
- [ ] Revisar a 1280 y 375 px las siete páginas del panel (tablas anchas de Pedidos y Producción
  incluidas: que no desborden la página). Commit.

---

### Tarea 8: Revisión final de la rama

- [ ] Revisión independiente de toda la rama con el Foco de revisión como lista obligatoria.
  Especial atención a: los 7 packs de hoy siguen idénticos; ningún camino deja un pack sin
  definición; la invalidación cubre packs creados desde el panel.

### Tarea 9: A producción

Orden y comprobaciones (el código nuevo lee las tablas nuevas; el viejo no las usa):

1. [ ] Comprobaciones de solo lectura en producción:
   `select slug, category, activo, agotado, destacado, temporada, especialidad from productos where category='packs'`
   → exactamente los 7 slugs de `scripts/packs-iniciales.json`; `select to_regclass('pack_piezas')` → null;
   guardar el HTML (`curl -sL`) de `/catalogo/packs` y de las 7 fichas.
2. [ ] Migración 013 con el OK de Oscar: `node --env-file=<scratchpad>/prod.env scripts/migrar.mjs`
   (nunca `pnpm db:migrar`). El código desplegado ignora las tablas nuevas. OBLIGATORIO antes del
   despliegue: con el código nuevo y sin la tabla, TODOS los checkouts dan 500.
3. [ ] `volcar-packs.mjs` en seco (7 «se inserta», sin problemas), luego
   `--aplicar --copia=<fichero nuevo>` → «Relectura OK». Desde aquí hasta el despliegue,
   congelación: nadie crea ni cambia de categoría un pack en Productos.
4. [ ] Push a `main` y despliegue esperado por SHA.
5. [ ] Verificar: diff del texto visible de las 8 páginas contra el paso 1, y verlas en un
   navegador. Checkout sin crear pedido: `POST /api/checkout` con un carrito de pack válido y una
   fecha PASADA → «La fecha elegida no está disponible» (prueba que se valoró el pack). Un 500 o
   «no está disponible ahora mismo» = parar.
6. [ ] Panel con Oscar: `/admin/packs`, cambiar el orden de un pack y deshacerlo.
7. [ ] Marcha atrás: rollback instantáneo de Vercel; nunca borrar las tablas. Las ediciones de
   composición hechas en el panel no se ven mientras esté el código viejo.

Si se despliega sin el volcado: los packs desaparecen (404 cacheable) y el checkout los rechaza;
se arregla corriendo el paso 3 con `VERCEL_BYPASS_TOKEN` y `PUBLIC_SITE_URL` en el prod.env.
