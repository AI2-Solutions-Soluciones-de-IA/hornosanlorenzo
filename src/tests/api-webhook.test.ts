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
const pedidoPorId = vi.fn();
vi.mock("~/lib/db/pedidos", () => ({
  marcarPagado,
  marcarAvisado,
  crearPedidoReconstruido,
  marcarDevuelto,
  pedidoPorId,
}));

beforeEach(() => {
  enviarCorreoMock.mockReset();
  vi.resetModules();
  vi.unstubAllEnvs();
  marcarPagado
    .mockReset()
    .mockResolvedValue({ id: "pedido-1", notificadoEn: null });
  marcarAvisado.mockReset().mockResolvedValue(undefined);
  pedidoPorId.mockReset().mockResolvedValue(null);
  crearPedidoReconstruido
    .mockReset()
    .mockResolvedValue({ id: "pedido-2", notificadoEn: null });
});

function stripeConLineItems(
  items: {
    quantity: number;
    description: string;
    amount_total?: number;
    price?: { product: { description: string | null; deleted?: boolean } };
  }[],
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
      description: "Horno San Lorenzo · Ref. a6bf584a",
      metadata: { pedidoId: "a6bf584a-0000-0000-0000-000000000000" },
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

describe("notify — con todo configurado", () => {
  it("manda el aviso al obrador y la confirmación al cliente, en HTML y con a quién responder", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ORDER_NOTIFICATION_EMAIL", "info@hornosanlorenzo.com");
    vi.stubEnv("ORDER_FROM_EMAIL", "Horno San Lorenzo <pedidos@hornosanlorenzo.com>");
    enviarCorreoMock.mockResolvedValue({ ok: true });

    const { notify } = await import("~/pages/api/webhook");
    const avisado = await notify(
      stripeConLineItems([{ quantity: 2, description: "Tarta", amount_total: 2500 }]),
      sesionPagada(),
    );

    expect(avisado).toBe(true);
    expect(enviarCorreoMock).toHaveBeenCalledTimes(2);
    const [obrador, cliente] = enviarCorreoMock.mock.calls.map((c) => c[0]);
    expect(obrador).toMatchObject({ para: "info@hornosanlorenzo.com", responderA: "cliente@example.com" });
    expect(obrador.asunto).not.toContain("nº");
    expect(obrador.html).toContain("2 × Tarta");
    expect(cliente).toMatchObject({ para: "cliente@example.com", responderA: "info@hornosanlorenzo.com" });
    expect(cliente.html).not.toContain("número de pedido");
  });
});

