/**
 * Vuelca a `pack_definiciones` y `pack_piezas` la composición de los siete
 * packs que hasta la Tarea 4 vivía en `src/data/packs.ts`. Los datos salen de
 * `scripts/packs-iniciales.json` (generado desde ese array antes de
 * borrarlo; `src/data/packs.test.ts` sigue fijando con él las cifras del pptx).
 *
 * Las fichas (`productos`, categoría `packs`) tienen que existir ya: se crean
 * con `scripts/crear-packs.mjs`. Si falta alguna, o no es un pack, no se
 * aplica nada. Si un pack ya tiene definición NO se toca: desde entonces la
 * manda el panel y volver a ejecutar el script no puede pisarla.
 *
 *   node --env-file=.env scripts/volcar-packs.mjs                       # enseña qué haría (solo lee)
 *   node --env-file=.env scripts/volcar-packs.mjs --aplicar --copia=<f> # lo inserta
 *   ... --sin-invalidar                                                 # no toca la caché (pruebas)
 *
 * Con --aplicar guarda en `--copia=<fichero>` (obligatorio) las definiciones
 * que ya había. Todo va en una transacción. Al final relee las definiciones
 * con la misma consulta que `definicionesPorSlugs` y las compara con el JSON:
 * si algo no cuadra lo dice y sale con error.
 */
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

const PACKS = JSON.parse(
  readFileSync(new URL("./packs-iniciales.json", import.meta.url), "utf8"),
);

// Las mismas que `RUTAS_CATALOGO` de `src/lib/cache.ts`: un script `.mjs` no
// puede importar ese módulo TypeScript.
const RUTAS_CATALOGO = [
  "/",
  "/catalogo",
  "/catalogo/dulce",
  "/catalogo/salado",
  "/catalogo/top-ventas",
  "/sitemap-contenido.xml",
];

// La misma consulta de lectura que `SELECT` en `src/lib/db/packs.ts`.
const SELECT = `
  select p.slug, d.ocasion, d.personas_min, d.personas_max, d.personas_texto,
         d.para_quien, d.consejo,
         coalesce((
           select json_agg(json_build_object(
             'tipo', x.tipo, 'titulo', x.titulo, 'descripcion', x.descripcion,
             'variant_id', x.variant_id, 'slug', x.slug,
             'requiere_foto', x.requiere_foto, 'rotulo', x.rotulo,
             'hueco_id', x.hueco_id, 'etiqueta', x.etiqueta,
             'seccion', x.seccion, 'slugs', x.slugs
           ) order by x.orden)
           from pack_piezas x where x.producto_id = d.producto_id
         ), '[]'::json) as piezas
    from pack_definiciones d
    join productos p on p.id = d.producto_id`;

// Copia de `aPieza` / `aDefinicion` de `src/lib/db/packs.ts`.
function aPieza(f) {
  const variante = f.variant_id !== null ? { variantId: f.variant_id } : {};
  if (f.tipo === "fija") {
    return {
      tipo: "fija",
      slug: f.slug,
      ...variante,
      titulo: f.titulo,
      descripcion: f.descripcion,
      ...(f.requiere_foto ? { requiereFoto: true } : {}),
      ...(f.rotulo !== null ? { rotulo: f.rotulo } : {}),
    };
  }
  return {
    tipo: "eleccion",
    id: f.hueco_id,
    titulo: f.titulo,
    descripcion: f.descripcion,
    etiqueta: f.etiqueta,
    ...variante,
    ...(f.seccion !== null ? { seccion: f.seccion } : { slugs: f.slugs }),
  };
}
function aDefinicion(f) {
  return {
    slug: f.slug,
    ocasion: f.ocasion,
    personas: { min: f.personas_min, max: f.personas_max, texto: f.personas_texto },
    paraQuien: f.para_quien,
    ...(f.consejo !== null ? { consejo: f.consejo } : {}),
    piezas: f.piezas.map(aPieza),
  };
}

// Mismo mapeo que `guardaDefinicion` de `src/lib/db/packs.ts` (sin el
// `on conflict`: aquí solo se inserta lo que aún no existe).
async function insertaDefinicion(c, productoId, def) {
  await c.query(
    `insert into pack_definiciones
       (producto_id, ocasion, personas_min, personas_max, personas_texto,
        para_quien, consejo)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      productoId,
      def.ocasion,
      def.personas.min,
      def.personas.max,
      def.personas.texto,
      [...def.paraQuien],
      def.consejo ?? null,
    ],
  );
  let orden = 0;
  for (const p of def.piezas) {
    orden += 1;
    const fija = p.tipo === "fija";
    await c.query(
      `insert into pack_piezas
         (producto_id, orden, tipo, titulo, descripcion, variant_id,
          slug, requiere_foto, rotulo, hueco_id, etiqueta, seccion, slugs)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        productoId,
        orden,
        p.tipo,
        p.titulo,
        p.descripcion,
        p.variantId ?? null,
        fija ? p.slug : null,
        fija ? (p.requiereFoto ?? false) : false,
        fija ? (p.rotulo ?? null) : null,
        fija ? null : p.id,
        fija ? null : p.etiqueta,
        !fija && "seccion" in p ? p.seccion : null,
        !fija && "slugs" in p ? [...p.slugs] : null,
      ],
    );
  }
}

