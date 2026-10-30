import { describe, expect, it, vi, beforeEach } from "vitest";

const crearPedidoIniciado = vi.fn();
const anotarSesionStripe = vi.fn();
const numeroDePedido = vi.fn().mockResolvedValue(12);
vi.mock("~/lib/db/pedidos", () => ({
  crearPedidoIniciado,
  anotarSesionStripe,
  numeroDePedido,
}));

const priceOrder = vi.fn();
vi.mock("~/lib/pedido", async (original) => ({
  ...(await original<typeof import("~/lib/pedido")>()),
  priceOrder,
}));

// El `original()` de arriba carga el `pedido.ts` real para quedarse con sus
// otros exports (`OrderError`, `destinationLabel`...), y ese módulo importa
// ahora `~/lib/db/productos`, que a su vez abre el pool de Postgres al
// cargarse. Esta prueba nunca llama a `productosParaPedido` —`priceOrder`
// está doblado entero, así que no llega ni a usarse— pero sin este doble el
// fichero fallaría al cargar en cualquier entorno sin `DATABASE_URL`.
vi.mock("~/lib/db/productos", () => ({ productosParaPedido: vi.fn() }));

const sesionesQueCerrar = vi.fn();
vi.mock("~/lib/db/capacidad", () => ({ sesionesQueCerrar, unidadesEncargadas: vi.fn() }));

const sessionsCreate = vi.fn();
const sessionsExpire = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: sessionsCreate, expire: sessionsExpire } };
  },
}));

const PEDIDO_VALORADO = {
  lines: [
    {
      slug: "croissant",
      name: "Croissant",
      qty: 1,
      unitPriceCents: 190,
      totalCents: 190,
    },
  ],
  subtotalCents: 190,
  shippingCents: 0,
  totalCents: 190,
  payload: {
    items: [{ slug: "croissant", qty: 1 }],
    mode: "recogida",
    dateISO: "2026-09-20",
    slot: "morning",
    storeId: "alcobendas",
    email: "cliente@example.com",
    phone: "666123456",
  },
};

const peticion = () =>
  new Request("https://ejemplo.test/api/checkout", {
    method: "POST",
    body: JSON.stringify(PEDIDO_VALORADO.payload),
  });

const contexto = () => ({
  request: peticion(),
  url: new URL("https://ejemplo.test/api/checkout"),
  locals: { usuario: null },
});

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
  crearPedidoIniciado.mockReset().mockResolvedValue("pedido-1");
  anotarSesionStripe.mockReset().mockResolvedValue(undefined);
  priceOrder.mockReset().mockResolvedValue(PEDIDO_VALORADO);
  sesionesQueCerrar.mockReset().mockResolvedValue([]);
  sessionsExpire.mockReset().mockResolvedValue({});
  sessionsCreate
    .mockReset()
    .mockResolvedValue({ id: "cs_test_1", url: "https://stripe.test/pagar" });
});

