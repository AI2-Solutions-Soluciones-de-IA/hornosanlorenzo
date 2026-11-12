import type { APIRoute } from "astro";
import Stripe from "stripe";
import { enviarCorreo } from "~/lib/email/enviar";
import {
  correoCliente,
  correoObrador,
  type DatosPedido,
  type LineaCorreo,
} from "~/lib/email/pedido";
import { etiquetaPieza } from "~/data/packs";
import { site } from "~/data/site";
import { stores } from "~/data/stores";
import {
  marcarPagado,
  marcarAvisado,
  crearPedidoReconstruido,
  marcarDevuelto,
  pedidoPorId,
  type PedidoAnotado,
  type PedidoConLineas,
} from "~/lib/db/pedidos";

// Stripe llama a esta ruta: nunca se prerenderiza.
export const prerender = false;

/**
 * Confirmación del cobro.
 *
 * La confirmación se hace SIEMPRE aquí y nunca en la vuelta del navegador:
 * el cliente puede cerrar la pestaña o manipular la URL de retorno, pero esta
 * llamada la hace Stripe y va firmada.
 */
export const POST: APIRoute = async ({ request }) => {
  const secret = import.meta.env.STRIPE_SECRET_KEY;
  const signingSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || !signingSecret) {
    console.error("[webhook] faltan claves de Stripe");
    return new Response("not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("missing signature", { status: 400 });

  // La firma se comprueba sobre el cuerpo en crudo, sin parsear.
  const body = await request.text();
  const stripe = new Stripe(secret);

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      signingSecret,
    );
  } catch (err) {
    console.error("[webhook] firma inválida", err);
    return new Response("invalid signature", { status: 400 });
  }

  if (event.type === "charge.refunded") {
    return anotarDevolucion(stripe, event.data.object as Stripe.Charge);
  }

  if (event.type !== "checkout.session.completed") {
    return new Response("ignored", { status: 200 });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  if (session.payment_status !== "paid") {
    return new Response("unpaid", { status: 200 });
  }

  const anotado = await anotarPago(stripe, session);
  await etiquetaPagoEnStripe(stripe, session, anotado);

  if (yaAvisado(anotado)) {
    // Reintento de un aviso que ya salió. El pedido está pagado y anotado:
    // responder 200 corta la cadena de reintentos.
    return new Response("ya avisado", { status: 200 });
  }

  try {
    const avisado = await notify(stripe, session, anotado?.id ?? null);
    if (avisado && anotado) await marcarAvisado(anotado.id);
  } catch (err) {
    // Devolver 500 hace que Stripe reintente, que es lo que queremos si el
    // correo falla: el cobro ya está hecho y el obrador tiene que enterarse.
    // Como `notificado_en` sigue nulo, el reintento volverá a intentarlo.
    console.error("[webhook] no se pudo avisar del pedido", err);
    return new Response("notification failed", { status: 500 });
  }

  return new Response("ok", { status: 200 });
};

/**
 * Devolución hecha desde el panel de Stripe (9-10-2026): se busca la sesión
 * de pago de ese cobro y se apunta lo devuelto en el pedido. Si falla la
 * base de datos se responde 500 para que Stripe lo reintente.
 */
export async function anotarDevolucion(stripe: Stripe, charge: Stripe.Charge): Promise<Response> {
  const pago = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pago) return new Response("sin pago", { status: 200 });
  try {
    const sesiones = await stripe.checkout.sessions.list({ payment_intent: pago, limit: 1 });
    const sesion = sesiones.data[0]?.id;
    if (!sesion) return new Response("sin sesión", { status: 200 });
    const pedido = await marcarDevuelto(sesion, charge.amount_refunded ?? 0);
    if (!pedido) return new Response("pedido desconocido", { status: 200 });
    console.info(`[webhook] devolución apuntada en el pedido ${pedido.id}: ${charge.amount_refunded} céntimos`);
    return new Response("devolución apuntada", { status: 200 });
  } catch (err) {
    console.error("[webhook] no se pudo apuntar la devolución:", err instanceof Error ? err.message : err);
    return new Response("error", { status: 500 });
  }
}

/**
 * Pone en el pago de Stripe la referencia de la web (9-10-2026):
 * «Horno San Lorenzo · Ref. a6bf584a». Así el pago se encuentra en Stripe
 * buscando la referencia que sale en el panel, y desde el panel se llega al
 * pago con «Ver en Stripe». Sin número de pedido desde el 12-11-2026. Es un
 * extra: si falla, no para nada.
 */