const aplicar = process.argv.includes("--aplicar");
const sinInvalidar = process.argv.includes("--sin-invalidar");
const copia = process.argv.find((a) => a.startsWith("--copia="))?.slice(8);
if (aplicar && !copia) {
  console.error(
    "Con --aplicar hace falta --copia=<fichero> para guardar cómo estaba.",
  );
  process.exit(1);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const slugs = PACKS.map((p) => p.slug);
const { rows: fichas } = await c.query(
  `select id, slug, category from productos where slug = any($1)`,
  [slugs],
);
const { rows: previas } = await c.query(
  `${SELECT} where p.slug = any($1::text[]) and p.category = 'packs'`,
  [slugs],
);

// Todo se comprueba antes de escribir nada.
const problemas = [];
const aInsertar = [];
for (const p of PACKS) {
  const ficha = fichas.find((f) => f.slug === p.slug);
  if (!ficha) {
    problemas.push(`${p.slug}: no existe la ficha en productos (créala con crear-packs.mjs)`);
  } else if (ficha.category !== "packs") {
    problemas.push(`${p.slug}: existe pero su categoría es «${ficha.category}», no «packs»`);
  } else if (previas.some((d) => d.slug === p.slug)) {
    console.log(`${p.slug}: ya tiene definición, no se toca`);
  } else {
    console.log(`${p.slug}: se inserta la definición (${p.piezas.length} piezas)`);
    aInsertar.push({ def: p, id: ficha.id });
  }
}
if (problemas.length) {
  console.error("\nNo se aplica nada:\n- " + problemas.join("\n- "));
  await c.end();
  process.exit(1);
}
console.log(
  `\n${aInsertar.length} definiciones por insertar, ${PACKS.length - aInsertar.length} ya existían.`,
);

/** Relee y compara con el JSON. En seco solo puede comparar lo que ya existe. */
async function verifica(soloExistentes) {
  const { rows } = await c.query(
    `${SELECT} where p.slug = any($1::text[]) and p.category = 'packs'`,
    [slugs],
  );
  const enBD = new Map(rows.map((f) => [f.slug, aDefinicion(f)]));
  const dif = [];
  for (const p of PACKS) {
    const bd = enBD.get(p.slug);
    if (!bd) {
      if (!soloExistentes) dif.push(`${p.slug}: no tiene definición en la base de datos`);
      continue;
    }
    if (!isDeepStrictEqual(bd, p)) {
      const campos = new Set([...Object.keys(bd), ...Object.keys(p)]);
      const malos = [...campos].filter((k) => !isDeepStrictEqual(bd[k], p[k]));
      dif.push(`${p.slug}: difiere en ${malos.join(", ")}`);
    }
  }
  return dif;
}

if (!aplicar) {
  const dif = await verifica(true);
  await c.end();
  if (dif.length) {
    console.error("\nLas definiciones que ya hay NO cuadran con el JSON:\n- " + dif.join("\n- "));
    process.exit(1);
  }
  console.log("Las definiciones que ya había cuadran con el JSON.");
  console.log("Sin --aplicar: no se ha tocado nada.");
  process.exit(0);
}

writeFileSync(copia, JSON.stringify({ previas }, null, 2));
console.log(`Copia de cómo estaba: ${copia}`);

try {
  await c.query("begin");
  for (const { def, id } of aInsertar) await insertaDefinicion(c, id, def);
  await c.query("commit");
  console.log("Aplicado.");
} catch (e) {
  await c.query("rollback").catch(() => {});
  console.error("Falló y no se ha aplicado nada:", e.message);
  await c.end();
  process.exit(1);
}

const dif = await verifica(false);
await c.end();
if (dif.length) {
  console.error("\nRELECTURA: NO cuadra con el JSON:\n- " + dif.join("\n- "));
  process.exit(1);
}
console.log(`Relectura OK: las ${PACKS.length} definiciones de la base de datos son idénticas al JSON.`);

if (sinInvalidar) {
  console.log("--sin-invalidar: no se toca la caché.");
  process.exit(0);
}

// Las páginas del catálogo van por ISR: se piden de nuevo para que se vea ya.
const token = process.env.VERCEL_BYPASS_TOKEN;
// El `.env` de desarrollo apunta a localhost, donde no hay ISR: la caché que
// importa es la de producción.
const base = /localhost|127\.0\.0\.1/.test(process.env.PUBLIC_SITE_URL ?? "")
  ? "https://hornosanlorenzo.vercel.app"
  : process.env.PUBLIC_SITE_URL;
if (token && base) {
  const rutas = [
    ...RUTAS_CATALOGO,
    "/catalogo/packs",
    ...slugs.map((s) => `/catalogo/${s}`),
  ];
  const res = await Promise.all(
    rutas.map((r) =>
      fetch(new URL(r, base), {
        method: "HEAD",
        headers: { "x-prerender-revalidate": token },
      })
        .then((x) => x.status)
        .catch(() => "error"),
    ),
  );
  const malas = rutas.filter((_, i) => res[i] !== 200);
  console.log(
    `Caché: ${rutas.length - malas.length}/${rutas.length} rutas refrescadas.${malas.length ? " Fallan: " + malas.join(", ") : ""}`,
  );
} else {
  console.log(
    "Sin VERCEL_BYPASS_TOKEN o PUBLIC_SITE_URL: la caché se renovará sola.",
  );
}
