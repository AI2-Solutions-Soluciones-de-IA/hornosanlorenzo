/**
 * Pone las fotos finales de la web (carpeta «Fotos finales WEB» de Drive,
 * octubre de 2026) en las fichas: la primera de cada lista como principal
 * (`image_*`) y el resto en el carrusel de la ficha (`fotos_extra`).
 *
 *   node --env-file=.env scripts/fotos-finales-web.mjs --dir=<carpeta>
 *       enseña qué cambiaría: no sube ni escribe nada
 *   node --env-file=.env scripts/fotos-finales-web.mjs --dir=<carpeta> --aplicar --copia=<fichero>
 *       sube las fotos y actualiza las fichas
 *
 * `--dir` es la carpeta descomprimida. Los nombres se comparan sin acentos,
 * sin mayúsculas y con guiones («Petisús variados 2.jpg» →
 * `petisus-variados-2.jpg`), porque el zip de Drive los trae mal codificados.
 *
 * Solo toca las fotos de las fichas de la lista: el resto se queda como
 * está. Antes de escribir guarda en `--copia` cómo estaban (obligatorio con
 * --aplicar) y todo va en una transacción. Las fotos se suben antes de la
 * transacción: si falla, quedan huérfanas en el almacén, que cuesta céntimos.
 *
 * Importa `@vercel/blob` y `sharp` directamente, como `migrar-productos.mjs`:
 * es un script de Node suelto y no resuelve el alias `~`.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";
import { put, head, BlobNotFoundError } from "@vercel/blob";
import sharp from "sharp";

/** Foto: [fichero normalizado, texto alternativo]. */
const FOTOS = {
  // Dulce · Bocados
  "surtido-de-pastelitos": [
    ["pastelitos-variados-1.jpg", "Bandeja de pastelitos variados del obrador"],
    [
      "pastelitos-variados-2.jpg",
      "Pastelitos variados de cerca: canastas, rellenos y bocados de chocolate",
    ],
  ],
  "coleccion-de-petisus": [
    [
      "petisus-variados-3.jpg",
      "Petisús variados en fila sobre una tabla de madera",
    ],
    ["petisus-variados-2.jpg", "Petisús de nata, chocolate y crema de cerca"],
  ],
  "bocados-de-nata-y-trufa": [
    ["bocaditos-nata-y-trufa-1.jpg", "Bandeja de bocaditos de nata y trufa"],
    [
      "bocaditos-nata-y-trufa-2.jpg",
      "Bocaditos rellenos de nata y de trufa de cerca",
    ],
  ],
  "trufas-del-obrador": [
    [
      "trufitas-1.png",
      "Bandeja de trufitas rebozadas en granillo de chocolate",
    ],
    ["trufitas-2.jpg", "Trufitas de chocolate de cerca"],
  ],

  // Dulce · Bizcochos
  "bizcocho-casero-de-chocolate": [
    [
      "bizcocho-de-chocolate-1.png",
      "Bizcocho casero de chocolate cubierto de virutas de chocolate",
    ],
    [
      "bizcocho-chocolate-2.jpg",
      "Detalle del bizcocho de chocolate con su cobertura de virutas",
    ],
  ],
  "bizcocho-casero-de-limon": [
    ["bizcocho-de-limon-1.png", "Bizcocho casero de limón con enrejado dorado"],
    [
      "bizcocho-de-limon-2.png",
      "Detalle del enrejado brillante del bizcocho de limón",
    ],
  ],
  "bizcocho-casero-de-zanahoria": [
    [
      "bizcocho-zanahoria-1.jpg",
      "Bizcocho casero de zanahoria espolvoreado de azúcar glas con enrejado",
    ],
    [
      "bizcocho-zanahoria-2.jpg",
      "Detalle de la miga del bizcocho de zanahoria",
    ],
  ],
  "la-bayonesa": [
    [
      "bayonesa-cabello-angel-1.png",
      "Bayonesa de hojaldre rellena de cabello de ángel",
    ],
    [
      "bayonesa-cabello-angel-2.png",
      "Corte de la bayonesa con su relleno de cabello de ángel",
    ],
  ],

  // Dulce · Las Lorenzas (mini croissants): las mismas en todos los sabores
  ...enTodas(
    [
      "mini-croissants-surtido-dulce",
      "mini-croissants-caladas",
      "mini-croissants-glaseadas",
      "mini-croissants-pico-de-chocolate",
      "mini-croissants-cebra",
      "mini-croissants-rellenas",
    ],
    [
      ["croissants-dulces-1.png", "Tabla de mini croissants dulces surtidos"],
      [
        "croissants-dulces-2.jpg",
        "Mini croissants dulces de cerca, con chocolate y azúcar glas",
      ],
    ],
  ),

  // Salado · Empanadas: no dicen el sabor, las tres en todas
  ...enTodas(
    [
      "empanada-de-bonito",
      "empanada-de-carne",
      "empanada-de-jamon-y-queso",
      "empanada-de-pollo-y-datiles",
      "empanada-de-chistorra-bacon-y-queso",
      "empanada-de-picadillo-adobado",
    ],
    [
      ["empanada-1.png", "Empanada de hojaldre entera sobre tabla de madera"],
      ["empanada-2.jpg", "Corte de la empanada con su relleno"],
      ["empanada-3.jpg", "Porción de empanada de hojaldre de lado"],
    ],
  ),

  // Salado · Supremas
  "suprema-salmon-cebolla-caramelizada-y-queso-crema": [
    [
      "suprema-de-salmon-con-cebolla-caramelizada-y-philadelphia-1.png",
      "Suprema de salmón, cebolla caramelizada y queso crema, con una porción cortada",
    ],
  ],

  // Salado · Quiches
  "quiche-champinon-y-jamon-serrano": [
    [
      "quiche-champinon-y-jamon-serrano-1.jpg",
      "Quiche de champiñón y jamón serrano entera",
    ],
    [
      "quiche-champinon-y-jamon-serrano-2.jpg",
      "Detalle de la quiche con champiñón y jamón serrano",
    ],
  ],
  "quiche-puerros-cebolla-y-bacon": [
    [
      "quiche-de-puerros-cebolla-y-bacon-1.png",
      "Quiche de puerros, cebolla y bacon entera",
    ],
    [
      "quiche-puerros-cebolla-y-bacon-2.jpg",
      "Detalle de la quiche con taquitos de bacon",
    ],
  ],

  // Salado · Tartas saladas
  "tarta-salada-la-vegetal": [
    [
      "tarta-vegetal-1.png",
      "Tarta salada vegetal decorada con lechuga, salmón y gambas",
    ],
    ["tarta-vegetal-2.jpg", "Detalle de la tarta vegetal con lechuga y salmón"],
  ],
  "tarta-salada-ensaladilla-rusa": [
    [
      "tarta-de-ensaladilla-rusa-1.png",
      "Tarta de ensaladilla rusa decorada con espárragos y pimiento rojo",
    ],
    ["tarta-ensaladilla-rusa-2.jpg", "Detalle de la tarta de ensaladilla rusa"],
  ],

  // Salado · Para compartir
  "bocados-de-coctel": [
    [
      "mini-canapes-variados-1.jpg",
      "Mini canapés variados sobre una tabla de madera",
    ],
    ["mini-canapes-variados-2.jpg", "Mini canapés de cerca"],
  ],
  "hojaldritos-de-coctel": [
    [
      "hojaldres-variados-2.jpg",
      "Hojaldritos de cóctel variados sobre una tabla",
    ],
    ["hojaldres-variados-3.jpg", "Hojaldritos de cóctel con sésamo de cerca"],
  ],
  "los-prenaos-de-la-casa": [
    ["bollos-prenaos-de-chorizo-1.jpg", "Bandeja de bollos preñaos de chorizo"],
    ["bollos-prenaos-de-chorizo-2.jpg", "Bollos preñaos de chorizo de cerca"],
  ],

  // Salado · Las Lorenzas: las mismas en todos los sabores
  ...enTodas(
    [
      "mini-croissants-surtido-salado",
      "mini-croissants-york-y-queso",
      "mini-croissants-serrano-y-tomate",
      "mini-croissants-crema-de-sobrasada",
      "mini-croissants-coctel-de-cangrejo",
      "mini-croissants-bonito-con-mayonesa",
      "mini-croissants-salmon-y-queso-crema",
    ],
    [
      ["croissants-salados-1.png", "Tabla de mini croissants salados rellenos"],
      [
        "croissants-salados-2.jpg",
        "Mini croissant salado relleno de tomate, de cerca",
      ],
    ],
  ),

  // Dulce · Tartas del obrador
  "la-sacher-de-frambuesa": [
    [
      "tarta-sacher-chocolate-y-frambuesa-1.jpg",
      "Tarta Sacher de chocolate y frambuesa entera",
    ],
    [
      "tarta-sacher-chocolate-y-frambuesa-2.jpg",
      "Detalle de la cobertura de chocolate de la Sacher",
    ],
  ],
  "bombon-ivoire": [
    [
      "tarta-bombon-de-chocolate-blanco-1.png",
      "Tarta bombón de chocolate blanco entera",
    ],
    [
      "tarta-de-bombon-de-chocolate-blanco-2.png",
      "Detalle de la tarta bombón de chocolate blanco con granillo de chocolate",
    ],
  ],
  "la-san-marcos": [
    [
      "tarta-san-marcos-1.png",
      "Tarta San Marcos entera con yema tostada y borde de nata",
    ],
    [
      "tarta-san-marcos-2.png",
      "Detalle de la yema tostada y la nata de la San Marcos",
    ],
  ],
  "corona-de-fresas": [
    [
      "tarta-fresas-naturales-y-nata-1.png",
      "Tarta de nata coronada de fresas naturales",
    ],
    [
      "tarta-fresas-naturales-y-nata-2.jpg",
      "Fresas naturales sobre la nata, de cerca",
    ],
  ],
  "corona-de-frutas": [
    [
      "tarta-de-frutas-y-nata-1.png",
      "Tarta de nata con frutas naturales variadas",
    ],
  ],

  // Dulce · Cremosas
  "la-santiago": [
    [
      "tarta-de-santiago-con-almendras1.png",
      "Tarta de Santiago con la cruz dibujada en azúcar glas",
    ],
    [
      "tarta-de-santiago-con-almendras-2.jpg",
      "Porción de tarta de Santiago con almendra",
    ],
  ],
  "la-fina-de-manzana": [
    ["tarta-de-manzana-y-crema-1.png", "Tarta de manzana y crema entera"],
    [
      "tarta-manzana-y-crema-2.jpg",
      "Láminas de manzana sobre la crema, de cerca",
    ],
  ],
  "cremoso-de-queso": [
    ["tarta-flan-de-queso-1.png", "Tarta flan de queso con caramelo"],
    ["tarta-flan-de-queso-2.png", "Detalle del flan de queso con su caramelo"],
  ],
  "arroz-con-leche-del-obrador": [
    [
      "tarta-de-arroz-con-leche-1.png",
      "Tarta de arroz con leche con la superficie tostada",
    ],
    [
      "tarta-de-arroz-con-leche-2.png",
      "Detalle de la tarta de arroz con leche",
    ],
  ],
  "la-mousse-de-chocolate": [
    [
      "mousse-de-chocolate-1.png",
      "Tarta mousse de chocolate decorada con rosetones de chocolate",
    ],
  ],

  // Dulce · Para todos
  "tarta-de-chocolate-y-trufa-sin-alergenos": [
    [
      "tarta-de-chocolate-y-trufa-1.png",
      "Tarta de chocolate y trufa con cobertura brillante",
    ],
    [
      "tarta-de-chocolate-y-trufa-2.png",
      "Detalle de la cobertura de chocolate y el granillo del borde",
    ],
  ],

  // Dulce · Planchas
  "plancha-chocolate-y-trufa": [
    ["plancha-de-chocolate-y-trufa-1.png", "Plancha de chocolate y trufa"],
    [
      "plancha-de-chocolate-y-trufa-2.png",
      "Corte de la plancha de chocolate y trufa",
    ],
  ],
  "plancha-oreo": [
    ["plancha-oreo-1.png", "Plancha de Oreo"],
    ["plancha-oreo-2.png", "Corte de la plancha de Oreo"],
  ],
  "plancha-fresa-y-nata": [
    ["plancha-fresa-nata-1.png", "Plancha de fresa y nata"],
    ["plancha-fresa-nata-2.png", "Corte de la plancha de fresa y nata"],
  ],

  // Dulce · Colección especial
  "plancha-milhojas-de-nata-y-crema": [
    ["plancha-de-milhojas-y-nata-1.png", "Plancha de milhojas de nata y crema"],
    [
      "plancha-de-milhojas-y-nata-2.png",
      "Capas de hojaldre, nata y crema de la milhojas",
    ],
  ],
  "plancha-manzana-y-crema": [
    ["plancha-manzana-y-crema-1.png", "Plancha de manzana y crema"],
    [
      "plancha-manzana-y-crema-2.png",
      "Láminas de manzana de la plancha, de cerca",
    ],
  ],
  "plancha-carrot-cake": [
    ["plancha-de-zanahoria-1.png", "Plancha de zanahoria"],
    ["plancha-de-zanahoria-2.png", "Capas de la plancha de zanahoria"],
  ],
  "plancha-red-velvet": [
    ["plancha-red-velvet-1.png", "Plancha Red Velvet"],
    ["plancha-red-velvet-2.png", "Detalle de la plancha Red Velvet"],
  ],
  "plancha-tiramisu": [
    ["plancha-tiramisu-1.png", "Plancha de tiramisú"],
    ["plancha-tiramisu-2.jpg", "Corte de la plancha de tiramisú"],
  ],
  "plancha-dulce-de-leche": [
    ["plancha-de-dulce-de-leche-1.png", "Plancha de dulce de leche"],
    [
      "plancha-de-dulce-de-leche-2.png",
      "Corte de la plancha de dulce de leche",
    ],
  ],

  // Dulce · Brazos
  "brazo-el-segoviano": [
    [
      "tarta-de-ponche-segoviano-1.png",
      "Ponche segoviano con su enrejado de azúcar tostado",
    ],
    ["tarta-de-ponche-segoviano-2.png", "Detalle del ponche segoviano"],
  ],
  "brazo-selva-negra": [
    ["brazo-selva-negra-1.png", "Brazo Selva Negra"],
    [
      "brazo-selva-negra-2.jpg",
      "Corte del brazo Selva Negra con nata y virutas de chocolate",
    ],
  ],
  "brazo-el-clasico": [
    ["brazo-de-gitano-1.png", "Brazo de gitano"],
    ["brazo-de-gitano-2.png", "Espiral del brazo de gitano, de cerca"],
  ],
  "brazo-frutas-variadas": [
    ["brazo-de-frutas-variadas-1.png", "Brazo de frutas variadas"],
    ["brazo-de-frutas-variadas-2.png", "Frutas sobre el brazo, de cerca"],
  ],

  // Dulce · Detalles de celebración
  "tarta-retrato": [
    [
      "tarta-con-foto-personalizada-1.png",
      "Tarta rectangular con una fotografía personalizada impresa",
    ],
  ],
  "plancha-de-celebracion-tematica": [
    [
      "tarta-futbol.png",
      "Plancha decorada como un campo de fútbol con porterías y jugadores",
    ],
  ],
};

