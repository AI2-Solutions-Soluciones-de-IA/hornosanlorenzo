import { describe, expect, it, beforeAll, afterAll } from "vitest";

const URL_PRUEBAS = process.env.DATABASE_URL_TEST;
const describeSiHayBD = URL_PRUEBAS ? describe : describe.skip;

describeSiHayBD("resumen del panel", () => {
  let pool: import("pg").Pool;
  let pedidos: typeof import("~/lib/db/pedidos");
  let stats: typeof import("~/lib/db/estadisticas");

  const pedido = (
    lines: { slug: string; name: string; qty: number; unitPriceCents: number }[],
    payload: Partial<{ mode: "recogida" | "domicilio"; storeId: string; dateISO: string }> = {},
    shippingCents = 0,
  ) => {
    const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPriceCents, 0);
    return {
      lines: lines.map((l) => ({ ...l, totalCents: l.qty * l.unitPriceCents })),
      subtotalCents: subtotal,
      shippingCents,
      totalCents: subtotal + shippingCents,
      payload: {
        items: [],
        mode: "recogida" as const,
        dateISO: "2026-09-20",
        slot: "morning" as const,
        storeId: "alcobendas",
        email: CORREO,
        phone: "666123456",
        ...payload,
      },
    };
  };

  // Un día que ninguna otra prueba usa: `pedidos.test.ts` comparte la tabla
  // y corre a la vez. Todo lo de aquí se fecha ese día y se limpia por correo.
  const DIA = "2021-03-10";
  const CORREO = "stats@prueba.test";
  const CEBRA = { slug: "cebra", name: "Cebra", qty: 1, unitPriceCents: 600 };
  const TARTA = { slug: "tarta", name: "Tarta de queso", qty: 2, unitPriceCents: 1850 };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: URL_PRUEBAS, max: 2 });
    pedidos = await import("~/lib/db/pedidos");
    stats = await import("~/lib/db/estadisticas");
    await pool.query("delete from pedidos where email = $1", [CORREO]);
    await pool.query(`delete from "user" where email like '%@stats.test'`);

    // Cobrado por Stripe: 6 €
    const stripe = await pedidos.crearPedidoIniciado(pedido([CEBRA]) as never, { dispositivo: "movil" });
    await pedidos.marcarPagado({ pedidoId: stripe, sessionId: "cs_stats_1" });
    // Cobrado en tienda: 37 €, a domicilio con 5 € de reparto → 42 €
    const tienda = await pedidos.crearPedidoIniciado(
      pedido([TARTA], { mode: "domicilio" }, 500) as never,
      { estado: "sin_pago", dispositivo: "ordenador" },
    );
    await pedidos.cambiarEstadoAMano(tienda, "pagado");
    // Sin pagar: 6 €, recogida en Pozuelo
    await pedidos.crearPedidoIniciado(
      pedido([CEBRA], { storeId: "pozuelo" }) as never,
      { estado: "sin_pago" },
    );
    // Carrito abandonado: no cuenta en recaudación (ni en aparatos)
    await pedidos.crearPedidoIniciado(pedido([TARTA]) as never, { dispositivo: "tablet" });
    // Todo lo anterior, fechado en el día propio (mediodía de Madrid).
    await pool.query(
      `update pedidos set created_at = ($2::date + interval '12 hours') at time zone 'Europe/Madrid'
        where email = $1`,
      [CORREO, DIA],
    );
    // Y uno fuera del rango, el día siguiente.
    const fuera = await pedidos.crearPedidoIniciado(pedido([CEBRA]) as never, { estado: "sin_pago" });
    await pool.query(
      `update pedidos set created_at = ($2::date + interval '36 hours') at time zone 'Europe/Madrid'
        where id = $1`,
      [fuera, DIA],
    );

    await pool.query(
      `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       values ('u-stats-nuevo', 'Ana', 'ana@stats.test', false, $1::date + interval '12 hours', now()),
              ('u-stats-viejo', 'Luis', 'luis@stats.test', false, $1::date - interval '40 days', now())`,
      [DIA],
    );
  });

  afterAll(async () => {
    await pool.query("delete from pedidos where email = $1", [CORREO]);
    await pool.query(`delete from "user" where email like '%@stats.test'`);
    await pool.end();
  });

  it("cuenta los pedidos del rango por estado, sin mezclar lo cobrado con lo pendiente", async () => {
    const r = await stats.resumen({ desde: DIA, hasta: DIA });
    expect(r.pedidos).toEqual({ total: 3, cobrados: 2, sinPagar: 1, abandonados: 1 });
    expect(r.recaudacionCents).toBe(600 + 4200);
    expect(r.pendienteCents).toBe(600);
    // Ticket medio sobre los tres pedidos con importe (no el abandonado).
    expect(r.ticketMedioCents).toBe(Math.round((600 + 4200 + 600) / 3));
  });

  it("reparte por modalidad y por tienda", async () => {
    const r = await stats.resumen({ desde: DIA, hasta: DIA });
    expect(r.porModalidad).toEqual({ recogida: 2, domicilio: 1 });
    expect(r.porTienda).toEqual([
      { storeId: "alcobendas", pedidos: 1 },
      { storeId: "pozuelo", pedidos: 1 },
    ]);
  });

  it("top de productos por unidades e importe, solo de pedidos con importe", async () => {
    const r = await stats.resumen({ desde: DIA, hasta: DIA });
    expect(r.topProductos[0]).toEqual({ nombre: "Tarta de queso", unidades: 2, importeCents: 3700 });
    expect(r.topProductos[1]).toEqual({ nombre: "Cebra", unidades: 2, importeCents: 1200 });
    expect(r.topProductos).toHaveLength(2);
  });

  it("clientes: total y nuevos en el rango", async () => {
    const r = await stats.resumen({ desde: DIA, hasta: DIA });
    // `total` cuenta toda la tabla, que otras pruebas también llenan.
    expect(r.clientes.nuevos).toBe(1);
    expect(r.clientes.total).toBeGreaterThanOrEqual(2);
  });

  it("pedidos por día del rango, en hora de Madrid", async () => {
    const r = await stats.resumen({ desde: DIA, hasta: DIA });
    expect(r.porDia).toEqual([{ dia: DIA, pedidos: 3, importeCents: 5400 }]);
  });

  it("desde qué aparato, solo los pedidos con importe; los de antes, sin dato", async () => {
    const r = await stats.resumen({ desde: DIA, hasta: DIA });
    expect(r.porDispositivo).toEqual({ movil: 1, tablet: 0, ordenador: 1, sinDato: 1 });
  });

  it("un rango vacío devuelve ceros, no nulos", async () => {
    const r = await stats.resumen({ desde: "2020-01-01", hasta: "2020-01-02" });
    expect(r.pedidos.total).toBe(0);
    expect(r.recaudacionCents).toBe(0);
    expect(r.ticketMedioCents).toBe(0);
    expect(r.topProductos).toEqual([]);
    expect(r.porDia).toEqual([]);
  });
});
