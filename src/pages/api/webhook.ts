import type { APIRoute } from "astro";
import Stripe from "stripe";
import { enviarCorreo } from "~/lib/email/enviar";
import { site } from "~/data/site";
import {
  marcarPagado,
  marcarAvisado,
  crearPedidoReconstruido,
  type PedidoAnotado,
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
    const avisado = await notify(stripe, session);
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
 * Pone en el pago de Stripe el número de pedido y la referencia de la web
 * (9-10-2026): «Horno San Lorenzo · Pedido nº 14 · Ref. a6bf584a». Así el
 * pago se encuentra en Stripe buscando el número, y desde el panel se llega
 * al pago con «Ver en Stripe». Es un extra: si falla, no para nada.
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
        anotado.numero ? `Pedido nº ${anotado.numero}` : null,
        `Ref. ${anotado.id.slice(0, 8)}`,
      ]
        .filter(Boolean)
        .join(" · "),
      metadata: { pedidoId: anotado.id, numero: anotado.numero ? String(anotado.numero) : "" },
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
    const items = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 50,
    });
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
      lineas: items.data.map((i) => ({
        nombre: i.description ?? "",
        qty: i.quantity ?? 1,
        // Stripe da el importe de la línea; el unitario es lo que guardamos.
        unitPriceCents: Math.round((i.amount_total ?? 0) / (i.quantity || 1)),
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

export async function notify(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  const to = import.meta.env.ORDER_NOTIFICATION_EMAIL;
  const from = import.meta.env.ORDER_FROM_EMAIL;

  const m = session.metadata ?? {};
  const total = ((session.amount_total ?? 0) / 100)
    .toFixed(2)
    .replace(".", ",");
  const cliente = session.customer_details?.email ?? "";

  const items = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 50,
  });
  const detalle = items.data
    .map((i) => `• ${i.quantity}× ${i.description}`)
    .join("\n");

  const resumen = [
    `Pedido pagado — ${total} €`,
    "",
    detalle,
    "",
    `Modalidad: ${m.modalidad ?? ""}`,
    `Día: ${m.dia ?? ""} (${m.franja ?? ""})`,
    `Destino: ${m.destino ?? ""}`,
    m.nombre ? `Nombre: ${m.nombre}` : "",
    m.notas ? `Notas: ${m.notas}` : "",
    `Email: ${cliente}`,
    "",
    `Referencia Stripe: ${session.id}`,
  ]
    .filter(Boolean)
    .join("\n");

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
    asunto: `Pedido web — ${m.dia ?? ""} · ${total} €`,
    texto: resumen,
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
      asunto: `Tu pedido en ${site.name}`,
      texto: [
        `Gracias por tu pedido. Ya está pagado y anotado en el obrador.`,
        "",
        detalle,
        "",
        `Total: ${total} €`,
        `${m.modalidad ?? ""} · ${m.dia ?? ""} (${m.franja ?? ""})`,
        `${m.destino ?? ""}`,
        "",
        `Si necesitas cambiar algo, escríbenos a ${site.email}.`,
        "",
        site.name,
        site.legend,
      ].join("\n"),
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