/** Fotos que vienen en la carpeta y no van a ninguna ficha, a propósito. */
const SIN_USAR = ["tarta-de-comunion-personalizada.png"];

function enTodas(slugs, fotos) {
  return Object.fromEntries(slugs.map((s) => [s, fotos]));
}

/** Igual que la extracción del zip: sin acentos, minúsculas y guiones. */
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

// 1. Las fotos de la carpeta, por nombre normalizado.
const enCarpeta = new Map();
for (const f of await readdir(args.dir)) {
  if (/\.(jpe?g|png|webp)$/i.test(f))
    enCarpeta.set(normaliza(f), join(args.dir, f));
}

const usadas = new Set(Object.values(FOTOS).flatMap((l) => l.map(([f]) => f)));
const faltan = [...usadas].filter((f) => !enCarpeta.has(f));
const sobran = [...enCarpeta.keys()].filter(
  (f) => !usadas.has(f) && !SIN_USAR.includes(f),
);
if (faltan.length) {
  console.error(
    "Fotos de la lista que no están en la carpeta:",
    faltan.join(", "),
  );
  process.exit(1);
}
if (sobran.length) {
  console.error("Fotos de la carpeta sin ficha asignada:", sobran.join(", "));
  process.exit(1);
}

// 2. Las fichas, que existan todas.
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const slugs = Object.keys(FOTOS);
const { rows: filas } = await c.query(
  `select id, slug, name, image_url, image_alt, image_width, image_height, fotos_extra
     from productos where slug = any($1)`,
  [slugs],
);
const porSlug = new Map(filas.map((f) => [f.slug, f]));
const noExisten = slugs.filter((s) => !porSlug.has(s));
if (noExisten.length) {
  console.error(
    "Fichas que no existen en esta base de datos:",
    noExisten.join(", "),
  );
  await c.end();
  process.exit(1);
}

