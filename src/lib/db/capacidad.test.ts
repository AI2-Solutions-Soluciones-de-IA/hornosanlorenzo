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
  // Martes: capacidad de 50.
  const MARTES = "2031-05-20";
  const pedido = (qtys: number[], totalCents = 1000, dateISO = DIA) => ({
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
      dateISO,
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

  describe("reserva de hueco al pagar", () => {
    const ocupadas = async () =>
      (await capacidad.unidadesEncargadas(MARTES)).get(MARTES) ?? 0;

    it("un pago en marcha ocupa su hueco hasta que vence la reserva", async () => {
      const id = await pedidos.crearPedidoIniciado(pedido([5], 1000, MARTES) as never, {
        comprobarHueco: true,
      });
      expect(await ocupadas()).toBe(5);
      await pool.query(
        "update pedidos set reserva_hasta = now() - interval '1 minute' where id = $1",
        [id],
      );
      expect(await ocupadas()).toBe(0);
      await pool.query("delete from pedidos where id = $1", [id]);
    });

    it("con el día lleno no se anota el pedido: 409", async () => {
      const lleno = await pedidos.crearPedidoIniciado(
        pedido([10, 10, 10, 10, 8], 1000, MARTES) as never,
        { estado: "sin_pago", comprobarHueco: true },
      );
      await expect(
        pedidos.crearPedidoIniciado(pedido([3], 1000, MARTES) as never, {
          comprobarHueco: true,
        }),
      ).rejects.toMatchObject({ status: 409 });
      expect(await ocupadas()).toBe(48);
      await pool.query("delete from pedidos where id = $1", [lleno]);
    });

    it("dos pedidos a la vez por el último hueco: entra uno solo", async () => {
      const previo = await pedidos.crearPedidoIniciado(
        pedido([10, 10, 10, 10, 5], 1000, MARTES) as never,
        { estado: "sin_pago", comprobarHueco: true },
      );
      const a = pedidos.crearPedidoIniciado(pedido([4], 1000, MARTES) as never, {
        comprobarHueco: true,
      });
      const b = pedidos.crearPedidoIniciado(pedido([4], 1000, MARTES) as never, {
        comprobarHueco: true,
      });
      const res = await Promise.allSettled([a, b]);
      expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(await ocupadas()).toBe(49);
      await pool.query("delete from pedidos where email = $1 and fecha_entrega = $2", [
        CORREO,
        MARTES,
      ]);
      void previo;
    });

    it("volver al carrito suelta el hueco y devuelve la página de pago a cerrar", async () => {
      const id = await pedidos.crearPedidoIniciado(pedido([5], 1000, MARTES) as never, {
        comprobarHueco: true,
      });
      await pedidos.anotarSesionStripe(id, "cs_test_soltar");
      expect(await capacidad.soltarReserva(id)).toBe("cs_test_soltar");
      expect(await ocupadas()).toBe(0);
      // Una segunda vez ya no hay nada que soltar.
      expect(await capacidad.soltarReserva(id)).toBeNull();
      await pool.query("delete from pedidos where id = $1", [id]);
    });

    it("cierra las páginas de reservas vencidas solo si el día se pasaría", async () => {
      const vencida = await pedidos.crearPedidoIniciado(pedido([6], 1000, MARTES) as never, {
        comprobarHueco: true,
      });
      await pedidos.anotarSesionStripe(vencida, "cs_test_vencida");
      await pool.query(
        "update pedidos set reserva_hasta = now() - interval '1 minute' where id = $1",
        [vencida],
      );
      // 6 vencidas + 40 ocupadas = 46: cabe, se deja pagar.
      const cuarenta = await pedidos.crearPedidoIniciado(
        pedido([10, 10, 10, 10], 1000, MARTES) as never,
        { estado: "sin_pago", comprobarHueco: true },
      );
      expect(await capacidad.sesionesQueCerrar(MARTES)).toEqual([]);
      // 6 + 48 = 54: se pasaría, se cierra.
      await pedidos.crearPedidoIniciado(pedido([8], 1000, MARTES) as never, {
        estado: "sin_pago",
        comprobarHueco: true,
      });
      expect(await capacidad.sesionesQueCerrar(MARTES)).toEqual(["cs_test_vencida"]);
      await pool.query("delete from pedidos where email = $1 and fecha_entrega = $2", [
        CORREO,
        MARTES,
      ]);
      void cuarenta;
    });
  });

  it("un pack ocupa tantos huecos como productos lleva", async () => {
    const DIA_PACK = "2031-05-21";
    const conPack = {
      ...pedido([], 1000, DIA_PACK),
      lines: [
        {
          slug: "pack-cumpleanos",
          name: "Pack Cumpleaños",
          qty: 2,
          unitPriceCents: 3000,
          totalCents: 6000,
          detalle: [
            { slug: "a", nombre: "A", varianteLabel: null, qty: 1 },
            { slug: "b", nombre: "B", varianteLabel: null, qty: 1 },
            { slug: "c", nombre: "C", varianteLabel: null, qty: 2 },
          ],
        },
        { slug: "suelto", name: "Suelto", qty: 3, unitPriceCents: 100, totalCents: 300 },
      ],
    };
    await pedidos.crearPedidoIniciado(conPack as never, { estado: "sin_pago" });
    expect((await capacidad.unidadesEncargadas(DIA_PACK)).get(DIA_PACK)).toBe(2 * 4 + 3);
  });
});
