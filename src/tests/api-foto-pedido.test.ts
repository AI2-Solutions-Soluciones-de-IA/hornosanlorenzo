import { describe, expect, it, vi, beforeEach } from "vitest";

const atenderSubida = vi.fn();
vi.mock("~/lib/storage/fotos-pedido", () => ({ atenderSubida }));

const permitirSubida = vi.fn();
vi.mock("~/lib/db/limites", () => ({ permitirSubida }));

const TOKEN = { type: "blob.generate-client-token" };

function peticion(body: unknown, cabeceras: Record<string, string> = {}) {
  return new Request("https://x.test/api/foto-pedido", {
    method: "POST",
    headers: { "content-type": "application/json", ...cabeceras },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  atenderSubida.mockReset();
  permitirSubida.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/foto-pedido", () => {
  it("con el límite agotado responde 429 en castellano y no toca el almacén", async () => {
    permitirSubida.mockResolvedValue(false);
    const { POST } = await import("~/pages/api/foto-pedido");
    const res = await POST({ request: peticion({ type: TOKEN.type }) } as never);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/Has subido muchas fotos/);
    expect(atenderSubida).not.toHaveBeenCalled();
  });

  it("dentro del límite devuelve lo que devuelva atenderSubida", async () => {
    permitirSubida.mockResolvedValue(true);
    atenderSubida.mockResolvedValue({ ...TOKEN, clientToken: "t" });
    const { POST } = await import("~/pages/api/foto-pedido");
    const res = await POST({ request: peticion(TOKEN) } as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ...TOKEN, clientToken: "t" });
  });

  it("si atenderSubida lanza, 400 sin detalles internos", async () => {
    permitirSubida.mockResolvedValue(true);
    atenderSubida.mockRejectedValue(new Error("secreto interno: token abc"));
    const { POST } = await import("~/pages/api/foto-pedido");
    const res = await POST({ request: peticion(TOKEN) } as never);
    expect(res.status).toBe(400);
    const texto = JSON.stringify(await res.json());
    expect(texto).toContain("No hemos podido preparar la subida");
    expect(texto).not.toContain("secreto");
  });

  it("un cuerpo que no es JSON da 400", async () => {
    const { POST } = await import("~/pages/api/foto-pedido");
    const res = await POST({
      request: new Request("https://x.test/api/foto-pedido", {
        method: "POST",
        body: "no json",
      }),
    } as never);
    expect(res.status).toBe(400);
    expect(atenderSubida).not.toHaveBeenCalled();
  });

  it("solo la petición de token gasta cupo: el aviso de subida completada no", async () => {
    atenderSubida.mockResolvedValue({ type: "blob.upload-completed" });
    const { POST } = await import("~/pages/api/foto-pedido");
    await POST({
      request: peticion({ type: "blob.upload-completed", payload: {} }),
    } as never);
    expect(permitirSubida).not.toHaveBeenCalled();
    expect(atenderSubida).toHaveBeenCalled();
  });

  it("la clave del límite es un hash de la IP, nunca la IP en claro", async () => {
    permitirSubida.mockResolvedValue(true);
    atenderSubida.mockResolvedValue(TOKEN);
    const { POST } = await import("~/pages/api/foto-pedido");
    await POST({
      request: peticion(TOKEN, { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
    } as never);
    const clave = permitirSubida.mock.calls[0][0];
    expect(clave).toMatch(/^[0-9a-f]{64}$/);
    expect(permitirSubida.mock.calls[0][1]).toEqual({
      max: 20,
      ventanaMs: 3_600_000,
    });
    // Misma IP con otro salto detrás del proxy: misma clave.
    permitirSubida.mockClear();
    await POST({
      request: peticion(TOKEN, { "x-forwarded-for": "203.0.113.7, 10.9.9.9" }),
    } as never);
    expect(permitirSubida.mock.calls[0][0]).toBe(clave);
  });
});
