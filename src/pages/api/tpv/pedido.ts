import type { APIRoute } from "astro";
import { z } from "zod";
import {
  priceOrder,
  OrderError,
  destinationLabel,
  type PricedOrder,
} from "~/lib/pedido";
import { tpvPayloadSchema, aPedido } from "~/lib/tpv";
import {
  crearPedidoIniciado,
  pedidoPorId,
  type DestinoPedido,
} from "~/lib/db/pedidos";
import { destinosVisibles, vePedidos, veTpv } from "~/lib/auth/guardia";
import { destinoDePedido } from "~/lib/pedidos-excel";
import {
  correoCliente,
  correoObrador,
  type DatosPedido,
} from "~/lib/email/pedido";
import { enviarCorreo } from "~/lib/email/enviar";
import { destinoAviso, lineasDesdePedido } from "~/pages/api/webhook";
import { MODE_COPY, ENTREGA_DOMICILIO_COPY } from "~/lib/entrega";
import { formatDateISO } from "~/lib/format";
import { site } from "~/data/site";

/**
 * Registra un pedido tomado por teléfono desde el TPV (13-11-2026).
 *
 * Dos pasos con la misma petición: sin `confirmar`, si el pedido se salta
 * algún límite de la web (plazo, cupo, máximos…) devuelve 409 con los
 * avisos y no guarda nada; la oficina los lee y lo manda otra vez con
 * `confirmar: true`. Sin avisos se guarda a la primera.
 *
 * El precio lo pone el servidor, como en la web; solo lo de fuera de la
 * carta lleva el precio que escribe la oficina.
 */
export const prerender = false;

const cuerpoSchema = z.object({
  pedido: tpvPayloadSchema,
  confirmar: z.boolean().optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const usuario = locals.usuario;
  // El middleware ya corta; esta es la segunda llave.
  if (!vePedidos(usuario) || !veTpv(usuario))
    return new Response("No encontrado", { status: 404 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Petición mal formada." }, 400);
  }
  const parsed = cuerpoSchema.safeParse(raw);
  if (!parsed.success) {
    const campo = parsed.error.issues[0]?.path.at(-1);
    const porCampo: Record<string, string> = {
      name: "Escribe el nombre del cliente.",
      phone: "El teléfono no parece válido.",
      email: "El correo no parece válido (o déjalo vacío).",
      postalCode: "El código postal son cinco cifras.",
      nombre: "Escribe el nombre del producto fuera de carta.",
      precioCents: "Revisa el precio del producto fuera de carta.",
    };
    return json(
      { error: porCampo[String(campo)] ?? "Faltan datos del pedido." },
      400,
    );
  }
  const { pedido, confirmar } = parsed.data;
  const { payload, libres } = aPedido(pedido);

  let order: PricedOrder;
  try {
    order = await priceOrder(payload, { flexible: true, libres });
  } catch (err) {
    if (err instanceof OrderError)
      return json({ error: err.message }, err.status);
    console.error("[tpv] error al valorar el pedido", err);
    return json({ error: "No se ha podido preparar el pedido." }, 500);
  }

  if (order.avisos.length > 0 && !confirmar) {
    return json({ avisos: order.avisos, totalCents: order.totalCents }, 409);
  }

  const registradoPor = usuario?.name?.trim() || usuario?.email || "Oficina";
  let id: string;
  try {
    id = await crearPedidoIniciado(order, {
      estado: pedido.pagado ? "pagado" : "sin_pago",
      origen: "tpv",
      registradoPor,
    });
  } catch (err) {
    console.error(
      "[tpv] no se pudo guardar el pedido:",
      err instanceof Error ? err.message : err,
    );
    return json(
      { error: "No se ha podido guardar el pedido. Inténtalo otra vez." },
      500,
    );
  }

  // Los correos no pueden tumbar un pedido ya guardado: se intenta y se dice.
  const correos = await avisar(
    id,
    order,
    pedido.pagado,
    registradoPor,
    destinosVisibles(usuario),
  );

  return json({
    id,
    nombre: payload.name,
    totalCents: order.totalCents,
    correos,
  });
};

/**
 * La confirmación al cliente, si ha dado correo, y el aviso a la oficina
 * que lleva el pedido cuando no es quien lo ha apuntado (Pozuelo apunta una
 * recogida en Alcobendas, o el admin cualquiera): si no, no se enteraría
 * hasta abrir el panel.
 */
async function avisar(
  id: string,
  order: PricedOrder,
  pagado: boolean,
  registradoPor: string,
  propios: DestinoPedido[] | undefined,
): Promise<{ cliente: boolean | null; oficina: boolean | null }> {
  const p = order.payload;
  const res = {
    cliente: null as boolean | null,
    oficina: null as boolean | null,
  };
  try {
    const guardado = await pedidoPorId(id);
    if (!guardado) return res;
    const datos: DatosPedido = {
      totalCents: order.totalCents,
      lineas: lineasDesdePedido(guardado),
      modalidad: MODE_COPY[p.mode].label,
      dia: formatDateISO(p.dateISO),
      franja:
        p.mode === "domicilio"
          ? ENTREGA_DOMICILIO_COPY
          : p.slot === "afternoon"
            ? "tarde"
            : "mañana",
      destino: destinationLabel(p),
      aDomicilio: p.mode === "domicilio",
      tiendaId: p.storeId,
      nombre: p.name,
      email: p.email,
      telefono: p.phone,
      notas: p.notes,
      referencia: id.slice(0, 8),
      pagado,
      origen: "tpv",
      registradoPor,
    };

    const destino = destinoDePedido(guardado);
    const esSuyo =
      propios !== undefined && destino !== null && propios.includes(destino);
    const para = destinoAviso(
      { entregaModo: p.mode, entregaTienda: p.storeId ?? "" },
      import.meta.env.ORDER_NOTIFICATION_EMAIL,
    );
    if (!esSuyo && para) {
      const r = await enviarCorreo({
        para,
        ...correoObrador(datos),
        responderA: p.email || undefined,
      });
      res.oficina = r.ok;
    }

    if (p.email) {
      const r = await enviarCorreo({
        para: p.email,
        ...correoCliente(datos),
        responderA: site.email,
      });
      res.cliente = r.ok;
    }
  } catch (err) {
    console.error(
      "[tpv] no se pudieron mandar los correos:",
      err instanceof Error ? err.message : err,
    );
  }
  return res;
}
