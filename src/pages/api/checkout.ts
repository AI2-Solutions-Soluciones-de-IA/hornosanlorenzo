import type { APIRoute } from "astro";
import Stripe from "stripe";
import { formatDateISO } from "~/lib/format";
import { etiquetaPieza } from "~/data/packs";
import {
  MODE_COPY,
  ENTREGA_DOMICILIO_COPY,
  normalizaTelefono,
} from "~/lib/entrega";
import {
  orderPayloadSchema,
  priceOrder,
  destinationLabel,
  OrderError,
} from "~/lib/pedido";
import { crearPedidoIniciado, anotarSesionStripe } from "~/lib/db/pedidos";

// El cobro se calcula en servidor: esta ruta no puede prerenderizarse.
export const prerender = false;

const SLOT_LABEL = { morning: "mañana", afternoon: "tarde" } as const;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export const POST: APIRoute = async ({ request, url, locals }) => {
  const secret = import.meta.env.STRIPE_SECRET_KEY;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Petición mal formada." }, 400);
  }

  const parsed = orderPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Faltan datos del pedido." }, 400);
  }

  let order;
  try {
    // El id sale de la sesión de la petición, nunca del cuerpo: si se
    // aceptara del navegador, cualquiera podría atribuir su pedido a otra
    // persona. Un invitado no tiene sesión y `userId` queda sin definir.
    order = await priceOrder(parsed.data, { userId: locals.usuario?.id });
  } catch (err) {
    if (err instanceof OrderError)
      return json({ error: err.message }, err.status);
    console.error("[checkout] error al valorar el pedido", err);
    return json({ error: "No hemos podido preparar el pedido." }, 500);
  }

  // Sin claves de Stripe todavía: el pedido se anota igual, con los precios
  // que acaba de calcular el servidor, pero como `sin_pago` para que el panel
  // lo enseñe como lo que es. Es lo que permite probar el flujo entero
  // mientras no se cobra; en cuanto haya `STRIPE_SECRET_KEY` esta rama deja
  // de entrar sola. Aquí un fallo de Postgres SÍ es un error: no hay cobro
  // que salvar, y un pedido que no se apunta no le llega a nadie.
  if (!secret) {
    try {
      await crearPedidoIniciado(order, { estado: "sin_pago" });
    } catch (err) {
      console.error(
        "[checkout] sin Stripe y sin poder anotar el pedido:",
        err instanceof Error ? err.message : err,
      );
      return json(
        { error: "No hemos podido anotar el pedido. Inténtalo de nuevo o llámanos." },
        500,
      );
    }
    return json({ url: "/pedido/anotado" });
  }

  // El pedido se anota AQUÍ, con el desglose que acaba de calcular
  // `priceOrder`, y no en el webhook: en los metadatos de Stripe no caben ni
  // los slugs ni las líneas (500 caracteres por valor), solo esta referencia.
  //
  // Un fallo de Postgres no puede impedir una venta: se registra y se sigue.
  // El webhook reconstruirá el pedido con lo que dé Stripe, que es menos,
  // pero mejor eso que un cobro que no aparece en ningún sitio.
  let pedidoId: string | null = null;
  try {
    pedidoId = await crearPedidoIniciado(order);
  } catch (err) {
    console.error(
      "[checkout] no se pudo anotar el pedido, se cobra igual:",
      err instanceof Error ? err.message : err,
    );
  }

  const { payload } = order;
  const stripe = new Stripe(secret);
  const origin = import.meta.env.PUBLIC_SITE_URL ?? url.origin;

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
    order.lines.map((line) => ({
      quantity: line.qty,
      price_data: {
        currency: "eur",
        unit_amount: line.unitPriceCents,
        product_data: {
          name: line.variantLabel
            ? `${line.name} — ${line.variantLabel}`
            : line.name,
          // Stripe enseña qué lleva el pack en su página de pago; el límite
          // de `description` es 500 caracteres.
          ...(line.detalle && {
            description: line.detalle
              .map(etiquetaPieza)
              .join(" · ")
              .slice(0, 500),
          }),
        },
      },
    }));

  if (order.shippingCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: "eur",
        unit_amount: order.shippingCents,
        product_data: { name: "Reparto a domicilio" },
      },
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      // Configuración del Checkout Studio de Stripe (7-10-2026), página
      // alojada por Stripe. `payment_method_collection` no va: solo vale
      // para suscripciones. `saved_payment_method_options` (guardar la
      // tarjeta) tampoco: Stripe rechaza la sesión entera sin un `customer`,
      // y aquí se compra sin cuenta de Stripe (rompió el cobro el 7-10-2026).
      ui_mode: "hosted_page",
      billing_address_collection: "auto",
      phone_number_collection: { enabled: true },
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      submit_type: "auto",
      integration_identifier: "hosted_mobile_app_0001",
      origin_context: "mobile_app",
      mode: "payment",
      line_items: lineItems,
      // `customer_email`, `locale` y `metadata` no salen en el Studio pero se
      // quedan a propósito: el correo y el idioma rellenan la página de
      // pago, y sin los metadatos el webhook no sabe a qué pedido
      // corresponde el pago ni puede avisar al obrador.
      customer_email: payload.email,
      success_url: `${origin}/pedido/gracias?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/carrito`,
      locale: "es",
      // Los metadatos viajan con el pago: son lo que lee el webhook para
      // avisar al obrador. Stripe limita cada valor a 500 caracteres.
      metadata: {
        modalidad: MODE_COPY[payload.mode].label,
        dia: formatDateISO(payload.dateISO),
        franja:
          payload.mode === "domicilio"
            ? ENTREGA_DOMICILIO_COPY
            : SLOT_LABEL[payload.slot ?? "morning"],
        destino: destinationLabel(payload).slice(0, 480),
        telefono: normalizaTelefono(payload.phone),
        nombre: payload.name?.slice(0, 120) ?? "",
        notas: payload.notes?.slice(0, 480) ?? "",
        pedidoId: pedidoId ?? "",
        // Los mismos datos de entrega que arriba, pero EN CRUDO. Los de
        // arriba están formateados para leerse en un correo («Recogida en
        // tienda», «miércoles 24 de diciembre») y no se pueden deshacer sin
        // adivinar. Estos son los que van tal cual a la tabla, y son los que
        // usa el webhook si Postgres estaba caído al cobrar y tiene que
        // reconstruir el pedido: sin ellos tenía que inventarse la modalidad
        // y el día, y el panel enseñaba esa invención como un hecho.
        entregaModo: payload.mode,
        entregaFecha: payload.dateISO,
        entregaFranja: payload.slot ?? "",
        entregaTienda: payload.storeId ?? "",
        entregaDireccion: payload.address?.slice(0, 480) ?? "",
        entregaCP: payload.postalCode ?? "",
      },
    });

    if (!session.url) throw new Error("Stripe no devolvió URL de pago");

    // La referencia de Stripe solo se conoce ahora. Si esto falla, el webhook
    // todavía puede encontrar el pedido por `metadata.pedidoId`.
    if (pedidoId) {
      try {
        await anotarSesionStripe(pedidoId, session.id);
      } catch (err) {
        console.error(
          "[checkout] no se pudo anotar la referencia de Stripe:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Stripe rechazó la sesión", err);
    return json(
      { error: "No hemos podido abrir el pago. Inténtalo de nuevo." },
      502,
    );
  }
};
