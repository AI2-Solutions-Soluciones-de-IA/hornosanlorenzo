import { describe, expect, it, vi, beforeEach } from "vitest";
import type Stripe from "stripe";

const enviarCorreoMock = vi.fn();
vi.mock("~/lib/email/enviar", () => ({
  enviarCorreo: enviarCorreoMock,
}));

const marcarPagado = vi.fn();
const marcarAvisado = vi.fn();
const crearPedidoReconstruido = vi.fn();
const marcarDevuelto = vi.fn();
vi.mock("~/lib/db/pedidos", () => ({
  marcarPagado,
  marcarAvisado,
  crearPedidoReconstruido,
  marcarDevuelto,
}));

beforeEach(() => {
  enviarCorreoMock.mockReset();
  vi.resetModules();
  vi.unstubAllEnvs();
  marcarPagado
    .mockReset()
    .mockResolvedValue({ id: "pedido-1", notificadoEn: null });
  marcarAvisado.mockReset().mockResolvedValue(undefined);
  crearPedidoReconstruido
    .mockReset()
    .mockResolvedValue({ id: "pedido-2", notificadoEn: null });
});

function stripeConLineItems(
  items: { quantity: number; description: string; amount_total?: number }[],
) {
  return {
    checkout: {
      sessions: {
        listLineItems: vi.fn().mockResolvedValue({ data: items }),
      },
    },
  } as unknown as Stripe;
}

function sesionPagada(): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    amount_total: 2500,
    metadata: { modalidad: "recogida", dia: "sábado", franja: "mañana" },
    customer_details: { email: "cliente@example.com" },
  } as unknown as Stripe.Checkout.Session;
}

describe("notify — configuración de correo incompleta", () => {
  it("si falta una variable (aunque las otras dos estén), no llama a enviarCorreo y registra el pedido completo", async () => {
    // RESEND_API_KEY y ORDER_FROM_EMAIL configuradas; falta la del obrador.
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ORDER_NOTIFICATION_EMAIL", "");
    vi.stubEnv("ORDER_FROM_EMAIL", "web@hornosanlorenzo.com");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { notify } = await import("~/pages/api/webhook");
    await notify(
      stripeConLineItems([{ quantity: 1, description: "Tarta" }]),
      sesionPagada(),
    );

    // Ni el correo al obrador ni el del cliente se intentan: es todo o nada.
    expect(enviarCorreoMock).not.toHaveBeenCalled();

    // El pedido queda registrado para que no se pierda.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [mensaje] = warnSpy.mock.calls[0] as [string];
    expect(mensaje).toContain("Pedido pagado");
    expect(mensaje).toContain("cs_test_123");

    warnSpy.mockRestore();
  });
});

