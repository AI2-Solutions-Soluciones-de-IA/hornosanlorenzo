import { formatPriceCents } from "~/lib/format";

/**
 * El correo que reciben los suscritos cuando se envía una noticia de «Este
 * mes». Texto plano, como el resto de correos de la web. Lógica pura: quien
 * envía pasa la noticia con las ofertas ya aplicadas (`obtenerNoticia` con
 * `soloPublicada`), así que el precio es el mismo que se cobra.
 */
type ProductoDelCorreo = {
  name: string;
  priceCents: number | null;
  precioAntesCents?: number;
  ofertaHasta?: string | null;
  variantes: { label: string; priceCents: number; precioAntesCents?: number }[];
};

export type NoticiaDelCorreo = {
  slug: string;
  titulo: string;
  excerpt: string;
  producto: ProductoDelCorreo | null;
};

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const fechaLarga = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]}`;
};

function lineasDeOferta(p: ProductoDelCorreo): string[] {
  const rebaja = (cents: number, antes: number) =>
    `${formatPriceCents(cents)} (antes ${formatPriceCents(antes)})`;
  const lineas: string[] = [];
  if (p.precioAntesCents !== undefined && p.priceCents !== null && p.variantes.length === 0)
    lineas.push(`${p.name}: ${rebaja(p.priceCents, p.precioAntesCents)}`);
  for (const v of p.variantes)
    if (v.precioAntesCents !== undefined)
      lineas.push(`${p.name} (${v.label}): ${rebaja(v.priceCents, v.precioAntesCents)}`);
  if (lineas.length && p.ofertaHasta)
    lineas[lineas.length - 1] += `, hasta el ${fechaLarga(p.ofertaHasta)}`;
  return lineas;
}

export function correoDeOferta(
  noticia: NoticiaDelCorreo,
  base: string,
  token: string,
): { asunto: string; texto: string; bajaUrl: string } {
  const url = new URL(`/noticias/${noticia.slug}`, base).toString();
  const bajaUrl = new URL(`/baja?t=${encodeURIComponent(token)}`, base).toString();
  const oferta = noticia.producto ? lineasDeOferta(noticia.producto) : [];
  const texto = [
    noticia.titulo,
    "",
    noticia.excerpt,
    ...(oferta.length ? ["", ...oferta] : []),
    "",
    `Míralo en la web: ${url}`,
    "",
    "—",
    "Horno San Lorenzo · Obrador artesano desde 1986",
    "Recibes este correo porque te suscribiste a nuestras ofertas.",
    `Para darte de baja: ${bajaUrl}`,
  ].join("\n");
  return { asunto: noticia.titulo, texto, bajaUrl };
}