describe("correo de un pack: el obrador ve qué lleva", () => {
  const PACK = {
    id: "pedido-1",
    reconstruido: false,
    envioCents: 600,
    lineas: [
      {
        slug: "pack-cumpleanos",
        nombre: "Pack Cumpleaños",
        varianteLabel: null,
        qty: 1,
        unitPriceCents: 6900,
        detalle: [
          { slug: "empanada-de-carne", nombre: "Empanada de carne", varianteLabel: "Entera", qty: 1 },
          { slug: "tarta-retrato", nombre: "Foto comestible", varianteLabel: null, qty: 1 },
        ],
        fotoUrl: "https://blob.example/foto.jpg",
      },
    ],
  };

  function configurarCorreo() {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ORDER_NOTIFICATION_EMAIL", "info@hornosanlorenzo.com");
    vi.stubEnv("ORDER_FROM_EMAIL", "Horno San Lorenzo <pedidos@hornosanlorenzo.com>");
    enviarCorreoMock.mockResolvedValue({ ok: true });
  }

  it("con el pedido en la base: piezas, foto (solo al obrador) y reparto", async () => {
    configurarCorreo();
    pedidoPorId.mockResolvedValue(PACK);
    const { notify } = await import("~/pages/api/webhook");
    const stripe = stripeConLineItems([]);
    await notify(stripe, sesionPagada(), "pedido-1");

    expect(pedidoPorId).toHaveBeenCalledWith("pedido-1");
    expect(stripe.checkout.sessions.listLineItems).not.toHaveBeenCalled();
    const [obrador, cliente] = enviarCorreoMock.mock.calls.map((c) => c[0]);
    expect(obrador.texto).toContain("Empanada de carne · Entera");
    expect(obrador.texto).toContain("Foto del cliente: https://blob.example/foto.jpg");
    expect(obrador.texto).toContain("Reparto a domicilio");
    expect(obrador.html).toContain("<li>Empanada de carne · Entera</li>");
    expect(obrador.html).toContain('href="https://blob.example/foto.jpg"');
    expect(cliente.html).toContain("<li>Empanada de carne · Entera</li>");
    expect(cliente.html).not.toContain("blob.example");
  });

  it("si la base falla, saca lo que lleva el pack de la descripción del producto en Stripe", async () => {
    configurarCorreo();
    pedidoPorId.mockRejectedValue(new Error("caída"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { notify } = await import("~/pages/api/webhook");
    const stripe = stripeConLineItems([
      {
        quantity: 1,
        description: "Pack Cumpleaños",
        amount_total: 6900,
        price: { product: { description: "Empanada de carne · Entera · Foto comestible" } },
      },
    ]);
    await notify(stripe, sesionPagada(), "pedido-1");

    expect(stripe.checkout.sessions.listLineItems).toHaveBeenCalledWith("cs_test_123", {
      limit: 50,
      expand: ["data.price.product"],
    });
    const obrador = enviarCorreoMock.mock.calls[0][0];
    expect(obrador.texto).toContain("    - Empanada de carne");
    expect(obrador.texto).toContain("    - Foto comestible");
  });

  it("un pedido reconstruido no usa la base (no tiene desglose), sino Stripe", async () => {
    configurarCorreo();
    pedidoPorId.mockResolvedValue({ ...PACK, reconstruido: true });
    const { notify } = await import("~/pages/api/webhook");
    const stripe = stripeConLineItems([{ quantity: 1, description: "Pack Cumpleaños", amount_total: 6900 }]);
    await notify(stripe, sesionPagada(), "pedido-1");
    expect(stripe.checkout.sessions.listLineItems).toHaveBeenCalled();
  });

  it("al reconstruir un pack, lo que lleva queda en el nombre de la línea", async () => {
    marcarPagado.mockResolvedValue(null);
    const { anotarPago } = await import("~/pages/api/webhook");
    await anotarPago(
      stripeConLineItems([
        {
          quantity: 1,
          description: "Pack Cumpleaños",
          amount_total: 6900,
          price: { product: { description: "Empanada de carne · Foto comestible" } },
        },
        { quantity: 2, description: "Roscón", amount_total: 3000, price: { product: { description: null } } },
      ]),
      sesionPagada(),
    );
    const { lineas } = crearPedidoReconstruido.mock.calls[0][0];
    expect(lineas[0].nombre).toBe(
      "Pack Cumpleaños (sin desglose; lleva: Empanada de carne · Foto comestible)",
    );
    expect(lineas[1]).toEqual({ nombre: "Roscón", qty: 2, unitPriceCents: 1500 });
  });
});

describe("destinoAviso: a quién va el aviso del pedido", () => {
  it("una recogida en Pozuelo, a la pastelería de Pozuelo; lo demás, al correo general", async () => {
    const { destinoAviso } = await import("~/pages/api/webhook");
    const general = "info@hornosanlorenzo.com";
    expect(destinoAviso({ entregaModo: "recogida", entregaTienda: "pozuelo" }, general)).toBe(
      "pasteleriapozuelo@hornosanlorenzo.com",
    );
    expect(destinoAviso({ entregaModo: "recogida", entregaTienda: "alcobendas" }, general)).toBe(general);
    expect(destinoAviso({ entregaModo: "domicilio" }, general)).toBe(general);
    expect(destinoAviso({}, general)).toBe(general);
  });

  it("sin el correo general configurado, Pozuelo sigue teniendo destino y lo demás no", async () => {
    const { destinoAviso } = await import("~/pages/api/webhook");
    expect(destinoAviso({ entregaModo: "recogida", entregaTienda: "pozuelo" }, undefined)).toBe(
      "pasteleriapozuelo@hornosanlorenzo.com",
    );
    expect(destinoAviso({ entregaModo: "domicilio" }, undefined)).toBeUndefined();
  });
});
