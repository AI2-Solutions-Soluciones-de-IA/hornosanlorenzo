import { describe, expect, it, vi, beforeEach } from "vitest";

const enviarMock = vi.fn();
const loteMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: enviarMock };
    batch = { send: loteMock };
  },
}));

beforeEach(() => {
  enviarMock.mockReset();
  loteMock.mockReset();
  vi.resetModules();
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
