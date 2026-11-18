/**
 * Visitas de la web (18-11-2026): lógica pura del contador propio. Sin `pg`
 * ni `astro:*`, para probarla sin levantar nada.
 *
 * Cómo se cuenta: cada página manda un aviso a `/api/v` y se suman
 * contadores en Redis (Upstash), un hash por día. Nada de cookies ni de
 * guardar IPs: el visitante único es un resumen (HMAC) de IP + navegador
 * con una sal que cambia cada día, y ese resumen solo vive en un
 * HyperLogLog (que no deja sacarlo) y, unos minutos, en «ahora en la web».
 *
 * Neon no se toca al contar: así la base se sigue durmiendo y las visitas
 * no gastan horas de cómputo (ni ponen en riesgo los pedidos).
 */

/**
 * Las claves llevan prefijo por si la base de Redis se comparte algún día.
 * `hsl2`: el 18-11-2026 se empezó de cero para dejar fuera las pruebas
 * del estreno (las claves `hsl:` caducan solas).
 */
const PREFIJO = "hsl2";
export const claveDia = (dia: string) => `${PREFIJO}:v:${dia}`;
export const claveUnicos = (dia: string) => `${PREFIJO}:u:${dia}`;
export const CLAVE_AHORA = `${PREFIJO}:ahora`;
/** Cuándo empezó a contar (ms): la conversión solo mira pedidos de después. */
export const CLAVE_INICIO = `${PREFIJO}:inicio`;

/** Lo que se guarda de cada día dura algo más de un año. */
export const DURACION_SEGUNDOS = 400 * 24 * 60 * 60;
/** «Ahora en la web»: quien ha abierto una página en los últimos 5 minutos. */
export const VENTANA_AHORA_MS = 5 * 60 * 1000;

/** Rutas que no se cuentan: panel, TPV, API, cuenta y acceso. */
const PRIVADAS = ["/admin", "/tpv", "/api", "/acceso", "/cuenta", "/baja"];

/**
 * La ruta tal y como se guarda, o `null` si no se cuenta. Sin consulta ni
 * barra final, y solo con caracteres de una ruta de la web: lo que no
 * encaja (un bot que se inventa rutas) va a «otra», para que el hash del
 * día no crezca sin fin.
 */
export function rutaNormalizada(ruta: unknown): string | null {
  if (typeof ruta !== "string" || !ruta.startsWith("/")) return null;
  let p = ruta.split(/[?#]/)[0].toLowerCase();
  if (p.length > 1) p = p.replace(/\/+$/, "");
  // `/_vercel`, `/_astro`, `/_image`…: ficheros, no páginas.
  if (
    p.startsWith("/_") ||
    PRIVADAS.some((x) => p === x || p.startsWith(`${x}/`))
  )
    return null;
  if (p.length > 100 || !/^\/[a-z0-9\-/]*$/.test(p)) return "otra";
  return p;
}

export type Origen =
  | "google"
  | "otros buscadores"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "whatsapp"
  | "correo"
  | "directo"
  | "otras webs";

export const ORIGENES: readonly Origen[] = [
  "google",
  "otros buscadores",
  "instagram",
  "facebook",
  "tiktok",
  "whatsapp",
  "correo",
  "directo",
  "otras webs",
];

/** De `utm_source` (campañas, enlaces de la bio) a un origen conocido. */
function origenDeUtm(utm: string): Origen | null {
  const u = utm.toLowerCase();
  if (/insta|^ig$/.test(u)) return "instagram";
  if (/face|^fb$|meta/.test(u)) return "facebook";
  if (/tiktok/.test(u)) return "tiktok";
  if (/whats|^wa$/.test(u)) return "whatsapp";
  if (/mail|correo|newsletter|wix/.test(u)) return "correo";
  if (/google/.test(u)) return "google";
  return null;
}

/**
 * De dónde llega una visita: primero `utm_source` si lo trae el enlace,
 * luego la web de la que viene. `null` si viene de la propia web (una
 * recarga o un enlace interno): no es una visita nueva.
 */
export function origenDe(
  referrer: unknown,
  utm: unknown,
  hostPropio: string,
): Origen | null {
  if (typeof utm === "string" && utm.trim()) {
    const o = origenDeUtm(utm.trim());
    if (o) return o;
  }
  if (typeof referrer !== "string" || !referrer) return "directo";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "directo";
  }
  const propio = hostPropio.toLowerCase().replace(/^www\./, "");
  if (host === propio || host.endsWith(`.${propio}`)) return null;
  // El correo antes que los buscadores: Gmail es `mail.google.com`.
  if (
    /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$/.test(
      host,
    )
  )
    return "correo";
  if (
    /(^|\.)google\.(com?\.)?[a-z]{2,3}$/.test(host) ||
    host === "googleadservices.com"
  )
    return "google";
  if (
    /(^|\.)(bing\.com|duckduckgo\.com|yahoo\.(com?\.)?[a-z]{2,3}|ecosia\.org|search\.brave\.com|qwant\.com)$/.test(
      host,
    )
  )
    return "otros buscadores";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(host))
    return "facebook";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)(whatsapp\.com|wa\.me)$/.test(host)) return "whatsapp";
  return "otras webs";
}