const host = new URL(process.env.DATABASE_URL).hostname.split(".")[0];
console.log(`Base de datos: ${host}`);
console.log(
  `${usadas.size} fotos para ${slugs.length} fichas (${SIN_USAR.length} sin usar: ${SIN_USAR.join(", ")}).\n`,
);
for (const s of slugs) {
  const [principal, ...resto] = FOTOS[s];
  console.log(
    `${s}  ←  ${principal[0]}${resto.length ? `  + carrusel: ${resto.map(([f]) => f).join(", ")}` : ""}`,
  );
}

if (!aplicar) {
  console.log(
    "\nNo se ha cambiado nada. Para aplicarlo: --aplicar --copia=<fichero>",
  );
  await c.end();
  process.exit(0);
}

// 3. Subir cada foto una vez (las empanadas y las Lorenzas comparten). El
// nombre es fijo: si ya se subió en una pasada anterior (la de la base de
// pruebas), se reutiliza en vez de duplicarla en el almacén.
const subidas = new Map();
let reutilizadas = 0;
for (const f of usadas) {
  const salida = await sharp(await readFile(enCarpeta.get(f)))
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  const ruta = `productos/final-web-${f.replace(/\.[a-z0-9]+$/, "")}.webp`;
  let url;
  try {
    ({ url } = await head(ruta));
    reutilizadas++;
  } catch (e) {
    if (!(e instanceof BlobNotFoundError)) throw e;
    ({ url } = await put(ruta, salida.data, {
      access: "public",
      contentType: "image/webp",
      addRandomSuffix: false,
    }));
  }
  subidas.set(f, { url, ancho: salida.info.width, alto: salida.info.height });
  process.stdout.write(".");
}
console.log(`\n${subidas.size} fotos listas (${reutilizadas} ya estaban subidas).`);

