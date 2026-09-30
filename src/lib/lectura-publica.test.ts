import { describe, expect, it, vi } from "vitest";

const todasLasDefiniciones = vi.fn();
vi.mock("~/lib/db/packs", () => ({ todasLasDefiniciones }));
vi.mock("~/lib/db/productos", () => ({ listarProductos: vi.fn() }));
vi.mock("~/lib/db/noticias", () => ({ listarNoticias: vi.fn() }));

const { definicionesPublicas } = await import("~/lib/lectura-publica");

// Foco de revisión 5: si Postgres falla al leer las definiciones, la página
// pinta los packs como no disponibles y esa respuesta NO se guarda en ISR.
describe("definicionesPublicas", () => {
  it("devuelve las definiciones y no toca la caché", async () => {
    const mapa = new Map([["pack-x", { slug: "pack-x" }]]);
    todasLasDefiniciones.mockResolvedValueOnce(mapa);
    const respuesta = { headers: new Headers() };
    await expect(definicionesPublicas(respuesta)).resolves.toBe(mapa);
    expect(respuesta.headers.get("cache-control")).toBeNull();
  });

  it("si Postgres falla: mapa vacío y no-store", async () => {
    todasLasDefiniciones.mockRejectedValueOnce(new Error("ECONNRESET"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const respuesta = { headers: new Headers() };
    const defs = await definicionesPublicas(respuesta);
    expect(defs.size).toBe(0);
    expect(respuesta.headers.get("cache-control")).toBe("no-store");
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
