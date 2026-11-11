import { describe, expect, it, vi, beforeEach } from "vitest";

const enviarMock = vi.fn();
const loteMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: enviarMock };
    batch = { send: loteMock };
  },
}));

const reservarAvisoCupo = vi.fn();
vi.mock("~/lib/db/avisos-cupo", () => ({ reservarAvisoCupo }));

beforeEach(() => {
  enviarMock.mockReset();
  loteMock.mockReset();
  reservarAvisoCupo.mockReset().mockResolvedValue(true);
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe("enviarCorreo", () => {
  it("no revienta si falta la clave: devuelve error y no llama al proveedor", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { enviarCorreo } = await import("~/lib/email/enviar");

    const r = await enviarCorreo({
      para: "a@b.com",
      asunto: "Hola",
      texto: "Qué tal",
    });

    expect(r.ok).toBe(false);
    expect(enviarMock).not.toHaveBeenCalled();
  });

  it("manda con el remitente de la configuración", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ORDER_FROM_EMAIL", "web@hornosanlorenzo.com");
    enviarMock.mockResolvedValue({ data: { id: "1" }, error: null });
    const { enviarCorreo } = await import("~/lib/email/enviar");

    const r = await enviarCorreo({
      para: "a@b.com",
      asunto: "Hola",
      texto: "Qué tal",
    });

    expect(r.ok).toBe(true);
    expect(enviarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "web@hornosanlorenzo.com",
        to: "a@b.com",
      }),
    );
  });
});

describe("enviarLote", () => {
  const correos = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ para: `c${i}@b.com`, asunto: "Oferta", texto: "…" }));

  it("sin clave no llama al proveedor", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const { enviarLote } = await import("~/lib/email/enviar");
    const r = await enviarLote(correos(3));
    expect(r).toMatchObject({ ok: false, enviados: 0 });
    expect(loteMock).not.toHaveBeenCalled();
  });

  it("parte en lotes de 100", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ORDER_FROM_EMAIL", "web@hornosanlorenzo.com");
    loteMock.mockResolvedValue({ data: {}, error: null });
    const { enviarLote } = await import("~/lib/email/enviar");
    const r = await enviarLote(correos(230));
    expect(r).toEqual({ ok: true, enviados: 230 });
    expect(loteMock.mock.calls.map((c) => c[0].length)).toEqual([100, 100, 30]);
  });

  it("si un lote falla, para y dice cuántos salieron", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ORDER_FROM_EMAIL", "web@hornosanlorenzo.com");
    loteMock
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "x" } });
    const { enviarLote } = await import("~/lib/email/enviar");
    const r = await enviarLote(correos(250));
    expect(r).toMatchObject({ ok: false, enviados: 100 });
    expect(loteMock).toHaveBeenCalledTimes(2);
  });
});

describe("enviarCorreo — aviso de cupo de Resend", () => {
  function configurar() {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("ORDER_FROM_EMAIL", "pedidos@hornosanlorenzo.com");
    vi.stubEnv("ORDER_NOTIFICATION_EMAIL", "info@hornosanlorenzo.com");
  }

  it("por debajo del umbral no avisa ni toca la base", async () => {
    configurar();
    enviarMock.mockResolvedValue({ data: { id: "1" }, error: null, headers: { "x-resend-daily-quota": "12", "x-resend-monthly-quota": "300" } });
    const { enviarCorreo } = await import("~/lib/email/enviar");
    await enviarCorreo({ para: "a@b.com", asunto: "Pedido", texto: "x" });
    expect(enviarMock).toHaveBeenCalledTimes(1);
    expect(reservarAvisoCupo).not.toHaveBeenCalled();
  });

  it("al pasar el umbral avisa una vez a cada destino de AVISO_CUPO_EMAIL, sin volver a vigilar", async () => {
    configurar();
    vi.stubEnv("AVISO_CUPO_EMAIL", "info@hornosanlorenzo.com, otro@example.com");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    enviarMock.mockResolvedValue({ data: { id: "1" }, error: null, headers: { "x-resend-daily-quota": "85", "x-resend-monthly-quota": "900" } });
    const { enviarCorreo } = await import("~/lib/email/enviar");
    const r = await enviarCorreo({ para: "a@b.com", asunto: "Pedido", texto: "x" });

    expect(r.ok).toBe(true);
    expect(reservarAvisoCupo).toHaveBeenCalledTimes(1);
    expect(reservarAvisoCupo.mock.calls[0][0]).toMatch(/^dia:/);
    const destinos = enviarMock.mock.calls.slice(1).map((c) => c[0].to);
    expect(destinos).toEqual(["info@hornosanlorenzo.com", "otro@example.com"]);
    expect(enviarMock.mock.calls[1][0].subject).toContain("85 de 100");
  });

  it("si el aviso de ese día ya salió, no lo repite", async () => {
    configurar();
    reservarAvisoCupo.mockResolvedValue(false);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    enviarMock.mockResolvedValue({ data: { id: "1" }, error: null, headers: { "x-resend-daily-quota": "90" } });
    const { enviarCorreo } = await import("~/lib/email/enviar");
    await enviarCorreo({ para: "a@b.com", asunto: "Pedido", texto: "x" });
    expect(enviarMock).toHaveBeenCalledTimes(1);
  });

  it("si la base falla al apuntar el aviso, el envío original sigue saliendo bien", async () => {
    configurar();
    reservarAvisoCupo.mockRejectedValue(new Error("caída"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    enviarMock.mockResolvedValue({ data: { id: "1" }, error: null, headers: { "x-resend-daily-quota": "90" } });
    const { enviarCorreo } = await import("~/lib/email/enviar");
    const r = await enviarCorreo({ para: "a@b.com", asunto: "Pedido", texto: "x" });
    expect(r.ok).toBe(true);
  });
});
