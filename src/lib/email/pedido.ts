import { site } from "~/data/site";
import { stores } from "~/data/stores";

/**
 * Los dos correos de un pedido pagado (5-11-2026): el aviso al obrador y la
 * confirmación al cliente, en texto y en HTML. Funciones puras: el webhook
 * reúne los datos y `enviarCorreo` los manda.
 */
export type DatosPedido = {
  totalCents: number;
  lineas: LineaCorreo[];
  /** «Envío a domicilio» / «Recogida en tienda», ya legible. */
  modalidad: string;
  /** «miércoles 24 de diciembre», ya legible. */
  dia: string;
  franja: string;
  destino: string;
  aDomicilio: boolean;
  /** `alcobendas` / `pozuelo` si es recogida. */
  tiendaId?: string;
  nombre?: string;
  email: string;
  telefono?: string;
  notas?: string;
  referencia: string;
};

export type LineaCorreo = {
  qty: number;
  nombre: string;
  importeCents: number;
  /**
   * Qué lleva un pack, pieza a pieza («Sabor de la empanada: …»). Sin esto
   * el obrador solo leería «Pack Cumpleaños» y no sabría qué preparar.
   */
  detalle?: string[];
  /** La foto que subió el cliente; solo se enseña en el aviso al obrador. */
  fotoUrl?: string;
};

export type Mensaje = { asunto: string; texto: string; html: string };

const euros = (cents: number) =>
  `${(cents / 100).toFixed(2).replace(".", ",")} €`;

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** La tienda que atiende el pedido: la de recogida o, a domicilio, el obrador. */
const tiendaDe = (d: DatosPedido) =>
  stores.find((s) => s.id === d.tiendaId) ?? stores[0];


const COLOR = {
  leche: "#fefcf8",
  latte: "#f4ece0",
  avellana: "#d8c2a6",
  moka: "#322820",
  teja: "#8e241d",
  suave: "#6f5c4a",
};

/** Esqueleto común: tablas y estilos en línea, que es lo que leen los gestores de correo. */
function plantilla(titulo: string, cuerpo: string): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:${COLOR.latte};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.latte};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLOR.leche};border:1px solid ${COLOR.avellana};font-family:Georgia,'Times New Roman',serif;color:${COLOR.moka};">
<tr><td style="background:${COLOR.teja};padding:18px 24px;color:${COLOR.leche};font-size:20px;letter-spacing:1px;">${esc(site.name)}</td></tr>
<tr><td style="padding:24px;font-size:16px;line-height:1.5;">${cuerpo}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid ${COLOR.avellana};font-size:13px;color:${COLOR.suave};font-family:Arial,sans-serif;">${esc(site.name)} · ${esc(site.legend)}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Debajo del nombre: las piezas del pack y, al obrador, el enlace a la foto. */
function extrasLinea(l: LineaCorreo, conFoto: boolean): string {
  const piezas = l.detalle?.length
    ? `<ul style="margin:4px 0 0;padding-left:18px;font-size:14px;color:${COLOR.suave};">${l.detalle
        .map((x) => `<li>${esc(x)}</li>`)
        .join("")}</ul>`
    : "";
  const foto =
    conFoto && l.fotoUrl
      ? `<div style="margin-top:4px;font-size:14px;"><a href="${esc(l.fotoUrl)}" style="color:${COLOR.teja};">Ver la foto del cliente</a></div>`
      : "";
  return piezas + foto;
}