describe("notify — envío al obrador rechazado con configuración completa", () => {
  it("si el aviso al obrador falla (proveedor), no manda la confirmación al cliente y registra el pedido", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ORDER_NOTIFICATION_EMAIL", "obrador@hornosanlorenzo.com");
    vi.stubEnv("ORDER_FROM_EMAIL", "web@hornosanlorenzo.com");

    // El envío al obrador (la única llamada que debería producirse) falla
    // en el proveedor, aunque toda la configuración está bien puesta.
    enviarCorreoMock.mockResolvedValue({
      ok: false,
      error: "No se pudo enviar el correo.",
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { notify } = await import("~/pages/api/webhook");
    await notify(
      stripeConLineItems([{ quantity: 1, description: "Tarta" }]),
      sesionPagada(),
    );

    // Solo se intenta el correo al obrador; el del cliente nunca se llama,
    // porque afirmaría algo falso («ya anotado en el obrador»).
    expect(enviarCorreoMock).toHaveBeenCalledTimes(1);
    expect(enviarCorreoMock).toHaveBeenCalledWith(
      expect.objectContaining({ para: "obrador@hornosanlorenzo.com" }),
    );

    // El pedido queda registrado para que no se pierda.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [mensaje] = warnSpy.mock.calls[0] as [string];
    expect(mensaje).toContain("Pedido pagado");
    expect(mensaje).toContain("cs_test_123");

    warnSpy.mockRestore();
  });
});

describe("anotarPago — el pedido queda escrito", () => {
  it("marca pagado por la referencia del pedido, no solo por la de Stripe", async () => {
    const { anotarPago } = await import("~/pages/api/webhook");
    const sesion = sesionPagada();
    sesion.metadata = { ...sesion.metadata, pedidoId: "pedido-1" };

    const anotado = await anotarPago(stripeConLineItems([]), sesion);

    expect(marcarPagado).toHaveBeenCalledWith({
      pedidoId: "pedido-1",
      sessionId: "cs_test_123",
    });
    expect(crearPedidoReconstruido).not.toHaveBeenCalled();
    expect(anotado).toEqual({ id: "pedido-1", notificadoEn: null });
  });

  it("si el pedido no está en la base de datos, lo reconstruye desde Stripe", async () => {
    marcarPagado.mockResolvedValue(null);
    const { anotarPago } = await import("~/pages/api/webhook");

    const anotado = await anotarPago(
      stripeConLineItems([
        { quantity: 2, description: "Croissant", amount_total: 380 },
      ]),
      sesionPagada(),
    );

    expect(crearPedidoReconstruido).toHaveBeenCalledOnce();
    const datos = crearPedidoReconstruido.mock.calls[0][0];
    expect(datos.stripeSessionId).toBe("cs_test_123");
    expect(datos.lineas).toEqual([
      { nombre: "Croissant", qty: 2, unitPriceCents: 190 },
    ]);
    // Esta sesión solo lleva los metadatos de LECTURA («recogida», «sábado»),
    // no los crudos: lo que no se sabe se guarda como nulo, y el panel lo
    // enseña como «sin datos». Nunca 'recogida' + la fecha de hoy, que es lo
    // que se escribía antes y se leía como un hecho.
    expect(datos.mode).toBeNull();
    expect(datos.fechaEntrega).toBeNull();
    // Encadenado con `?.`: `anotarPago` devuelve `PedidoAnotado | null` por
    // firma (el catch puede devolver null), así que TS en modo estricto
    // exige la comprobación aunque en esta rama concreta no pueda serlo.
    expect(anotado?.id).toBe("pedido-2");
  });

  it("reconstruye con la entrega que venía en los metadatos, sin inventarse nada", async () => {
    marcarPagado.mockResolvedValue(null);
    const { anotarPago } = await import("~/pages/api/webhook");
    const sesion = sesionPagada();
    // Los metadatos crudos que escribe `checkout.ts` junto a los de lectura.
    sesion.metadata = {
      ...sesion.metadata,
      entregaModo: "domicilio",
      entregaFecha: "2026-12-24",
      entregaFranja: "",
      entregaTienda: "",
      entregaDireccion: "Calle de la Prueba 1",
      entregaCP: "28100",
    };

    await anotarPago(stripeConLineItems([]), sesion);

    const datos = crearPedidoReconstruido.mock.calls[0][0];
    expect(datos.mode).toBe("domicilio");
    expect(datos.fechaEntrega).toBe("2026-12-24");
    expect(datos.address).toBe("Calle de la Prueba 1");
    expect(datos.postalCode).toBe("28100");
    // La franja vacía no es "" en la columna: es nulo.
    expect(datos.slot).toBeNull();
    expect(datos.storeId).toBeNull();
  });

  it("un metadato con basura no llega a la tabla: se queda en nulo", async () => {
    marcarPagado.mockResolvedValue(null);
    const { anotarPago } = await import("~/pages/api/webhook");
    const sesion = sesionPagada();
    sesion.metadata = {
      ...sesion.metadata,
      entregaModo: "Recogida en tienda", // el texto de lectura, no el crudo
      entregaFecha: "24/12/2026", // formateado, no ISO
      entregaCP: "281", // a medias
    };

    await anotarPago(stripeConLineItems([]), sesion);

    const datos = crearPedidoReconstruido.mock.calls[0][0];
    expect(datos.mode).toBeNull();
    expect(datos.fechaEntrega).toBeNull();
    expect(datos.postalCode).toBeNull();
  });

  it("un fallo de Postgres no tumba el aviso: devuelve null y sigue", async () => {
    marcarPagado.mockRejectedValue(
      new Error("Connection terminated unexpectedly"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { anotarPago } = await import("~/pages/api/webhook");

    expect(await anotarPago(stripeConLineItems([]), sesionPagada())).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});

describe("POST /api/webhook — reintentos de Stripe", () => {
  it("si el pedido ya constaba avisado, no vuelve a mandar el correo", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ORDER_NOTIFICATION_EMAIL", "pedidos@example.com");
    vi.stubEnv("ORDER_FROM_EMAIL", "web@example.com");
    marcarPagado.mockResolvedValue({
      id: "pedido-1",
      notificadoEn: new Date(),
    });

    const { yaAvisado } = await import("~/pages/api/webhook");

    // La decisión vive en una función pura para poder fijarla sin montar
    // toda la petición firmada de Stripe.
    expect(yaAvisado({ id: "pedido-1", notificadoEn: new Date() })).toBe(true);
    expect(yaAvisado({ id: "pedido-1", notificadoEn: null })).toBe(false);
    expect(yaAvisado(null)).toBe(false);
    expect(enviarCorreoMock).not.toHaveBeenCalled();
  });
});

describe("etiquetaPagoEnStripe", () => {
  it("pone el número de pedido y la referencia en la descripción del pago", async () => {
    const { etiquetaPagoEnStripe } = await import("~/pages/api/webhook");
    const update = vi.fn().mockResolvedValue({});
    const stripe = { paymentIntents: { update } } as unknown as Stripe;
    await etiquetaPagoEnStripe(
      stripe,
      { id: "cs_test_1", payment_intent: "pi_123" } as unknown as Stripe.Checkout.Session,
      { id: "a6bf584a-0000-0000-0000-000000000000", notificadoEn: null, numero: 14 },
    );
    expect(update).toHaveBeenCalledWith("pi_123", {
      description: "Horno San Lorenzo · Pedido nº 14 · Ref. a6bf584a",
      metadata: { pedidoId: "a6bf584a-0000-0000-0000-000000000000", numero: "14" },
    });
  });

  it("sin pago o si Stripe falla, no rompe nada", async () => {
    const { etiquetaPagoEnStripe } = await import("~/pages/api/webhook");
    const update = vi.fn().mockRejectedValue(new Error("caído"));
    const stripe = { paymentIntents: { update } } as unknown as Stripe;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await etiquetaPagoEnStripe(stripe, { id: "cs_1" } as unknown as Stripe.Checkout.Session, { id: "x", notificadoEn: null });
    expect(update).not.toHaveBeenCalled();
    await expect(
      etiquetaPagoEnStripe(stripe, { id: "cs_1", payment_intent: "pi_1" } as unknown as Stripe.Checkout.Session, { id: "x", notificadoEn: null }),
    ).resolves.toBeUndefined();
  });
});

describe("anotarDevolucion", () => {
  it("busca la sesión del cobro y apunta lo devuelto en total", async () => {
    const { anotarDevolucion } = await import("~/pages/api/webhook");
    const list = vi.fn().mockResolvedValue({ data: [{ id: "cs_test_9" }] });
    const stripe = { checkout: { sessions: { list } } } as unknown as Stripe;
    marcarDevuelto.mockReset().mockResolvedValue({ id: "p9", numero: 9 });
    vi.spyOn(console, "info").mockImplementation(() => {});
    const r = await anotarDevolucion(stripe, { payment_intent: "pi_9", amount_refunded: 500 } as unknown as Stripe.Charge);
    expect(r.status).toBe(200);
    expect(list).toHaveBeenCalledWith({ payment_intent: "pi_9", limit: 1 });
    expect(marcarDevuelto).toHaveBeenCalledWith("cs_test_9", 500);
  });

  it("si la base de datos falla, 500 para que Stripe lo reintente", async () => {
    const { anotarDevolucion } = await import("~/pages/api/webhook");
    const stripe = { checkout: { sessions: { list: vi.fn().mockResolvedValue({ data: [{ id: "cs_1" }] }) } } } as unknown as Stripe;
    marcarDevuelto.mockReset().mockRejectedValue(new Error("caída"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await anotarDevolucion(stripe, { payment_intent: "pi_1", amount_refunded: 100 } as unknown as Stripe.Charge);
    expect(r.status).toBe(500);
  });
});
