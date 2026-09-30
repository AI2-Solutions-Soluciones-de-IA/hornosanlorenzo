import { describe, expect, it, vi, beforeEach } from "vitest";

const head = vi.fn();
class BlobNotFoundError extends Error {}
vi.mock("@vercel/blob", () => ({ head, BlobNotFoundError }));

const handleUpload = vi.fn();
vi.mock("@vercel/blob/client", () => ({ handleUpload }));

const FOTO =
  "https://abc123.public.blob.vercel-storage.com/pedidos-fotos/foto-cliente-x1.jpg";

beforeEach(() => {
  head.mockReset();
  handleUpload.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("esFotoDePedido", () => {
  it.each([
    ["otro dominio", "https://evil.com/pedidos-fotos/a.jpg"],
    [
      "otra carpeta",
      "https://xxx.public.blob.vercel-storage.com/productos/a.webp",
    ],
    [
      "http sin cifrar",
      "http://xxx.public.blob.vercel-storage.com/pedidos-fotos/a.jpg",
    ],
    ["no es una URL", "esto no es una url"],
  ])("rechaza %s sin llamar a la red", async (_caso, url) => {
    const { esFotoDePedido } = await import("./fotos-pedido");
    expect(await esFotoDePedido(url)).toBe(false);
    expect(head).not.toHaveBeenCalled();
  });

  it("acepta una foto de nuestra carpeta que existe", async () => {
    head.mockResolvedValue({});
    const { esFotoDePedido } = await import("./fotos-pedido");
    expect(await esFotoDePedido(FOTO)).toBe(true);
    expect(head).toHaveBeenCalledWith(FOTO);
  });

  it("rechaza sin ruido cuando el fichero no existe", async () => {
    head.mockRejectedValue(new BlobNotFoundError("no existe"));
    const { esFotoDePedido } = await import("./fotos-pedido");
    expect(await esFotoDePedido(FOTO)).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("rechaza y deja rastro cuando falla otra cosa (token, red, otro almacén)", async () => {
    head.mockRejectedValue(new Error("Access denied"));
    const { esFotoDePedido } = await import("./fotos-pedido");
    expect(await esFotoDePedido(FOTO)).toBe(false);
    expect(console.error).toHaveBeenCalledOnce();
  });
});

describe("atenderSubida", () => {
  async function opciones() {
    handleUpload.mockResolvedValue({ type: "blob.generate-client-token" });
    const { atenderSubida } = await import("./fotos-pedido");
    const body = { type: "blob.generate-client-token" };
    const request = new Request("https://x.test/api/foto-pedido");
    expect(await atenderSubida(request, body)).toEqual({
      type: "blob.generate-client-token",
    });
    return handleUpload.mock.calls[0][0];
  }

  it("pasa el request y el cuerpo a handleUpload", async () => {
    const o = await opciones();
    expect(o.body).toEqual({ type: "blob.generate-client-token" });
    expect(o.request).toBeInstanceOf(Request);
  });

  it("solo da token para fotos de la carpeta, con tipos y tamaño acotados", async () => {
    const { onBeforeGenerateToken } = await opciones();
    const conf = await onBeforeGenerateToken(
      "pedidos-fotos/foto-cliente.png",
      null,
      false,
    );
    expect(conf.allowedContentTypes).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    expect(conf.maximumSizeInBytes).toBe(20 * 1024 * 1024);
    expect(conf.addRandomSuffix).toBe(true);
    expect(conf.allowOverwrite).toBe(false);
    expect(conf.validUntil).toBeGreaterThan(Date.now());
    expect(conf.validUntil).toBeLessThanOrEqual(Date.now() + 10 * 60 * 1000);
  });

  it.each([
    "productos/a.webp",
    "pedidos-fotos/../productos/a.jpg",
    "pedidos-fotos/sub/a.jpg",
    "pedidos-fotos/a.html",
    "pedidos-fotos/A.JPG",
    "pedidos-fotos/.jpg",
    "/pedidos-fotos/a.jpg",
  ])("rechaza la ruta %s", async (ruta) => {
    const { onBeforeGenerateToken } = await opciones();
    await expect(onBeforeGenerateToken(ruta, null, false)).rejects.toThrow();
  });
});
