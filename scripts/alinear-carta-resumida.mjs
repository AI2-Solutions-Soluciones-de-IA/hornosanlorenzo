/**
 * Alinea los nombres de `productos` con la «Carta de precios resumida
 * versión final» (pptx, octubre de 2026). Manda la carta sobre la web
 * (Oscar, 11-10-2026).
 *
 * Cambia nombres y el precio de la tarta con foto. NO toca slugs (son las
 * URL de las fichas y la referencia de pedidos y packs), ni descripciones,
 * ni el orden.
 *
 *   node --env-file=.env scripts/alinear-carta-resumida.mjs            # enseña qué cambiaría
 *   node --env-file=.env scripts/alinear-carta-resumida.mjs --aplicar --copia=<fichero>
 *
 * Con --aplicar guarda antes una copia de las filas afectadas. Todo va en
 * una transacción: o entra la carta entera o no entra nada.
 */
import pg from "pg";
import { writeFileSync } from "node:fs";

/** slug → nombre de la carta. */
const NOMBRES = {
  // Tartas tradicionales de bizcocho
  "bombon-noir": "Bombón Chocolate Negro",
  "bombon-ivoire": "Bombón Chocolate Blanco",
  "la-san-marcos": "San Marcos, Nata y Trufa",
  "la-nupcial": "Nupcial",

  // Mousses y tartas dulces
  "arroz-con-leche-del-obrador": "Arroz con Leche",

  // Recomendaciones (tal cual la carta, «Pettisues» incluido)
  "trufas-del-obrador": "Trufitas",
  "bocados-de-nata-y-trufa": "Bocaditos Nata y Trufa",
  "coleccion-de-petisus": "Pettisues Variados",
  "surtido-de-pastelitos": "Pastelitos Variados",

  // Decoraciones y sin alérgenos
  "tarta-retrato": "Fotos Personalizadas",
  "tarta-de-chocolate-y-trufa-sin-alergenos":
    "Tarta Chocolate y Trufa · 6 rac.",

  // Planchas «San Lorenzo»: «y», no «&»
  "plancha-fresa-y-nata": "Fresa y Nata",
  "plancha-yema-y-nata": "Yema y Nata",
  "plancha-nata-y-trufa": "Nata y Trufa",
  "plancha-chocolate-y-nata": "Chocolate y Nata",
  "plancha-chocolate-y-trufa": "Chocolate y Trufa",
  "plancha-yogur-y-limon": "Yogurt Limón",

  // Planchas especiales
  "plancha-carrot-cake": "Zanahoria",
  "plancha-milhojas-de-nata-y-crema": "Milhoja Nata y Crema",

  // Brazos y mini brazos
  "brazo-tiramisu-y-mascarpone": "Tiramisú y Queso Mascarpone",
  "brazo-milhojas-de-nata-y-crema": "Milhoja Nata y Crema",
  "brazo-milhojas-de-nata-crema-y-frambuesa": "Milhoja Nata, Crema y Frambuesa",

  // Empanadas de hojaldre
  "empanada-de-bonito": "Bonito",
  "empanada-de-carne": "Carne",
  "empanada-de-jamon-y-queso": "Jamón y Queso",
  "empanada-de-pollo-y-datiles": "Pollo y Dátiles",
  "empanada-de-chistorra-bacon-y-queso": "Chistorra, Bacon y Queso",
  "empanada-de-picadillo-adobado": "Zorza (Picadillo de chorizo)",

  // Supremas de hojaldre
  "suprema-salmon-cebolla-caramelizada-y-queso-crema":
    "Salmón con Cebolla Caramelizada y Philadelphia",

  // Especialidades
  "bocados-de-coctel": "Mini Canapés Variados · 34 ud",
  "hojaldritos-de-coctel": "Hojaldres Variados",
  "los-prenaos-de-la-casa": "Bollos Preñaos de Chorizo",

  // Tartas saladas
  "tarta-salada-la-vegetal": "Vegetal",
  "tarta-salada-ensaladilla-rusa": "Ensaladilla Rusa",
  "tarta-salada-salmon-y-gambas": "Salmón y Gambas",

  // Bizcochos caseros
  "la-bayonesa": "Bayonesa de Cabello de Ángel",

  // Mini croissants dulces
  "mini-croissants-glaseadas": "Glaseados",
  "mini-croissants-rellenas": "Rellenos de Crema, Chocolate o Dulce de Leche",
  "mini-croissants-surtido-dulce": "Variados · 24 ud",

  // Mini croissants salados
  "mini-croissants-york-y-queso": "York y Queso",
  "mini-croissants-serrano-y-tomate": "Serrano y Tomate",
  "mini-croissants-crema-de-sobrasada": "Crema de Sobrasada",
  "mini-croissants-coctel-de-cangrejo": "Cangrejo con Salsa Rosa",
  "mini-croissants-bonito-con-mayonesa": "Bonito con Mayonesa",
  "mini-croissants-salmon-y-queso-crema": "Salmón y Queso Crema",
  "mini-croissants-surtido-salado": "Variados",
};

