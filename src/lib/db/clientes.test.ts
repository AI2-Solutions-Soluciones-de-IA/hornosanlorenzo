import { describe, expect, it, beforeAll, afterAll } from "vitest";

const URL_PRUEBAS = process.env.DATABASE_URL_TEST;
const describeSiHayBD = URL_PRUEBAS ? describe : describe.skip;

describeSiHayBD("repositorio de clientes", () => {
  let pool: import("pg").Pool;
  let repo: typeof import("~/lib/db/clientes");

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: URL_PRUEBAS, max: 2 });
    repo = await import("~/lib/db/clientes");

    await pool.query(`delete from "user" where email like '%@prueba.test'`);
    await pool.query(
      `insert into "user" (id, name, email, "emailVerified", "updatedAt", telefono, rol)
       values ('cli-1', 'Ana', 'ana@prueba.test', false, now(), '666123456', 'cliente')`,
    );
    await pool.query(
      `insert into account (id, "accountId", "providerId", "userId", password, "updatedAt")
       values ('acc-1', 'ana@prueba.test', 'credential', 'cli-1', 'hash-secretísimo', now())`,
    );
  });

  afterAll(async () => {
    await pool.query(`delete from "user" where email like '%@prueba.test'`);
    await pool.end();
  });

  describe("búsqueda de texto libre", () => {
    // Marca propia, para no pisar ni depender de los usuarios de otras
    // pruebas que corren a la vez contra la misma base.
    const CORREO_BUSQUEDA = "buscador@prueba.test";
    const ID = "cli-buscador";

    beforeAll(async () => {
      await pool.query(`delete from "user" where email = $1`, [CORREO_BUSQUEDA]);
      await pool.query(
        `insert into "user" (id, name, email, "emailVerified", "updatedAt", telefono, rol)
         values ($1, 'Búsqueda Prueba Zeta', $2, false, now(), '699 000 111', 'cliente')`,
        [ID, CORREO_BUSQUEDA],
      );
    });

    afterAll(async () => {
      await pool.query(`delete from "user" where email = $1`, [CORREO_BUSQUEDA]);
    });

    const idsQueCasan = async (texto: string) =>
      (await repo.listarClientes(500, texto))
        .filter((c) => c.email === CORREO_BUSQUEDA)
        .map((c) => c.id);

    it("encuentra por un trozo del nombre, sin importar mayúsculas", async () => {
      expect(await idsQueCasan("prueba ZETA")).toContain(ID);
    });

    it("encuentra por correo", async () => {
      expect(await idsQueCasan("BUSCADOR@prueba")).toContain(ID);
    });

    it("encuentra el teléfono con o sin los espacios con que se guardó", async () => {
      expect(await idsQueCasan("699000111")).toContain(ID);
      expect(await idsQueCasan("699 000")).toContain(ID);
    });

    it("no encuentra nada con un texto que no casa, y un % no es comodín", async () => {
      expect(await idsQueCasan("ornitorrinco-zeta")).toEqual([]);
      expect(await idsQueCasan("%")).toEqual([]);
    });

    it("sin texto devuelve el listado entero", async () => {
      expect(await idsQueCasan("  ")).toContain(ID);
    });

    it("cuenta lo que casa con la búsqueda, y el desplazamiento salta filas", async () => {
      // Solo con la búsqueda propia: otros ficheros crean usuarios a la vez.
      expect(await repo.contarClientes("prueba zeta")).toBe(1);
      expect(await repo.contarClientes("ornitorrinco-zeta")).toBe(0);
      expect((await repo.listarClientes(1, "prueba zeta", 0)).map((c) => c.id)).toEqual([ID]);
      expect(await repo.listarClientes(1, "prueba zeta", 1)).toEqual([]);
    });
  });

  it("devuelve nombre, correo y teléfono, y nunca la contraseña", async () => {
    const clientes = await repo.listarClientes();
    const ana = clientes.find((c) => c.email === "ana@prueba.test")!;

    expect(ana.nombre).toBe("Ana");
    expect(ana.telefono).toBe("666123456");
    expect(ana.pedidos).toBe(0);
    // Ni el campo, ni el valor, por si alguien mete un `select *`.
    expect(Object.keys(ana)).not.toContain("password");
    expect(JSON.stringify(ana)).not.toContain("hash-secretísimo");
  });
});
