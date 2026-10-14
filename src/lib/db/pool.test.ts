import { describe, expect, it, vi } from "vitest";

vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/x");
const { pool } = await import("~/lib/db/pool");

describe("pool", () => {
  it("un error en una conexión libre no tumba el proceso", () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    // Sin oyente de «error», `emit` lanza: es lo que tiraba el servidor.
    expect(() => pool.emit("error", new Error("read EADDRNOTAVAIL"))).not.toThrow();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
});
