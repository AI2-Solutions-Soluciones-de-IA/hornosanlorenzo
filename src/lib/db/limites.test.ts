import { describe, expect, it, beforeAll, afterAll } from "vitest";

const URL_PRUEBAS = process.env.DATABASE_URL_TEST;
const describeSiHayBD = URL_PRUEBAS ? describe : describe.skip;

describeSiHayBD("límite de subidas", () => {
  let pool: import("pg").Pool;
  let permitirSubida: typeof import("~/lib/db/limites").permitirSubida;
  // Prefijo propio: Vitest corre los ficheros en paralelo contra la misma rama.
  const A = "test-limites-a";
  const B = "test-limites-b";
  const opciones = { max: 2, ventanaMs: 60_000 };

  const limpiar = () =>
    pool.query("delete from limite_subidas where clave like 'test-limites-%'");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    ({ pool } = await import("~/lib/db/pool"));
    ({ permitirSubida } = await import("~/lib/db/limites"));
    await limpiar();
  });
  afterAll(async () => {
    await limpiar();
    await pool.end();
  });

  it("deja pasar hasta el máximo y corta lo que sobra", async () => {
    const t = new Date("2026-10-01T10:00:00Z");
    expect(await permitirSubida(A, opciones, t)).toBe(true);
    expect(await permitirSubida(A, opciones, t)).toBe(true);
    expect(await permitirSubida(A, opciones, t)).toBe(false);
  });

  it("cuenta cada clave por separado", async () => {
    expect(
      await permitirSubida(B, opciones, new Date("2026-10-01T10:00:00Z")),
    ).toBe(true);
  });

  it("empieza otra ventana pasado el plazo", async () => {
    const t = new Date("2026-10-01T10:00:00Z");
    const despues = new Date(t.getTime() + opciones.ventanaMs + 1);
    expect(await permitirSubida(A, opciones, despues)).toBe(true);
  });

  it("es atómico con peticiones simultáneas", async () => {
    const t = new Date("2026-10-01T12:00:00Z");
    const r = await Promise.all(
      Array.from({ length: 6 }, () =>
        permitirSubida("test-limites-c", opciones, t),
      ),
    );
    expect(r.filter(Boolean)).toHaveLength(2);
  });
});