function tablaLineas(d: DatosPedido, conFoto: boolean): string {
  const filas = d.lineas
    .map(
      (l) => `<tr>
<td style="padding:6px 0;border-bottom:1px solid ${COLOR.latte};vertical-align:top;">${l.qty} × ${esc(l.nombre)}${extrasLinea(l, conFoto)}</td>
<td align="right" style="padding:6px 0;border-bottom:1px solid ${COLOR.latte};white-space:nowrap;vertical-align:top;">${euros(l.importeCents)}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;margin:8px 0 16px;">
${filas}
<tr><td style="padding:10px 0 0;font-weight:bold;">Total pagado</td><td align="right" style="padding:10px 0 0;font-weight:bold;white-space:nowrap;">${euros(d.totalCents)}</td></tr>
</table>`;
}

const filaDato = (etiqueta: string, valor: string) =>
  `<tr><td style="padding:3px 12px 3px 0;color:${COLOR.suave};white-space:nowrap;vertical-align:top;">${esc(etiqueta)}</td><td style="padding:3px 0;">${esc(valor)}</td></tr>`;

const tablaDatos = (filas: [string, string | undefined][]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;margin:0 0 16px;">${filas
    .filter((f): f is [string, string] => Boolean(f[1]))
    .map(([e, v]) => filaDato(e, v))
    .join("")}</table>`;

const lineasTexto = (d: DatosPedido, conFoto: boolean) =>
  d.lineas
    .map((l) =>
      [
        `• ${l.qty}× ${l.nombre} — ${euros(l.importeCents)}`,
        ...(l.detalle ?? []).map((x) => `    - ${x}`),
        ...(conFoto && l.fotoUrl ? [`    Foto del cliente: ${l.fotoUrl}`] : []),
      ].join("\n"),
    )
    .join("\n");

/** Al obrador: todo lo que hace falta para prepararlo y llamar al cliente. */
export function correoObrador(d: DatosPedido): Mensaje {
  const asunto = `Pedido web — ${d.modalidad} · ${d.dia} · ${euros(d.totalCents)}`;
  const datos: [string, string | undefined][] = [
    ["Modalidad", d.modalidad],
    ["Día", d.franja ? `${d.dia} (${d.franja})` : d.dia],
    [
      d.aDomicilio ? "Dirección" : "Tienda",
      d.destino,
    ],
    ["Nombre", d.nombre],
    ["Teléfono", d.telefono],
    ["Email", d.email],
    ["Notas", d.notas],
  ];
  const texto = [
    `Pedido pagado — ${euros(d.totalCents)}`,
    "",
    lineasTexto(d, true),
    "",
    ...datos.filter(([, v]) => v).map(([e, v]) => `${e}: ${v}`),
    "",
    `Referencia Stripe: ${d.referencia}`,
    "Respondiendo a este correo le escribes al cliente.",
  ].join("\n");
  const html = plantilla(
    asunto,
    `<p style="margin:0 0 4px;font-size:22px;">Pedido pagado</p>
<p style="margin:0 0 16px;color:${COLOR.suave};font-family:Arial,sans-serif;font-size:14px;">${esc(d.modalidad)} · ${esc(d.dia)}</p>
${tablaLineas(d, true)}
${tablaDatos(datos)}
<p style="margin:0;font-size:13px;color:${COLOR.suave};font-family:Arial,sans-serif;">Referencia Stripe: ${esc(d.referencia)}<br>Respondiendo a este correo le escribes al cliente.</p>`,
  );
  return { asunto, texto, html };
}

/** Al cliente: la confirmación, con a quién llamar si necesita cambiar algo. */
export function correoCliente(d: DatosPedido): Mensaje {
  const tienda = tiendaDe(d);
  const asunto = `Tu pedido en ${site.name}`;
  const saludo = d.nombre
    ? `¡Gracias, ${d.nombre}!`
    : "¡Gracias por tu pedido!";
  const contacto = `llámanos al ${tienda.phoneDisplay} (${tienda.shortName}) o escríbenos a ${site.email}`;
  const datos: [string, string | undefined][] = [
    ["Entrega", d.modalidad],
    ["Día", d.franja ? `${d.dia} (${d.franja})` : d.dia],
    [
      d.aDomicilio ? "Dirección" : "Dónde",
      d.destino,
    ],
    ["Notas", d.notas],
  ];
  const texto = [
    saludo,
    "",
    "Tu pedido está pagado y anotado en el obrador.",
    d.nombre ? `Está a nombre de ${d.nombre}.` : "",
    "",
    lineasTexto(d, false),
    `Total pagado: ${euros(d.totalCents)}`,
    "",
    ...datos.filter(([, v]) => v).map(([e, v]) => `${e}: ${v}`),
    "",
    `Si necesitas cambiar algo, ${contacto}.`,
    "",
    site.name,
    site.legend,
  ].join("\n");
  const html = plantilla(
    asunto,
    `<p style="margin:0 0 8px;font-size:22px;">${esc(saludo)}</p>
<p style="margin:0 0 16px;">Tu pedido está pagado y anotado en el obrador.${
      d.nombre ? ` Está a nombre de <strong>${esc(d.nombre)}</strong>.` : ""
    }</p>
${tablaLineas(d, false)}
${tablaDatos(datos)}
<p style="margin:0;">Si necesitas cambiar algo, llámanos al <a href="tel:${tienda.phone}" style="color:${COLOR.teja};">${esc(tienda.phoneDisplay)}</a> (${esc(tienda.shortName)}) o escríbenos a <a href="mailto:${site.email}" style="color:${COLOR.teja};">${esc(site.email)}</a>.</p>`,
  );
  return { asunto, texto, html };
}
