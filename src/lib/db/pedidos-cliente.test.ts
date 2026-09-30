import { describe, expect, it, beforeAll, afterAll } from "vitest";

// Igual que en `pedidos.test.ts`: el repositorio se importa dentro del
// beforeAll, después de redirigir DATABASE_URL a la base de pruebas, porque
// `~/lib/db/pool` crea el pool en cuanto se carga.
const URL_PRUEBAS = process.env.DATABASE_URL_TEST;
const describeSiHayBD = URL_PRUEBAS ? describe : describe.skip;

describeSiHayBD("pedidos de un cliente (historial de /cuenta)", () => {
  let pool: import("pg").Pool;
  let repo: typeof import("~/lib/db/pedidos");

  // Marca propia: la tabla se comparte con `pedidos.test.ts` y
  // `estadisticas.test.ts`, que corren a la vez. Todo lo de aquí lleva este
  // correo y se entrega en enero de 2033, que nadie más usa; y se limpia
  // SOLO por esa marca, nunca la tabla entera.
  const CORREO = "cuenta-pedidos@prueba.test";
  // Los usuarios van en un dominio propio: `clientes.test.ts` borra todos
  // los `%@prueba.test` de "user" al arrancar y al terminar, y `pedidos`
  // pone `user_id` a null al borrar al usuario (`on delete set null`).
  const ANA = { id: "u-cuenta-pedidos-ana", email: "ana@cuenta-pedidos.test" };
  const LUIS = {
    id: "u-cuenta-pedidos-luis",
    email: "luis@cuenta-pedidos.test",
  };

  const pedidoDe = (userId: string | undefined, dateISO: string) => ({
    lines: [
      {
        slug: "tarta-de-queso",
        name: "Tarta de queso",
        qty: 2,
        unitPriceCents: 1850,
        totalCents: 3700,
      },
      {
        slug: "croissant",
        name: "Croissant",
        variantLabel: "Grande",
        qty: 3,
        unitPriceCents: 190,
        totalCents: 570,
      },
    ],
    subtotalCents: 4270,
    shippingCents: 0,
    totalCents: 4270,
    userId,
    payload: {
      items: [],
      mode: "recogida" as const,
      dateISO,
      slot: "morning" as const,
      storeId: "alcobendas",
      email: CORREO,
      phone: "666123456",
      name: "Ana",
    },
  });

  const limpia = async () => {
    await pool.query("delete from pedidos where email = $1", [CORREO]);
    await pool.query(
      `delete from "user" where email like '%@cuenta-pedidos.test'`,
    );
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: URL_PRUEBAS, max: 2 });
    repo = await import("~/lib/db/pedidos");
    await limpia();
    await pool.query(
      `insert into "user" (id, name, email, "emailVerified", "updatedAt")
       values ($1, 'Ana', $2, false, now()), ($3, 'Luis', $4, false, now())`,
      [ANA.id, ANA.email, LUIS.id, LUIS.email],
    );
  });

  afterAll(async () => {
    await limpia();
    await pool.end();
  });

  it("devuelve solo los pedidos del cliente: ni los de otro usuario ni los de invitado", async () => {
    const deAna = await repo.crearPedidoIniciado(
      pedidoDe(ANA.id, "2033-01-01") as never,
      {
        estado: "sin_pago",
      },
    );
    const deLuis = await repo.crearPedidoIniciado(
      pedidoDe(LUIS.id, "2033-01-01") as never,
      {
        estado: "sin_pago",
      },
    );
    const invitado = await repo.crearPedidoIniciado(
      pedidoDe(undefined, "2033-01-01") as never,
      { estado: "sin_pago" },
    );

    const ids = (await repo.listarPedidosDeCliente(ANA.id)).map((p) => p.id);
    expect(ids).toContain(deAna);
    expect(ids).not.toContain(deLuis);
    expect(ids).not.toContain(invitado);
  });

  it("excluye los carritos abandonados (iniciado) y trae pagados y sin pago con su estado", async () => {
    const iniciado = await repo.crearPedidoIniciado(
      pedidoDe(ANA.id, "2033-01-02") as never,
    );
    const pagado = await repo.crearPedidoIniciado(
      pedidoDe(ANA.id, "2033-01-02") as never,
    );
    await repo.marcarPagado({
      pedidoId: pagado,
      sessionId: "cs_cuenta_pedidos_pagado",
    });
    const sinPago = await repo.crearPedidoIniciado(
      pedidoDe(ANA.id, "2033-01-02") as never,
      {
        estado: "sin_pago",
      },
    );

    const lista = await repo.listarPedidosDeCliente(ANA.id);
    expect(lista.find((p) => p.id === iniciado)).toBeUndefined();
    expect(lista.find((p) => p.id === pagado)?.estado).toBe("pagado");
    expect(lista.find((p) => p.id === sinPago)?.estado).toBe("sin_pago");
  });

  it("ordena del más reciente al más antiguo", async () => {
    const viejo = await repo.crearPedidoIniciado(
      pedidoDe(ANA.id, "2033-01-03") as never,
      {
        estado: "sin_pago",
      },
    );
    // Entró hace una semana: se fuerza `created_at`, que el repositorio no
    // deja elegir, para que el orden no dependa de microsegundos.
    await pool.query(
      "update pedidos set created_at = created_at - interval '7 days' where id = $1",
      [viejo],
    );
    const nuevo = await repo.crearPedidoIniciado(
      pedidoDe(ANA.id, "2033-01-03") as never,
      {
        estado: "sin_pago",
      },
    );

    const ids = (await repo.listarPedidosDeCliente(ANA.id)).map((p) => p.id);
    expect(ids).toContain(nuevo);
    expect(ids).toContain(viejo);
    expect(ids.indexOf(nuevo)).toBeLessThan(ids.indexOf(viejo));
  });

  it("las líneas vienen completas y en el orden en que se pidieron", async () => {
    const id = await repo.crearPedidoIniciado(
      pedidoDe(ANA.id, "2033-01-04") as never,
      {
        estado: "sin_pago",
      },
    );

    const pedido = (await repo.listarPedidosDeCliente(ANA.id)).find(
      (p) => p.id === id,
    )!;
    expect(pedido.fechaEntrega).toBe("2033-01-04");
    expect(pedido.mode).toBe("recogida");
    expect(pedido.storeId).toBe("alcobendas");
    expect(pedido.totalCents).toBe(4270);
    expect(pedido.lineas).toEqual([
      {
        slug: "tarta-de-queso",
        nombre: "Tarta de queso",
        varianteLabel: null,
        qty: 2,
        unitPriceCents: 1850,
        detalle: null,
        fotoUrl: null,
      },
      {
        slug: "croissant",
        nombre: "Croissant",
        varianteLabel: "Grande",
        qty: 3,
        unitPriceCents: 190,
        detalle: null,
        fotoUrl: null,
      },
    ]);
  });

  it("respeta el límite", async () => {
    // A estas alturas Ana lleva más de dos pedidos visibles.
    expect(await repo.listarPedidosDeCliente(ANA.id, 2)).toHaveLength(2);
  });
});
