/**
 * Pone las fotos propias de los packs (carpeta «Fotos Packs», octubre de
 * 2026) como foto principal de cada uno, en lugar de la prestada de un
 * producto suelto que llevaban desde `fotos-finales-web.mjs`. Quita la marca
 * de «Foto provisional» y deja el carrusel (`fotos_extra`) como esté.
 *
 *   node --env-file=.env scripts/fotos-packs.mjs --dir=<carpeta>
 *       enseña qué cambiaría: no sube ni escribe nada
 *   node --env-file=.env scripts/fotos-packs.mjs --dir=<carpeta> --aplicar --copia=<fichero>
 *       sube las fotos y actualiza los packs
 *
 * Solo toca las columnas de la foto: la composición de los packs vive en el
 * panel (`/admin/packs`) y aquí no se mira.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { put, head, BlobNotFoundError } from "@vercel/blob";
import sharp from "sharp";

/** Pack: [fichero normalizado, texto alternativo]. */
const FOTOS = {
  "pack-cumpleanos": [
    "pack-cumpleanos.png",
    "Mesa de cumpleaños: tarta con foto personalizada, empanada y bollos preñaos",
  ],
  "pack-merienda-infantil": [
    "pack-merienda-infantil.png",
    "Mesa de merienda: plancha de Oreo, quiche y mini croissants de york y queso",
  ],
  "pack-futbolero": [
    "pack-futbolero.png",
    "Mesa para el partido: empanada, mini croissants salados y bandeja de pastelitos",
  ],
  "pack-brunch-en-casa": [
    "pack-brunch-en-casa.png",
    "Mesa de brunch: suprema de hojaldre, bollos preñaos y mini croissants dulces",
  ],
  "pack-gran-celebracion": [
    "pack-gran-celebracion.png",
    "Mesa de celebración: empanada, quiche, bollos preñaos, croissants, canapés y pastelitos",
  ],
  "pack-evento-especial": [
    "pack-envento-especial.png",
    "Mesa de evento: tarta salada de salmón y gambas, canapés y petisús",
  ],
  "pack-reunion-oficina": [
    "pack-reunion-oficina.png",
    "Mesa de reunión: empanada, mini croissants salados y tarta de chocolate",
  ],
};

/** Sin acentos, minúsculas y guiones («Pack cumpleaños.png» → `pack-cumpleanos.png`). */
function normaliza(nombre) {
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const ext = punto > 0 ? nombre.slice(punto).toLowerCase() : "";
  const limpio = base
    .normalize("NFKD")
    .replace(/[^\x00-\x7f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return limpio + ext;
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const aplicar = Boolean(args.aplicar);

if (!args.dir) {
  console.error("Falta --dir=<carpeta con las fotos>");
  process.exit(1);
}
if (aplicar && !args.copia) {
  console.error(
    "Con --aplicar hace falta --copia=<fichero> para guardar cómo estaba",
  );
  process.exit(1);
}
if (aplicar && !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    "Falta BLOB_READ_WRITE_TOKEN: sin él no se pueden subir las fotos",
  );
  process.exit(1);
}

// 1. Las fotos de la carpeta: todas con pack y todos los packs con foto.
const enCarpeta = new Map();
for (const f of await readdir(args.dir)) {
  if (/\.(jpe?g|png|webp)$/i.test(f))
    enCarpeta.set(normaliza(f), join(args.dir, f));
}
const usadas = new Set(Object.values(FOTOS).map(([f]) => f));
const faltan = [...usadas].filter((f) => !enCarpeta.has(f));
const sobran = [...enCarpeta.keys()].filter((f) => !usadas.has(f));
if (faltan.length || sobran.length) {
  if (faltan.length)
    console.error(
      "Fotos de la lista que no están en la carpeta:",
      faltan.join(", "),
    );
  if (sobran.length)
    console.error("Fotos de la carpeta sin pack asignado:", sobran.join(", "));
  process.exit(1);
}

// 2. Los packs, que existan todos.
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const slugs = Object.keys(FOTOS);
const { rows: filas } = await c.query(
  `select id, slug, name, image_url, image_alt, image_width, image_height, foto_provisional
     from productos where category = 'packs' and slug = any($1)`,
  [slugs],
);
const noExisten = slugs.filter((s) => !filas.some((f) => f.slug === s));
if (noExisten.length) {
  console.error(
    "Packs que no existen en esta base de datos:",
    noExisten.join(", "),
  );
  await c.end();
  process.exit(1);
}

const host = new URL(process.env.DATABASE_URL).hostname.split(".")[0];
console.log(`Base de datos: ${host}\n`);
for (const f of filas) {
  console.log(
    `${f.slug}  ←  ${FOTOS[f.slug][0]}   (ahora: ${f.image_url?.split("/").pop() ?? "sin foto"}${f.foto_provisional ? ", provisional" : ""})`,
  );
}

if (!aplicar) {
  console.log(
    "\nNo se ha cambiado nada. Para aplicarlo: --aplicar --copia=<fichero>",
  );
  await c.end();
  process.exit(0);
}

// 3. Subir. Nombre fijo: si ya se subió en una pasada anterior, se reutiliza.
const subidas = new Map();
for (const [slug, [f]] of Object.entries(FOTOS)) {
  const salida = await sharp(await readFile(enCarpeta.get(f)))
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  const ruta = `productos/foto-${slug}.webp`;
  let url;
  try {
    ({ url } = await head(ruta));
  } catch (e) {
    if (!(e instanceof BlobNotFoundError)) throw e;
    ({ url } = await put(ruta, salida.data, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
    }));
  }
  subidas.set(slug, {
    url,
    ancho: salida.info.width,
    alto: salida.info.height,
  });
  process.stdout.write(".");
}
console.log(`\n${subidas.size} fotos listas.`);

// 4. Escribir, con copia antes.
await writeFile(args.copia, JSON.stringify(filas, null, 2));
console.log(`Copia de cómo estaba: ${args.copia}`);
try {
  await c.query("begin");
  for (const slug of slugs) {
    const { url, ancho, alto } = subidas.get(slug);
    await c.query(
      `update productos set
         image_url = $1, image_alt = $2, image_width = $3, image_height = $4,
         foto_provisional = false, updated_at = now()
       where slug = $5 and category = 'packs'`,
      [url, FOTOS[slug][1], ancho, alto, slug],
    );
  }
  await c.query("commit");
  console.log("Aplicado.");
} catch (e) {
  await c.query("rollback");
  console.error("Falló y no se ha aplicado nada:", e.message);
  process.exit(1);
} finally {
  await c.end();
}

// 5. Las páginas del catálogo van por ISR: se piden de nuevo para que se vea ya.
const token = process.env.VERCEL_BYPASS_TOKEN;
const base = /localhost|127\.0\.0\.1/.test(process.env.PUBLIC_SITE_URL ?? "")
  ? null
  : process.env.PUBLIC_SITE_URL;
if (token && base) {
  const rutas = [
    "/",
    "/catalogo",
    "/catalogo/packs",
    "/catalogo/top-ventas",
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
    "Sin VERCEL_BYPASS_TOKEN o con PUBLIC_SITE_URL local: no se refresca la caché.",
  );
}