// 4. Escribir, con copia antes.
await writeFile(args.copia, JSON.stringify(filas, null, 2));
console.log(`Copia de cómo estaba: ${args.copia}`);

try {
  await c.query("begin");
  for (const s of slugs) {
    const [principal, ...resto] = FOTOS[s].map(([f, alt]) => ({
      ...subidas.get(f),
      alt,
    }));
    await c.query(
      `update productos set
         image_url = $1, image_alt = $2, image_width = $3, image_height = $4,
         fotos_extra = $5, updated_at = now()
       where slug = $6`,
      [
        principal.url,
        principal.alt,
        principal.ancho,
        principal.alto,
        JSON.stringify(resto),
        s,
      ],
    );
  }
  await c.query("commit");
  console.log("Aplicado.");
} catch (e) {
  await c.query("rollback");
  console.error("Falló y no se ha aplicado nada:", e.message);
  process.exit(1);
}

const { rows: packs } = await c.query(
  "select slug from productos where category = 'packs'",
);
await c.end();

// 5. Las páginas del catálogo van por ISR: se piden de nuevo para que se vea ya.
const token = process.env.VERCEL_BYPASS_TOKEN;
const base = /localhost|127\.0\.0\.1/.test(process.env.PUBLIC_SITE_URL ?? "")
  ? null
  : process.env.PUBLIC_SITE_URL;
if (token && base) {
  const rutas = [
    "/",
    "/catalogo",
    "/catalogo/dulce",
    "/catalogo/salado",
    "/catalogo/top-ventas",
    "/catalogo/packs",
    "/sitemap-contenido.xml",
    ...slugs.map((s) => `/catalogo/${s}`),
    ...packs.map((p) => `/catalogo/${p.slug}`),
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
