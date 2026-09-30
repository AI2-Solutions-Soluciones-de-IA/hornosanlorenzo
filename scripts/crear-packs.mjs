/**
 * Crea las siete fichas de los packs (Packs_San_Lorenzo_FINALES.pptx,
 * septiembre de 2026) en la tabla `productos`.
 *
 * Un pack es un producto más, en la categoría y sección `packs`: lo que lleva
 * dentro vive en `pack_definiciones`/`pack_piezas` (`scripts/volcar-packs.mjs`),
 * no aquí. Este script solo da de alta la
 * ficha (nombre, precio, descriptor) para que salga en el catálogo y el panel
 * pueda gestionarla.
 *
 * Si el slug ya existe NO lo toca: a partir de crearlo, el precio y el texto
 * los manda el panel, y volver a ejecutar el script no puede pisarlos.
 *
 *   node --env-file=.env scripts/crear-packs.mjs                       # enseña qué crearía
 *   node --env-file=.env scripts/crear-packs.mjs --aplicar --copia=<f> # lo crea
 *   ... --sin-invalidar                                                # no toca la caché (pruebas)
 *
 * Antes de aplicar guarda en `--copia=<fichero>` (obligatorio con --aplicar)
 * qué packs ya existían. Todo va en una transacción.
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

// `orden` es la posición en la carta de packs (1…7). El precio es el del
// pptx, en céntimos. Los descriptores llevan solo arreglos tipográficos.
const PACKS = [
  {
    slug: "pack-cumpleanos",
    name: "Pack Cumpleaños",
    priceCents: 7100,
    descriptor:
      "El cumpleaños resuelto: empanada, bollos preñaos y plancha decorada con tu foto. Tú solo pones las velas.",
  },
  {
    slug: "pack-merienda-infantil",
    name: "Pack Merienda Infantil",
    priceCents: 4300,
    descriptor:
      "La merienda que arrasa entre los peques: quiche, mini croissants de jamón york y queso, y una plancha de Oreo. Listo para celebrar.",
  },
  {
    slug: "pack-futbolero",
    name: "Pack Futbolero",
    priceCents: 5800,
    descriptor:
      "Que el partido te pille sentado: empanada, salados variados y el dulce del descanso para toda la afición.",
  },
  {
    slug: "pack-brunch-en-casa",
    name: "Pack Brunch en casa",
    priceCents: 5800,
    descriptor:
      "Un brunch de obrador en tu mesa: la suprema de salmón, especialidad de la casa, preñaos y dulces recién hechos.",
  },
  {
    slug: "pack-gran-celebracion",
    name: "Pack Gran Celebración",
    priceCents: 15900,
    descriptor:
      "¿Mucha gente celebrando? Tenemos el pack perfecto: de la empanada al postre, con la variedad y la calidad del obrador.",
  },
  {
    slug: "pack-evento-especial",
    name: "Pack Evento Especial",
    priceCents: 5700,
    descriptor:
      "Para quedar de lujo con pocos y con mucho estilo: tarta casera de salmón y gambas, canapés variados y los petisús de siempre para una ocasión especial.",
  },
  {
    slug: "pack-reunion-oficina",
    name: "Pack Reunión en Oficina",
    priceCents: 4100,
    // La diapositiva promete «antes de las 10:30», una franja de reparto que
    // hoy no existe en el checkout: se recupera la frase cuando entre (ver
    // tasks/todo.md).
    descriptor:
      "La reunión resuelta: salado serio, croissants rellenos y el dulce para el café.",
  },
];

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
const { rows: existentes } = await c.query(
  `select * from productos where slug = any($1)`,
  [slugs],
);

const aCrear = [];
PACKS.forEach((p, i) => {
  if (existentes.some((e) => e.slug === p.slug)) {
    console.log(
      `${p.slug}: ya existe, no se toca: el precio lo manda el panel`,
    );
    return;
  }
  console.log(
    `${p.slug}: se crea «${p.name}» a ${(p.priceCents / 100).toFixed(2)} € (orden ${i + 1})`,
  );
  aCrear.push({ ...p, orden: i + 1 });
});

console.log(`\n${aCrear.length} fichas por crear, ${existentes.length} ya existían.`);

if (!aplicar) {
  console.log("Sin --aplicar: no se ha tocado nada.");
  await c.end();
  process.exit(0);
}

writeFileSync(copia, JSON.stringify({ existentes }, null, 2));
console.log(`Copia de cómo estaba: ${copia}`);

try {
  await c.query("begin");
  for (const p of aCrear) {
    await c.query(
      `insert into productos
         (slug, name, category, seccion, price_cents, consultar, unit,
          short_description, cuerpo, allergens, destacado, temporada, orden,
          image_url, image_alt, image_width, image_height, activo, agotado,
          especialidad)
       values ($1,$2,'packs','packs',$3,false,null,$4,'','{}',false,false,$5,
               null,null,null,null,true,false,null)`,
      [p.slug, p.name, p.priceCents, p.descriptor, p.orden],
    );
  }
  await c.query("commit");
  console.log("Aplicado.");
} catch (e) {
  await c.query("rollback");
  console.error("Falló y no se ha aplicado nada:", e.message);
  process.exit(1);
}
await c.end();

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
