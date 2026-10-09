import { describe, expect, it, vi, beforeEach } from "vitest";

const query = vi.fn();
vi.mock("~/lib/db/pool", () => ({ pool: { query } }));
const retrieve = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    checkout = { sessions: { retrieve } };
  },
}));

const ID = "a6bf584a-1111-2222-3333-444455556666";
const admin = { locals: { usuario: { id: "u", email: "a@b.c", name: "A", rol: "admin" } } };

async function llama(pedido = ID, extra = admin) {
  const { GET } = await import("~/pages/api/admin/pedidos/stripe");
  return GET({ url: new URL(`http://x/api/admin/pedidos/stripe?pedido=${pedido}`), ...extra } as never);
}

describe("Ver en Stripe", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    query.mockReset();
    retrieve.mockReset();
  });

  it("lleva a la página del pago, en modo de prueba si la sesión es de prueba", async () => {
    query.mockResolvedValue({ rows: [{ sesion: "cs_test_abc" }] });
    retrieve.mockResolvedValue({ payment_intent: "pi_123" });
    const r = await llama();
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("https://dashboard.stripe.com/test/payments/pi_123");
    expect(retrieve).toHaveBeenCalledWith("cs_test_abc");
  });

  it("un pedido sin pago de Stripe da 404, y quien no ve pedidos también", async () => {
    query.mockResolvedValue({ rows: [{ sesion: null }] });
    expect((await llama()).status).toBe(404);
    expect((await llama(ID, { locals: { usuario: null } } as never)).status).toBe(404);
  });
});
