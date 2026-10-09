import { describe, expect, it, vi, beforeEach } from "vitest";

const crearPedidoIniciado = vi.fn();
const anotarSesionStripe = vi.fn();
vi.mock("~/lib/db/pedidos", () => ({
  crearPedidoIniciado,
  anotarSesionStripe,
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

const sessionsCreate = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { create: sessionsCreate } };
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

  describe("sin STRIPE_SECRET_KEY (modo sin pago, mientras no haya claves)", () => {
    beforeEach(() => vi.stubEnv("STRIPE_SECRET_KEY", ""));

    it("anota el pedido como `sin_pago` con los precios del servidor y manda a /pedido/anotado", async () => {
      const { POST } = await import("~/pages/api/checkout");
      const respuesta = await POST(contexto() as never);

      expect(respuesta.status).toBe(200);
      expect(await respuesta.json()).toEqual({ url: "/pedido/anotado" });
      expect(priceOrder).toHaveBeenCalledOnce();
      expect(crearPedidoIniciado).toHaveBeenCalledWith(PEDIDO_VALORADO, {
        estado: "sin_pago",
        // Sin User-Agent en la petición de prueba: cuenta como ordenador.
        dispositivo: "ordenador",
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
