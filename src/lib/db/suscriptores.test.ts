import { describe, expect, it, beforeAll, afterAll } from "vitest";

const URL_PRUEBAS = process.env.DATABASE_URL_TEST;
const describeSiHayBD = URL_PRUEBAS ? describe : describe.skip;

describeSiHayBD("suscriptores a las ofertas", () => {
  let pool: import("pg").Pool;
  let repo: typeof import("~/lib/db/suscriptores");
  // Prefijo propio: solo este fichero toca la tabla, pero por si acaso.
  const correo = (n: string) => `test-susc-${n}@pruebas.test`;
  const limpiar = () => pool.query("delete from suscriptores where email like 'test-susc-%'");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    ({ pool } = await import("~/lib/db/pool"));
    repo = await import("~/lib/db/suscriptores");
    await limpiar();
  });
  afterAll(async () => {
    await limpiar();
    await pool.end();
  });

  it("da de alta una vez aunque se repita, sin importar mayúsculas", async () => {
    await repo.suscribir(correo("a"));
    await repo.suscribir(correo("A").toUpperCase());
    const { rows } = await pool.query(
      "select count(*)::int as n from suscriptores where lower(email) = $1",
      [correo("a")],
    );
    expect(rows[0].n).toBe(1);
  });

  it("la baja por token saca al suscrito de los envíos, y volver a suscribirse lo recupera", async () => {
    await repo.suscribir(correo("b"));
    const activos = await repo.suscriptoresActivos();
    const yo = activos.find((s) => s.email === correo("b"))!;
    expect(yo.token).toMatch(/^[a-f0-9]{32,}$/);

    expect(await repo.darDeBaja(yo.token)).toBe(true);
    expect((await repo.suscriptoresActivos()).some((s) => s.email === correo("b"))).toBe(false);
    // Una segunda baja con el mismo enlace no falla, pero no cambia nada.
    expect(await repo.darDeBaja(yo.token)).toBe(false);
    expect(await repo.darDeBaja("no-existe")).toBe(false);

    await repo.suscribir(correo("b"));
    expect((await repo.suscriptoresActivos()).some((s) => s.email === correo("b"))).toBe(true);
  });

  it("el panel los lista y los cuenta, con búsqueda", async () => {
    await repo.suscribir(correo("buscame"));
    const total = await repo.contarSuscriptores("buscame");
    const lista = await repo.listarSuscriptores(10, "buscame");
    expect(total).toBe(1);
    expect(lista[0].email).toBe(correo("buscame"));
    expect(lista[0].creadoEn).toBeInstanceOf(Date);
  });
});
