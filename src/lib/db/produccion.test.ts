import { describe, expect, it, beforeAll, afterAll } from "vitest";

const URL_PRUEBAS = process.env.DATABASE_URL_TEST;
const describeSiHayBD = URL_PRUEBAS ? describe : describe.skip;

describeSiHayBD("hoja de producción", () => {
  let pool: import("pg").Pool;
  let pedidos: typeof import("~/lib/db/pedidos");
  let produccion: typeof import("~/lib/db/produccion");

  // Marca propia: las demás pruebas de pedidos comparten la tabla y corren a
  // la vez, así que todo lo de aquí lleva este correo y se entrega en 2032,
  // un año que nadie más usa. Se limpia SOLO por correo, nunca la tabla.
  const CORREO = "produccion@prueba.test";
  const DIA = "2032-05-01";
  const OTRO_DIA = "2032-05-02";
  // Día propio para los packs: así no mueven las cuentas de los demás casos.
  const DIA_PACKS = "2032-05-03";

  type Linea = {
    slug: string;
    name: string;
    qty: number;
    unitPriceCents: number;
    variantLabel?: string;
    detalle?: {
      slug: string;
      nombre: string;
      varianteLabel: string | null;
      qty: number;
    }[];
  };
  const pedido = (
    lines: Linea[],
    payload: Partial<{
      mode: "recogida" | "domicilio";
      storeId: string;
      dateISO: string;
    }> = {},
  ) => {
    const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPriceCents, 0);
    return {
      lines: lines.map((l) => ({ ...l, totalCents: l.qty * l.unitPriceCents })),
      subtotalCents: subtotal,
      shippingCents: 0,
      totalCents: subtotal,
      payload: {
        items: [],
        mode: "recogida" as const,
        dateISO: DIA,
        slot: "morning" as const,
        storeId: "alcobendas",
        email: CORREO,
        phone: "666123456",
        ...payload,
      },
    };
  };

  const CEBRA = { slug: "cebra", name: "Cebra", qty: 1, unitPriceCents: 600 };
  const TARTA_M = {
    slug: "tarta",
    name: "Tarta de queso",
    qty: 2,
    unitPriceCents: 1850,
    variantLabel: "Mediana",
  };
  const TARTA_G = {
    slug: "tarta",
    name: "Tarta de queso",
    qty: 1,
    unitPriceCents: 2900,
    variantLabel: "Grande",
  };

  const limpiar = async () => {
    await pool.query("delete from pedidos where email = $1", [CORREO]);
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: URL_PRUEBAS, max: 2 });
    pedidos = await import("~/lib/db/pedidos");
    produccion = await import("~/lib/db/produccion");
    await limpiar();

    // Recogida en Alcobendas, pagado: 1 cebra + 2 tartas medianas.
    const a = await pedidos.crearPedidoIniciado(
      pedido([CEBRA, TARTA_M]) as never,
    );
    await pedidos.marcarPagado({ pedidoId: a, sessionId: "cs_produccion_1" });
    // Recogida en Pozuelo, sin pagar: 3 cebras.
    await pedidos.crearPedidoIniciado(
      pedido([{ ...CEBRA, qty: 3 }], { storeId: "pozuelo" }) as never,
      { estado: "sin_pago" },
    );
    // A domicilio, sin pagar: 1 tarta grande + 1 tarta mediana.
    await pedidos.crearPedidoIniciado(
      pedido([TARTA_G, { ...TARTA_M, qty: 1 }], { mode: "domicilio" }) as never,
      { estado: "sin_pago" },
    );
    // Carrito abandonado el mismo día: no se hornea.
    await pedidos.crearPedidoIniciado(pedido([{ ...CEBRA, qty: 50 }]) as never);
    // Y uno pagado pero de OTRO día: tampoco entra en esta hoja.
    await pedidos.crearPedidoIniciado(
      pedido([{ ...CEBRA, qty: 40 }], { dateISO: OTRO_DIA }) as never,
      { estado: "sin_pago" },
    );
    // Reconstruido desde Stripe sin modalidad: sabe el día, no el destino.
    await pedidos.crearPedidoReconstruido({
      stripeSessionId: "cs_produccion_reconstruido",
      mode: null,
      fechaEntrega: DIA,
      slot: null,
      storeId: null,
      address: null,
      postalCode: null,
      email: CORREO,
      telefono: "666123456",
      nombre: null,
      notas: null,
      totalCents: 600,
      lineas: [{ nombre: "Cebra", qty: 1, unitPriceCents: 600 }],
    });
  });

  afterAll(async () => {
    await limpiar();
    await pool.end();
  });

  it("suma las unidades del mismo producto y variante entre pedidos, y cuenta en cuántos sale", async () => {
    const h = await produccion.hojaProduccion(DIA);
    expect(h.fechaEntrega).toBe(DIA);
    // Pagado + 2 sin pagar + el reconstruido; ni el abandonado ni el de otro día.
    expect(h.totalPedidos).toBe(4);
    const mediana = h.lineas.find(
      (l) => l.slug === "tarta" && l.varianteLabel === "Mediana",
    );
    expect(mediana).toMatchObject({
      nombre: "Tarta de queso",
      unidades: 3,
      pedidos: 2,
    });
  });

  it("separa las variantes distintas de un mismo producto", async () => {
    const h = await produccion.hojaProduccion(DIA);
    const tartas = h.lineas.filter((l) => l.slug === "tarta");
    expect(tartas.map((l) => l.varianteLabel)).toEqual(["Grande", "Mediana"]);
    expect(tartas.find((l) => l.varianteLabel === "Grande")).toMatchObject({
      unidades: 1,
      pedidos: 1,
    });
  });

  it("las líneas van ordenadas por nombre y luego por variante", async () => {
    const h = await produccion.hojaProduccion(DIA);
    const nombres = h.lineas.map((l) => `${l.nombre}|${l.varianteLabel ?? ""}`);
    expect(nombres).toEqual(
      [...nombres].sort((a, b) => a.localeCompare(b, "es")),
    );
  });

  it("desglosa cada producto y el total por destino: tienda de recogida o domicilio", async () => {
    const h = await produccion.hojaProduccion(DIA);
    const cebra = h.lineas.find((l) => l.slug === "cebra");
    expect(cebra?.porDestino).toEqual([
      { destino: "recogida:alcobendas", unidades: 1 },
      { destino: "recogida:pozuelo", unidades: 3 },
    ]);
    expect(h.porDestino).toEqual([
      { destino: "domicilio", pedidos: 1, unidades: 2 },
      { destino: "recogida:alcobendas", pedidos: 1, unidades: 3 },
      { destino: "recogida:pozuelo", pedidos: 1, unidades: 3 },
    ]);
  });

  it("ignora los carritos abandonados y los pedidos de otro día", async () => {
    const h = await produccion.hojaProduccion(DIA);
    const cebra = h.lineas.find((l) => l.slug === "cebra");
    // 1 + 3 de los pedidos buenos; ni las 50 del abandonado ni las 40 del día siguiente.
    expect(cebra?.unidades).toBe(4);

    const otro = await produccion.hojaProduccion(OTRO_DIA);
    expect(otro.totalPedidos).toBe(1);
    expect(otro.lineas.find((l) => l.slug === "cebra")?.unidades).toBe(40);
  });

  it("avisa de los pedidos sin modalidad en vez de inventarles destino", async () => {
    const h = await produccion.hojaProduccion(DIA);
    expect(h.sinDatos).toBe(1);
    // Su cebra se hornea igual (sin slug: Stripe no lo da), pero sin destino.
    const suelta = h.lineas.find(
      (l) => l.slug === null && l.nombre === "Cebra",
    );
    expect(suelta).toMatchObject({ unidades: 1, pedidos: 1, porDestino: [] });
    expect(h.porDestino.map((d) => d.destino)).not.toContain("sin_datos");
  });

  it("un día sin pedidos devuelve ceros y listas vacías", async () => {
    const h = await produccion.hojaProduccion("2032-05-09");
    expect(h).toEqual({
      fechaEntrega: "2032-05-09",
      totalPedidos: 0,
      lineas: [],
      porDestino: [],
      sinDatos: 0,
      packs: [],
    });
  });

  it("desglosa los packs en piezas, las suma a lo suelto y los lista aparte", async () => {
    const ENTERA = "Entera · 16–20 rac.";
    // 2 Packs Cumpleaños, cada uno con 1 empanada de carne entera.
    const a = await pedidos.crearPedidoIniciado(
      pedido(
        [
          {
            slug: "pack-cumpleanos",
            name: "Pack Cumpleaños",
            qty: 2,
            unitPriceCents: 4500,
            detalle: [
              {
                slug: "empanada-de-carne",
                nombre: "Empanada de carne",
                varianteLabel: ENTERA,
                qty: 1,
              },
            ],
          },
        ],
        { dateISO: DIA_PACKS },
      ) as never,
      { estado: "sin_pago" },
    );
    expect(a).toBeTruthy();
    // Y otro pedido con 1 empanada de carne entera suelta, en Pozuelo.
    await pedidos.crearPedidoIniciado(
      pedido(
        [
          {
            slug: "empanada-de-carne",
            name: "Empanada de carne",
            qty: 1,
            unitPriceCents: 1800,
            variantLabel: ENTERA,
          },
        ],
        { dateISO: DIA_PACKS, storeId: "pozuelo" },
      ) as never,
      { estado: "sin_pago" },
    );

    const h = await produccion.hojaProduccion(DIA_PACKS);
    expect(h.lineas).toHaveLength(1);
    expect(h.lineas[0]).toMatchObject({
      slug: "empanada-de-carne",
      varianteLabel: ENTERA,
      unidades: 3,
      pedidos: 2,
    });
    expect(h.lineas.map((l) => l.nombre)).not.toContain("Pack Cumpleaños");
    expect(h.lineas[0].porDestino).toEqual([
      { destino: "recogida:alcobendas", unidades: 2 },
      { destino: "recogida:pozuelo", unidades: 1 },
    ]);
    expect(h.packs).toEqual([
      { nombre: "Pack Cumpleaños", unidades: 2, pedidos: 1 },
    ]);
    // Los totales por destino cuentan cajas entregadas: un pack es una caja.
    expect(h.porDestino).toEqual([
      { destino: "recogida:alcobendas", pedidos: 1, unidades: 2 },
      { destino: "recogida:pozuelo", pedidos: 1, unidades: 1 },
    ]);
  });
});