export async function etiquetaPagoEnStripe(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  anotado: PedidoAnotado | null,
): Promise<void> {
  const pago = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!pago || !anotado) return;
  try {
    await stripe.paymentIntents.update(pago, {
      description: [
        "Horno San Lorenzo",
        `Ref. ${anotado.id.slice(0, 8)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      metadata: { pedidoId: anotado.id },
    });
  } catch (err) {
    console.warn("[webhook] no se pudo poner el número en el pago de Stripe:", err instanceof Error ? err.message : err);
  }
}

/**
 * Deja constancia del cobro. Se hace ANTES de avisar a nadie: el aviso puede
 * fallar y reintentarse, pero un cobro sin rastro no se recupera.
 *
 * Devuelve null si no se pudo escribir nada. Que Postgres esté caído no puede
 * impedir que el obrador se entere de un pedido pagado: en ese caso se sigue
 * adelante con el correo, que es lo que hace el sitio desde el primer día.
 */
export async function anotarPago(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<PedidoAnotado | null> {
  const pedidoId = session.metadata?.pedidoId || null;

  try {
    const anotado = await marcarPagado({ pedidoId, sessionId: session.id });
    if (anotado) return anotado;

    // No estaba: el checkout no pudo escribirlo. Se reconstruye con lo que
    // da Stripe —sin slugs y sin desglose de envío— y queda marcado como
    // reconstruido para que en el panel no parezca un pedido completo.
    const lineas = await lineasDesdeStripe(stripe, session.id);
    const m = session.metadata ?? {};
    return await crearPedidoReconstruido({
      stripeSessionId: session.id,
      // La modalidad y el día de verdad, que ya venían en los metadatos y
      // antes no se pasaban: la fila se escribía con 'recogida' y la fecha de
      // hoy, y el panel las enseñaba como si fueran ciertas.
      mode: modoDeEntrega(m.entregaModo),
      fechaEntrega: fechaDeEntrega(m.entregaFecha),
      slot: franjaDeEntrega(m.entregaFranja),
      storeId: m.entregaTienda || null,
      address: m.entregaDireccion || null,
      postalCode: cpDeEntrega(m.entregaCP),
      email: session.customer_details?.email ?? "",
      telefono: m.telefono ?? "",
      nombre: m.nombre || null,
      notas: m.notas || null,
      totalCents: session.amount_total ?? 0,
      lineas: lineas.map((l) => ({
        // Un pack reconstruido no tiene desglose en la base: sin esto la hoja
        // de producción lo listaría como «Pack Cumpleaños», algo a hornear.
        // Lo que lleva va en el nombre, tal como lo guardó Stripe.
        nombre: l.detalle?.length
          ? `${l.nombre} (sin desglose; lleva: ${l.detalle.join(" · ")})`
          : l.nombre,
        qty: l.qty,
        // Stripe da el importe de la línea; el unitario es lo que guardamos.
        unitPriceCents: Math.round(l.importeCents / (l.qty || 1)),
      })),
    });
  } catch (err) {
    console.error(
      "[webhook] no se pudo anotar el pedido en la base de datos:",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Los metadatos de Stripe son texto libre: llegan tal y como los escribió
 * `checkout.ts`, pero una sesión vieja —o creada de otra manera— puede no
 * traerlos. Cada campo se valida antes de escribirlo y, si no cuadra, se
 * queda en null: en el panel se verá como «sin datos», que es la verdad,
 * en vez de un valor por defecto que se lee como un hecho.
 */
export function modoDeEntrega(v: unknown): "domicilio" | "recogida" | null {
  return v === "domicilio" || v === "recogida" ? v : null;
}

export function fechaDeEntrega(v: unknown): string | null {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export function franjaDeEntrega(v: unknown): "morning" | "afternoon" | null {
  return v === "morning" || v === "afternoon" ? v : null;
}

/** `postal_code` es `char(5)`: un valor a medias ahí ensucia más que ayuda. */
export function cpDeEntrega(v: unknown): string | null {
  return typeof v === "string" && /^\d{5}$/.test(v) ? v : null;
}

/**
 * Si ya consta avisado, este aviso de Stripe es un reintento de uno que salió
 * bien: no hay que volver a mandar el correo. Función aparte y pura para
 * poder fijarla en una prueba sin montar la petición firmada entera.
 */
export function yaAvisado(anotado: PedidoAnotado | null): boolean {
  return Boolean(anotado?.notificadoEn);
}

/**
 * Las líneas del correo desde el pedido guardado al pedir: ahí está qué lleva
 * cada pack (sabores elegidos) y la foto del cliente, que Stripe no guarda.
 * El reparto no es una línea del pedido; se añade como en la página de pago.
 */
export function lineasDesdePedido(p: PedidoConLineas): LineaCorreo[] {
  const lineas: LineaCorreo[] = p.lineas.map((l) => ({
    qty: l.qty,
    nombre: l.varianteLabel ? `${l.nombre} — ${l.varianteLabel}` : l.nombre,
    importeCents: l.qty * l.unitPriceCents,
    ...(l.detalle?.length && { detalle: l.detalle.map(etiquetaPieza) }),
    ...(l.fotoUrl && { fotoUrl: l.fotoUrl }),
  }));
  if (p.envioCents > 0) {
    lineas.push({ qty: 1, nombre: "Reparto a domicilio", importeCents: p.envioCents });
  }
  return lineas;
}

/**
 * Las líneas según Stripe, para cuando el pedido no está en la base. Lo que
 * lleva un pack sale de la descripción del producto, que `checkout.ts`
 * escribe como «pieza · pieza · pieza» (la `description` de la línea es solo
 * el nombre). La foto no llega a Stripe: en ese caso no hay forma de darla.
 */
export async function lineasDesdeStripe(
  stripe: Stripe,
  sessionId: string,
): Promise<LineaCorreo[]> {
  const items = await stripe.checkout.sessions.listLineItems(sessionId, {
    limit: 50,
    expand: ["data.price.product"],
  });
  return items.data.map((i) => {
    const producto = i.price?.product;
    const descripcion =
      producto && typeof producto === "object" && !producto.deleted
        ? producto.description
        : null;
    return {
      qty: i.quantity ?? 1,
      nombre: i.description ?? "",
      importeCents: i.amount_total ?? 0,
      ...(descripcion && { detalle: descripcion.split(" · ") }),
    };
  });
}

/**
 * Del pedido guardado si se puede; si no (no hay id, la base no responde o
 * el pedido es reconstruido y por tanto no tiene desglose), de Stripe.
 */
async function lineasParaCorreo(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  pedidoId: string | null,
): Promise<LineaCorreo[]> {
  if (pedidoId) {
    try {
      const pedido = await pedidoPorId(pedidoId);
      if (pedido && !pedido.reconstruido && pedido.lineas.length > 0) {
        return lineasDesdePedido(pedido);
      }
    } catch (err) {
      console.error(
        "[webhook] no se pudo leer el pedido para el correo; se usan las líneas de Stripe:",
        err instanceof Error ? err.message : err,
      );
    }
  }
  return lineasDesdeStripe(stripe, session.id);
}

/**
 * A quién va el aviso del pedido (12-11-2026): una recogida en Pozuelo, a
 * la pastelería de Pozuelo (el correo de esa tienda en `~/data/stores`);
 * lo demás (Alcobendas y envíos a domicilio, que salen del obrador), a
 * `ORDER_NOTIFICATION_EMAIL`.
 */
export function destinoAviso(
  m: Record<string, string>,
  porDefecto: string | undefined,
): string | undefined {
  if (m.entregaModo === "recogida" && m.entregaTienda === "pozuelo") {
    return stores.find((s) => s.id === "pozuelo")?.email ?? porDefecto;
  }
  return porDefecto;
}

export async function notify(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  /** Id del pedido en la base, para sacar de ahí el desglose de los packs. */
  pedidoId: string | null = null,
): Promise<boolean> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  const from = import.meta.env.ORDER_FROM_EMAIL;

  const m = session.metadata ?? {};
  const to = destinoAviso(m, import.meta.env.ORDER_NOTIFICATION_EMAIL);
  const cliente = session.customer_details?.email ?? "";

  const datos: DatosPedido = {
    totalCents: session.amount_total ?? 0,
    lineas: await lineasParaCorreo(stripe, session, pedidoId),
    modalidad: m.modalidad ?? "",
    dia: m.dia ?? "",
    franja: m.franja ?? "",
    destino: m.destino ?? "",
    aDomicilio: m.entregaModo === "domicilio",
    tiendaId: m.entregaTienda || undefined,
    nombre: m.nombre || undefined,
    email: cliente,
    telefono: m.telefono || undefined,
    notas: m.notas || undefined,
    referencia: session.id,
  };
  const aviso = correoObrador(datos);
  const resumen = aviso.texto;

  // Todo o nada, a propósito: el correo al cliente dice «Ya está pagado y
  // anotado en el obrador», y esa frase solo puede ser cierta si ese aviso
  // ha salido de verdad — da igual que la razón sea que falta configuración
  // (este caso) o que el envío al obrador falle ya con todo bien
  // configurado (el siguiente bloque: proveedor caído, dominio sin
  // verificar, límite alcanzado...). Si mandáramos el correo al cliente de
  // todos modos, podríamos confirmarle algo falso, o dejar una avería sin
  // que nadie la note porque el cliente sigue viendo confirmaciones
  // perfectas. Por eso cualquiera de los dos casos frena también el correo
  // al cliente: el pedido no se pierde, queda en el panel de Stripe y en
  // este registro.
  if (!apiKey || !to || !from) {
    console.warn("[webhook] correo no configurado; pedido:\n" + resumen);
    return false;
  }

  const obrador = await enviarCorreo({
    para: to,
    ...aviso,
    // Contestar al aviso es escribir al cliente.
    responderA: cliente || undefined,
  });

  if (!obrador.ok) {
    // Mismo motivo que el bloque de arriba: sin aviso al obrador, no se
    // manda la confirmación al cliente.
    console.warn("[webhook] no se pudo avisar al obrador; pedido:\n" + resumen);
    return false;
  }

  if (cliente) {
    const clienteEnviado = await enviarCorreo({
      para: cliente,
      ...correoCliente(datos),
      responderA: site.email,
    });

    if (!clienteEnviado.ok) {
      console.warn(
        `[webhook] no se pudo avisar al cliente (${cliente}) de su pedido:\n` +
          resumen,
      );
    }
  }

  return true;
}