/**
 * Suplemento de la foto: la carta final lo da Pequeña 6 €, Mediana 10 €,
 * Grande 15 €. Es lo contrario de lo que aplicó `actualizar-carta-final.mjs`
 * el 26-9-2026 con la carta de septiembre; manda esta.
 */
const PRECIOS = {
  "tarta-retrato": { pequena: 600, mediana: 1000, grande: 1500 },
};

const aplicar = process.argv.includes("--aplicar");
const copia = process.argv.find((a) => a.startsWith("--copia="))?.slice(8);
if (aplicar && !copia) {
  console.error(
    "Con --aplicar hace falta --copia=<fichero> para guardar cómo estaba.",
  );
  process.exit(1);
}

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

const slugs = [...new Set([...Object.keys(NOMBRES), ...Object.keys(PRECIOS)])];
const { rows: filas } = await c.query(
  `select id, slug, name from productos where slug = any($1)`,
  [slugs],
);
const { rows: vars } = await c.query(
  `select v.producto_id, v.variant_id, v.label, v.price_cents from variantes v
     join productos p on p.id = v.producto_id where p.slug = any($1)`,
  [slugs],
);

const faltan = slugs.filter((s) => !filas.some((f) => f.slug === s));
if (faltan.length) {
  console.error("No existen en la base:", faltan.join(", "));
  await c.end();
  process.exit(1);
}

const sentencias = [];
for (const f of filas) {
  const nombre = NOMBRES[f.slug];
  if (nombre !== undefined && nombre !== f.name) {
    console.log(`${f.slug}: «${f.name}» → «${nombre}»`);
    sentencias.push([
      `update productos set name = $1, updated_at = now() where id = $2`,
      [nombre, f.id],
    ]);
  }
  for (const [variantId, cents] of Object.entries(PRECIOS[f.slug] ?? {})) {
    const v = vars.find(
      (x) => x.producto_id === f.id && x.variant_id === variantId,
    );
    if (!v) {
      console.error(`${f.slug}: no tiene la variante «${variantId}»`);
      await c.end();
      process.exit(1);
    }
    if (v.price_cents !== cents) {
      console.log(
        `${f.slug} · ${v.label}: ${v.price_cents} → ${cents} céntimos`,
      );
      sentencias.push([
        `update variantes set price_cents = $1 where producto_id = $2 and variant_id = $3`,
        [cents, f.id, variantId],
      ]);
    }
  }
}

console.log(`\n${sentencias.length} cambios.`);
if (!aplicar || sentencias.length === 0) {
  if (!aplicar)
    console.log("Nada aplicado: repite con --aplicar --copia=<fichero>.");
  await c.end();
  process.exit(0);
}

writeFileSync(
  copia,
  JSON.stringify({ productos: filas, variantes: vars }, null, 2),
);
console.log(`Copia de cómo estaba: ${copia}`);

try {
  await c.query("begin");
  for (const [sql, params] of sentencias) await c.query(sql, params);
  await c.query("commit");
  console.log("Aplicado.");
} catch (e) {
  await c.query("rollback");
  console.error("Falló y no se ha aplicado nada:", e.message);
  await c.end();
  process.exit(1);
}

// Los packs enseñan los nombres de lo que llevan: también se refrescan.
const { rows: todos } = await c.query(
  `select slug from productos where activo`,
);
await c.end();

// Las páginas del catálogo van por ISR: se piden de nuevo para que se vea ya.
const token = process.env.VERCEL_BYPASS_TOKEN;
const base = /localhost|127\.0\.0\.1/.test(process.env.PUBLIC_SITE_URL ?? "")
  ? "https://hornosanlorenzo.vercel.app"
  : process.env.PUBLIC_SITE_URL;
if (token && base) {
  const rutas = [
    "/",
    "/catalogo",
    "/catalogo/dulce",
    "/catalogo/salado",
    "/catalogo/packs",
    "/catalogo/sin-alergenos",
    "/catalogo/top-ventas",
    "/noticias",
    ...todos.map((t) => `/catalogo/${t.slug}`),
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
