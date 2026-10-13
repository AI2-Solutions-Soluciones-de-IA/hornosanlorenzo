import { describe, expect, it, beforeAll, afterAll } from "vitest";

// Como en `pedidos.test.ts`: el repositorio se importa en el beforeAll, después
// de apuntar DATABASE_URL a la base de pruebas.
const URL_PRUEBAS = process.env.DATABASE_URL_TEST;
const describeSiHayBD = URL_PRUEBAS ? describe : describe.skip;

describeSiHayBD("unidades encargadas por día", () => {
  let pool: import("pg").Pool;
  let pedidos: typeof import("~/lib/db/pedidos");
  let capacidad: typeof import("~/lib/db/capacidad");

  const CORREO = "capacidad@prueba.test";
  // Un día lejano y propio: otros ficheros escriben pedidos a la vez.
  const DIA = "2031-05-16";
  const pedido = (qtys: number[], totalCents = 1000) => ({
    lines: qtys.map((qty, i) => ({
      slug: `producto-${i}`,
      name: `Producto ${i}`,
      qty,
      unitPriceCents: 100,
      totalCents: qty * 100,
    })),
    subtotalCents: totalCents,
    shippingCents: 0,
    totalCents,
    payload: {
      items: [],
      mode: "recogida" as const,
      dateISO: DIA,
      slot: "morning" as const,
      storeId: "alcobendas",
      email: CORREO,
      phone: "666123456",
    },
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: URL_PRUEBAS, max: 2 });
    pedidos = await import("~/lib/db/pedidos");
    capacidad = await import("~/lib/db/capacidad");
    await pool.query("delete from pedidos where email = $1", [CORREO]);
  });

  afterAll(async () => {
    await pool.query("delete from pedidos where email = $1", [CORREO]);
    await pool.end();
  });

  it("suma las líneas de los pedidos que se hornean y deja fuera el resto", async () => {
    await pedidos.crearPedidoIniciado(pedido([3, 4]) as never, { estado: "sin_pago" });
    // Iniciado: carrito a medias, no ocupa hueco.
    await pedidos.crearPedidoIniciado(pedido([20]) as never);
    // Pagado y devuelto entero: ya no se hornea.
    const devuelto = await pedidos.crearPedidoIniciado(pedido([30]) as never, {
      estado: "sin_pago",
    });
    await pool.query("update pedidos set devuelto_cents = total_cents where id = $1", [
      devuelto,
    ]);

    const m = await capacidad.unidadesEncargadas(DIA);
    expect(m.get(DIA)).toBe(7);
    expect((await capacidad.unidadesEncargadas("2031-05-17")).get("2031-05-17")).toBeUndefined();
  });
});