describe("POST /api/checkout", () => {
  it("las elecciones y la foto de un pack llegan tal cual a priceOrder", async () => {
    const items = [
      {
        slug: "pack-cumpleanos",
        qty: 1,
        opciones: { empanada: "empanada-de-carne", plancha: "plancha-oreo" },
        fotoUrl:
          "https://abc.public.blob.vercel-storage.com/pedidos-fotos/foto-x.jpg",
      },
    ];
    const { POST } = await import("~/pages/api/checkout");
    const respuesta = await POST({
      ...contexto(),
      request: new Request("https://ejemplo.test/api/checkout", {
        method: "POST",
        body: JSON.stringify({ ...PEDIDO_VALORADO.payload, items }),
      }),
    } as never);

    expect(respuesta.status).toBe(200);
    // Si el esquema no las conociera, Zod las descartaría en silencio y el
    // pack se valoraría sin elecciones.
    expect(priceOrder.mock.calls[0][0].items).toEqual(items);
  });

  it("anota el pedido y manda su id en los metadatos de Stripe", async () => {
    const { POST } = await import("~/pages/api/checkout");
    const respuesta = await POST(contexto() as never);

    expect(respuesta.status).toBe(200);
    expect(crearPedidoIniciado).toHaveBeenCalledOnce();
    expect(sessionsCreate.mock.calls[0][0].metadata.pedidoId).toBe("pedido-1");
    expect(anotarSesionStripe).toHaveBeenCalledWith("pedido-1", "cs_test_1");
  });

  it("si Postgres falla, se cobra igual: no se puede perder una venta por eso", async () => {
    crearPedidoIniciado.mockRejectedValue(
      new Error("Connection terminated unexpectedly"),
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { POST } = await import("~/pages/api/checkout");
    const respuesta = await POST(contexto() as never);

    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({
      url: "https://stripe.test/pagar",
    });
    // Sin pedido anotado, el metadato va vacío y el webhook lo reconstruirá.
    expect(sessionsCreate.mock.calls[0][0].metadata.pedidoId).toBe("");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("con la venta online en pausa, 503 y ni se valora ni se anota el pedido", async () => {
    vi.stubEnv("VENTA_ONLINE_PAUSADA", "1");
    const { POST } = await import("~/pages/api/checkout");
    const respuesta = await POST(contexto() as never);

    expect(respuesta.status).toBe(503);
    expect(priceOrder).not.toHaveBeenCalled();
    expect(crearPedidoIniciado).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  describe("sin STRIPE_SECRET_KEY (modo sin pago, mientras no haya claves)", () => {
    beforeEach(() => vi.stubEnv("STRIPE_SECRET_KEY", ""));

    it("anota el pedido como `sin_pago` con los precios del servidor y manda a /pedido/anotado", async () => {
      const { POST } = await import("~/pages/api/checkout");
      const respuesta = await POST(contexto() as never);

      expect(respuesta.status).toBe(200);
      // Con el número de pedido, para enseñárselo al cliente.
      expect(await respuesta.json()).toEqual({ url: "/pedido/anotado?n=12" });
      expect(priceOrder).toHaveBeenCalledOnce();
      expect(crearPedidoIniciado).toHaveBeenCalledWith(PEDIDO_VALORADO, {
        estado: "sin_pago",
        // Sin User-Agent en la petición de prueba: cuenta como ordenador.
        dispositivo: "ordenador",
        comprobarHueco: true,
      });
      expect(sessionsCreate).not.toHaveBeenCalled();
    });

    it("si Postgres falla aquí no hay cobro que salvar: 500 y el carrito se queda", async () => {
      crearPedidoIniciado.mockRejectedValue(new Error("Connection terminated"));
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { POST } = await import("~/pages/api/checkout");
      const respuesta = await POST(contexto() as never);

      expect(respuesta.status).toBe(500);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("un pedido mal formado sigue siendo 400, no se anota nada", async () => {
      const { POST } = await import("~/pages/api/checkout");
      const respuesta = await POST({
        ...contexto(),
        request: new Request("https://ejemplo.test/api/checkout", {
          method: "POST",
          body: "{}",
        }),
      } as never);
      expect(respuesta.status).toBe(400);
      expect(crearPedidoIniciado).not.toHaveBeenCalled();
    });
  });
});

describe("capacidad del día al pagar", () => {
  it("si el día se ha llenado entre medias, 409 y no se abre el pago", async () => {
    const { OrderError } = await import("~/lib/pedido");
    crearPedidoIniciado.mockRejectedValue(new OrderError("Ese día ya no nos caben tantos encargos.", 409));
    const { POST } = await import("~/pages/api/checkout");
    const res = await POST(contexto() as never);
    expect(res.status).toBe(409);
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("pide comprobar el hueco, la página caduca a los 31 minutos y volver suelta la reserva", async () => {
    const { POST } = await import("~/pages/api/checkout");
    const antes = Math.floor(Date.now() / 1000);
    await POST(contexto() as never);
    expect(crearPedidoIniciado.mock.calls[0][1]).toMatchObject({ comprobarHueco: true });
    const args = sessionsCreate.mock.calls[0][0];
    expect(args.expires_at - antes).toBeGreaterThanOrEqual(31 * 60);
    expect(args.expires_at - antes).toBeLessThan(32 * 60);
    expect(args.cancel_url).toMatch(/\/carrito\?soltar=pedido-1$/);
  });

  it("cierra las páginas de pago de reservas vencidas si el día va justo", async () => {
    sesionesQueCerrar.mockResolvedValue(["cs_vieja"]);
    const { POST } = await import("~/pages/api/checkout");
    const res = await POST(contexto() as never);
    expect(res.status).toBe(200);
    expect(sessionsExpire).toHaveBeenCalledWith("cs_vieja");
  });
});