/** Robots, previsualizaciones de enlaces y herramientas: no son visitas. */
export function esRobot(userAgent: string | null | undefined): boolean {
  const ua = userAgent ?? "";
  if (!ua) return true;
  return /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|whatsapp|telegram|vercel|curl|wget|python|node-fetch|axios/i.test(
    ua,
  );
}

/** El día de hoy en Madrid, `YYYY-MM-DD` (el servidor vive en UTC). */
export function diaEnMadrid(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(
    ahora,
  );
}

export function sumaDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Los días de `desde` a `hasta`, ambos incluidos. */
export function diasEntre(desde: string, hasta: string): string[] {
  const dias: string[] = [];
  for (let d = desde; d <= hasta && dias.length < 400; d = sumaDias(d, 1))
    dias.push(d);
  return dias;
}

type Comando = (string | number)[];

/**
 * Los comandos de Redis de una página vista. La primera página de una
 * visita (`nueva`) cuenta además la visita, su origen, el dispositivo y el
 * visitante único; las siguientes, solo la página. Unas 3 operaciones por
 * página y 11 en la primera: con el plan gratuito de Upstash (500.000 al
 * mes) dan para unas 90.000 páginas vistas al mes.
 */
export function comandosDeVisita(v: {
  dia: string;
  ruta: string;
  visitante: string;
  ahoraMs: number;
  nueva: { origen: Origen; dispositivo: string } | null;
}): Comando[] {
  const k = claveDia(v.dia);
  const cmds: Comando[] = [
    ["HINCRBY", k, "t", 1],
    ["HINCRBY", k, `p:${v.ruta}`, 1],
    ["ZADD", CLAVE_AHORA, v.ahoraMs, v.visitante],
  ];
  if (v.nueva) {
    const u = claveUnicos(v.dia);
    cmds.push(
      ["HINCRBY", k, "v", 1],
      ["HINCRBY", k, `o:${v.nueva.origen}`, 1],
      ["HINCRBY", k, `d:${v.nueva.dispositivo}`, 1],
      ["EXPIRE", k, DURACION_SEGUNDOS],
      ["PFADD", u, v.visitante],
      ["EXPIRE", u, DURACION_SEGUNDOS],
      // Quien se fue hace rato sale de «ahora», para que no crezca.
      ["ZREMRANGEBYSCORE", CLAVE_AHORA, "-inf", v.ahoraMs - VENTANA_AHORA_MS],
      // Solo la primera vez: desde cuándo se cuenta.
      ["SET", CLAVE_INICIO, v.ahoraMs, "NX"],
    );
  }
  return cmds;
}

export type Dia = {
  dia: string;
  paginas: number;
  visitas: number;
  porPagina: Record<string, number>;
  porOrigen: Record<string, number>;
  porDispositivo: Record<string, number>;
};

/** Un día a partir de su hash de Redis (`HGETALL`, como lista o como objeto). */
export function diaDesdeHash(dia: string, hash: unknown): Dia {
  const d: Dia = {
    dia,
    paginas: 0,
    visitas: 0,
    porPagina: {},
    porOrigen: {},
    porDispositivo: {},
  };
  let pares: [string, number][] = [];
  if (Array.isArray(hash)) {
    for (let i = 0; i + 1 < hash.length; i += 2)
      pares.push([String(hash[i]), Number(hash[i + 1])]);
  } else if (hash && typeof hash === "object") {
    pares = Object.entries(hash as Record<string, unknown>).map(([c, n]) => [
      c,
      Number(n),
    ]);
  }
  for (const [campo, n] of pares) {
    if (!Number.isFinite(n)) continue;
    if (campo === "t") d.paginas = n;
    else if (campo === "v") d.visitas = n;
    else if (campo.startsWith("p:")) d.porPagina[campo.slice(2)] = n;
    else if (campo.startsWith("o:")) d.porOrigen[campo.slice(2)] = n;
    else if (campo.startsWith("d:")) d.porDispositivo[campo.slice(2)] = n;
  }
  return d;
}

/** Suma los recuentos de varios días. */
export function sumaRecuentos(
  dias: Dia[],
  campo: "porPagina" | "porOrigen" | "porDispositivo",
) {
  const total: Record<string, number> = {};
  for (const d of dias)
    for (const [k, n] of Object.entries(d[campo]))
      total[k] = (total[k] ?? 0) + n;
  return Object.entries(total).sort((a, b) => b[1] - a[1]);
}
