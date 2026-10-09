import { describe, expect, it, beforeAll, afterAll } from "vitest";

// Igual que en `direcciones.test.ts`: nada de importar el repositorio aquí
// arriba. `~/lib/db/pedidos` arrastra `~/lib/db/pool`, que crea el pool en
// cuanto se carga el módulo — y lo crearía contra el DATABASE_URL normal,
// antes de que el beforeAll lo redirija a la base de pruebas.
const URL_PRUEBAS = process.env.DATABASE_URL_TEST;
const describeSiHayBD = URL_PRUEBAS ? describe : describe.skip;

describeSiHayBD("repositorio de pedidos", () => {
  let pool: import("pg").Pool;
  let repo: typeof import("~/lib/db/pedidos");

  const CORREO = "pedidos@prueba.test";
  const pedidoDePrueba = (extraPayload: { dateISO?: string } = {}) => ({
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
    payload: {
      items: [],
      mode: "recogida" as const,
      dateISO: "2026-09-20",
      slot: "morning" as const,
      storeId: "alcobendas",
      email: CORREO,
      phone: "666123456",
      name: "Ana",
      notes: "Sin azúcar por encima",
      ...extraPayload,
    },
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: URL_PRUEBAS, max: 2 });
    repo = await import("~/lib/db/pedidos");
    await pool.query("delete from pedidos where email = $1", [CORREO]);
  });

  afterAll(async () => {
    // Solo lo de este fichero: `estadisticas.test.ts` comparte la tabla y
    // corre a la vez. Borrar toda la tabla era una carrera.
    await pool.query("delete from pedidos where email = $1", [CORREO]);
    await pool.end();
  });

  it("guarda el pedido con sus líneas y el precio cobrado", async () => {
    const id = await repo.crearPedidoIniciado(pedidoDePrueba() as never);

    const [pedido] = (await repo.listarPedidos(10)).filter((p) => p.id === id);
    // Todavía está 'iniciado', así que no sale en el listado del panel.
    expect(pedido).toBeUndefined();

    const { rows } = await pool.query(
      "select estado, total_cents, telefono from pedidos where id = $1",
      [id],
    );
    expect(rows[0].estado).toBe("iniciado");
    expect(rows[0].total_cents).toBe(4270);

    const lineas = await pool.query(
      "select slug, unit_price_cents, variante_label from lineas_pedido where pedido_id = $1 order by orden",
      [id],
    );
    expect(lineas.rows).toHaveLength(2);
    expect(lineas.rows[0].unit_price_cents).toBe(1850);
    expect(lineas.rows[1].variante_label).toBe("Grande");
  });

  it("guarda y devuelve el desglose y la foto de una línea de pack; la normal, nulos", async () => {
    const detalle = [
      { slug: "cebra", nombre: "Cebra", varianteLabel: "6 unidades", qty: 1 },
      { slug: "glaseadas", nombre: "Glaseadas", varianteLabel: null, qty: 2 },
    ];
    const base = pedidoDePrueba();
    const pedido = {
      ...base,
      lines: [
        {
          slug: "pack-desayuno",
          name: "Pack desayuno",
          qty: 1,
          unitPriceCents: 1500,
          totalCents: 1500,
          detalle,
          fotoUrl: "https://blob.example/tarta.jpg",
        },
        base.lines[0],
      ],
    };
    const id = await repo.crearPedidoIniciado(pedido as never, {
      estado: "sin_pago",
    });
    const leido = (await repo.listarPedidos(50)).find((p) => p.id === id)!;
    expect(leido.lineas[0].detalle).toEqual(detalle);
    expect(leido.lineas[0].fotoUrl).toBe("https://blob.example/tarta.jpg");
    expect(leido.lineas[1].detalle).toBeNull();
    expect(leido.lineas[1].fotoUrl).toBeNull();
  });

  it("marcarPagado es idempotente: dos avisos de Stripe no duplican nada", async () => {
    const id = await repo.crearPedidoIniciado(pedidoDePrueba() as never);
    await repo.anotarSesionStripe(id, "cs_test_idem");

    const primera = await repo.marcarPagado({ sessionId: "cs_test_idem" });
    expect(primera?.id).toBe(id);
    expect(primera?.notificadoEn).toBeNull();

    await repo.marcarAvisado(id);

    const segunda = await repo.marcarPagado({ sessionId: "cs_test_idem" });
    // Sigue pagado, pero ahora consta que ya se avisó: quien llame sabrá
    // que no tiene que volver a mandar el correo.
    expect(segunda?.id).toBe(id);
    expect(segunda?.notificadoEn).toBeInstanceOf(Date);

    const { rows } = await pool.query(
      "select count(*)::int as n from pedidos where id = $1",
      [id],
    );
    expect(rows[0].n).toBe(1);
  });

  it("devuelve null si el aviso de Stripe no corresponde a ningún pedido nuestro", async () => {
    expect(
      await repo.marcarPagado({ sessionId: "cs_test_desconocida" }),
    ).toBeNull();
  });

  it("listarPedidos devuelve solo los pagados, del más reciente al más antiguo", async () => {
    const viejo = await repo.crearPedidoIniciado(pedidoDePrueba() as never);
    await repo.marcarPagado({ pedidoId: viejo, sessionId: "cs_test_viejo" });
    const nuevo = await repo.crearPedidoIniciado(pedidoDePrueba() as never);
    await repo.marcarPagado({ pedidoId: nuevo, sessionId: "cs_test_nuevo" });
    await repo.crearPedidoIniciado(pedidoDePrueba() as never); // se queda iniciado

    const lista = await repo.listarPedidos(50);
    const ids = lista.map((p) => p.id);
    expect(ids).toContain(nuevo);
    expect(ids).toContain(viejo);
    expect(ids.indexOf(nuevo)).toBeLessThan(ids.indexOf(viejo));
    expect(lista.every((p) => p.lineas.length > 0)).toBe(true);
  });

  it("un pedido anotado sin pago (Stripe sin configurar) sale en el panel con su estado; un iniciado no", async () => {
    const sinPago = await repo.crearPedidoIniciado(pedidoDePrueba() as never, {
      estado: "sin_pago",
    });
    const iniciado = await repo.crearPedidoIniciado(pedidoDePrueba() as never);

    const lista = await repo.listarPedidos(50);
    const anotado = lista.find((p) => p.id === sinPago);
    expect(anotado?.estado).toBe("sin_pago");
    expect(lista.find((p) => p.id === iniciado)).toBeUndefined();
    // Los pagados siguen llevando su estado, para que el panel distinga.
    expect(lista.filter((p) => p.estado === "pagado").length).toBeGreaterThan(0);
  });

  describe("cambiar el estado desde el panel", () => {
    it("un pedido sin pago se marca como cobrado, y se puede deshacer", async () => {
      const id = await repo.crearPedidoIniciado(pedidoDePrueba() as never, {
        estado: "sin_pago",
      });
      expect(await repo.cambiarEstadoAMano(id, "pagado")).toBe(true);
      expect((await repo.listarPedidos(50)).find((p) => p.id === id)?.estado).toBe("pagado");

      expect(await repo.cambiarEstadoAMano(id, "sin_pago")).toBe(true);
      expect((await repo.listarPedidos(50)).find((p) => p.id === id)?.estado).toBe("sin_pago");
    });

    it("un pedido cobrado por Stripe no se puede devolver a sin pago", async () => {
      const id = await repo.crearPedidoIniciado(pedidoDePrueba() as never);
      await repo.marcarPagado({ pedidoId: id, sessionId: "cs_test_intocable" });
      expect(await repo.cambiarEstadoAMano(id, "sin_pago")).toBe(false);
      expect((await repo.listarPedidos(50)).find((p) => p.id === id)?.estado).toBe("pagado");
    });

    it("un carrito abandonado (iniciado) no se puede marcar como cobrado a mano", async () => {
      const id = await repo.crearPedidoIniciado(pedidoDePrueba() as never);
      expect(await repo.cambiarEstadoAMano(id, "pagado")).toBe(false);
      const { rows } = await pool.query("select estado from pedidos where id = $1", [id]);
      expect(rows[0].estado).toBe("iniciado");
    });

    it("un id que no existe devuelve false, no revienta", async () => {
      expect(
        await repo.cambiarEstadoAMano("00000000-0000-0000-0000-000000000000", "pagado"),
      ).toBe(false);
    });
  });

  describe("número de pedido", () => {
    it("se asigna al entrar en la lista; un carrito abandonado no gasta número", async () => {
      const numero = async (id: string) =>
        (await pool.query<{ numero: number | null }>("select numero from pedidos where id = $1", [id])).rows[0].numero;

      const porCobrar = await repo.crearPedidoIniciado(pedidoDePrueba() as never, { estado: "sin_pago" });
      const n1 = await numero(porCobrar);
      expect(n1).toBeGreaterThan(0);

      const abandonado = await repo.crearPedidoIniciado(pedidoDePrueba() as never);
      expect(await numero(abandonado)).toBeNull();

      const conTarjeta = await repo.crearPedidoIniciado(pedidoDePrueba() as never);
      const anotado = await repo.marcarPagado({ pedidoId: conTarjeta, sessionId: `cs_num_${Date.now()}` });
      expect(anotado?.numero).toBeGreaterThan(n1!);
      expect(await numero(conTarjeta)).toBe(anotado?.numero);
    });
  });

  describe("filtros del panel", () => {
    it("filtra por día de entrega y por día de entrada, y se pueden combinar", async () => {
      // Días de entrega que no usa ninguna otra prueba: la tabla se comparte.
      const entregaHoy = await repo.crearPedidoIniciado(
        pedidoDePrueba({ dateISO: "2031-01-05" }) as never,
        { estado: "sin_pago" },
      );
      const entregaOtro = await repo.crearPedidoIniciado(
        pedidoDePrueba({ dateISO: "2031-01-06" }) as never,
        { estado: "sin_pago" },
      );
      // Entró ayer: se fuerza `created_at`, que el repositorio no deja elegir.
      await pool.query(
        "update pedidos set created_at = created_at - interval '1 day' where id = $1",
        [entregaOtro],
      );
      // El día de Madrid, como filtra el repositorio: con el de UTC, entre
      // las 00:00 y las 02:00 de Madrid «ayer» caía un día antes y fallaba.
      const diaMadrid = (ms: number) =>
        new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date(ms));
      const hoy = diaMadrid(Date.now());
      const ayer = diaMadrid(Date.now() - 86_400_000);

      const porEntrega = await repo.listarPedidos(50, {
        entregaDesde: "2031-01-05",
        entregaHasta: "2031-01-05",
      });
      expect(porEntrega.map((p) => p.id)).toEqual([entregaHoy]);

      const porEntrada = await repo.listarPedidos(50, { entradaDesde: ayer, entradaHasta: ayer });
      expect(porEntrada.map((p) => p.id)).toContain(entregaOtro);
      expect(porEntrada.map((p) => p.id)).not.toContain(entregaHoy);

      const combinado = await repo.listarPedidos(50, {
        entregaDesde: "2031-01-06",
        entregaHasta: "2031-01-06",
        entradaDesde: hoy,
        entradaHasta: hoy,
      });
      expect(combinado).toEqual([]);

      // Un rango de entrega coge los dos días; solo `desde`, de ahí en adelante.
      const rango = { entregaDesde: "2031-01-05", entregaHasta: "2031-01-06" };
      const enRango = (await repo.listarPedidos(50, rango)).map((p) => p.id);
      expect(enRango).toEqual(expect.arrayContaining([entregaHoy, entregaOtro]));
      expect(await repo.contarPedidos(rango)).toBe(2);
      const desde = (await repo.listarPedidos(50, { entregaDesde: "2031-01-06" })).map((p) => p.id);
      expect(desde).toContain(entregaOtro);
      expect(desde).not.toContain(entregaHoy);

      // Paginado: dos páginas de uno, sin repetir y sin perder ninguno.
      const pag1 = await repo.listarPedidos(1, rango, 0);
      const pag2 = await repo.listarPedidos(1, rango, 1);
      expect([...pag1, ...pag2].map((p) => p.id).sort()).toEqual([entregaHoy, entregaOtro].sort());
    });
  });

  describe("búsqueda de texto libre", () => {
    // Marca propia, distinta de la del resto del fichero: otras pruebas
    // corren a la vez contra la misma base, así que solo se crea, se
    // busca y se borra lo que lleva este correo. El 2034 no lo usa nadie.
    const CORREO_BUSQUEDA = "buscador@prueba.test";
    const NOMBRE = "Búsqueda Prueba Zeta";
    const TELEFONO = "699000111";
    let idBuscado: string;

    beforeAll(async () => {
      await pool.query("delete from pedidos where email = $1", [CORREO_BUSQUEDA]);
      idBuscado = await repo.crearPedidoIniciado(
        {
          ...pedidoDePrueba({ dateISO: "2034-02-01" }),
          payload: {
            ...pedidoDePrueba({ dateISO: "2034-02-01" }).payload,
            email: CORREO_BUSQUEDA,
            phone: TELEFONO,
            name: NOMBRE,
          },
        } as never,
        { estado: "sin_pago" },
      );
    });

    afterAll(async () => {
      await pool.query("delete from pedidos where email = $1", [CORREO_BUSQUEDA]);
    });

    const idsQueCasan = async (texto: string) =>
      (await repo.listarPedidos(50, { texto }))
        .filter((p) => p.email === CORREO_BUSQUEDA)
        .map((p) => p.id);

    it("encuentra por un trozo del nombre, sin importar mayúsculas", async () => {
      expect(await idsQueCasan("prueba zeta")).toContain(idBuscado);
      expect(await idsQueCasan("  BÚSQUEDA ")).toContain(idBuscado);
    });

    it("encuentra por correo", async () => {
      expect(await idsQueCasan("buscador@")).toContain(idBuscado);
    });

    it("encuentra el teléfono aunque se teclee con espacios", async () => {
      expect(await idsQueCasan("699 000 111")).toContain(idBuscado);
      expect(await idsQueCasan("699000111")).toContain(idBuscado);
    });

    it("encuentra por los primeros caracteres de la referencia", async () => {
      expect(await idsQueCasan(idBuscado.slice(0, 8))).toContain(idBuscado);
      expect(await idsQueCasan(idBuscado.slice(0, 8).toUpperCase())).toContain(idBuscado);
    });

    it("no encuentra nada con un texto que no casa", async () => {
      expect(await idsQueCasan("ornitorrinco-zeta-2034")).toEqual([]);
    });

    it("un % tecleado se busca tal cual, no como comodín", async () => {
      // Sin escape, «%» casaría con todo y este pedido saldría igualmente.
      expect(await idsQueCasan("%")).toEqual([]);
      expect(await idsQueCasan("z%ta")).toEqual([]);
    });

    it("con el texto vacío o solo espacios no se filtra", async () => {
      expect(await idsQueCasan("   ")).toContain(idBuscado);
    });

    it("se combina con el filtro de fecha de entrega", async () => {
      const ids = (
        await repo.listarPedidos(50, {
          texto: NOMBRE,
          entregaDesde: "2034-02-01",
          entregaHasta: "2034-02-01",
        })
      ).map((p) => p.id);
      expect(ids).toContain(idBuscado);
      const ninguno = await repo.listarPedidos(50, {
        texto: NOMBRE,
        entregaDesde: "2034-02-02",
        entregaHasta: "2034-02-02",
      });
      expect(ninguno.filter((p) => p.email === CORREO_BUSQUEDA)).toEqual([]);
    });
  });

  it("crearPedidoReconstruido es idempotente: dos entregas del mismo webhook no duplican las líneas", async () => {
    const datos = {
      stripeSessionId: "cs_test_reconstruido",
      mode: "domicilio" as const,
      fechaEntrega: "2026-12-24",
      slot: null,
      storeId: null,
      address: "Calle de la Prueba 1",
      postalCode: "28100",
      email: "cliente@example.com",
      telefono: "666123456",
      nombre: "Ana",
      notas: null,
      totalCents: 4270,
      lineas: [
        { nombre: "Tarta de queso", qty: 2, unitPriceCents: 1850 },
        { nombre: "Croissant", qty: 3, unitPriceCents: 190 },
      ],
    };

    await repo.crearPedidoReconstruido(datos);
    await repo.crearPedidoReconstruido(datos);

    const { rows: pedidos } = await pool.query(
      "select count(*)::int as n from pedidos where stripe_session_id = $1",
      [datos.stripeSessionId],
    );
    expect(pedidos[0].n).toBe(1);

    const { rows: lineas } = await pool.query(
      `select count(*)::int as n from lineas_pedido l
        join pedidos p on p.id = l.pedido_id
       where p.stripe_session_id = $1`,
      [datos.stripeSessionId],
    );
    expect(lineas[0].n).toBe(2);
  });

  it("un pedido reconstruido guarda la entrega que venía en Stripe, no una inventada", async () => {
    await repo.crearPedidoReconstruido({
      stripeSessionId: "cs_test_con_entrega",
      mode: "domicilio",
      fechaEntrega: "2026-12-24",
      slot: null,
      storeId: null,
      address: "Calle de la Prueba 1",
      postalCode: "28100",
      email: "cliente@example.com",
      telefono: "666123456",
      nombre: null,
      notas: null,
      totalCents: 3000,
      lineas: [{ nombre: "Roscón", qty: 1, unitPriceCents: 3000 }],
    });

    const [pedido] = (await repo.listarPedidos(50)).filter(
      (p) => p.stripeSessionId === "cs_test_con_entrega",
    );
    // Antes esto era siempre 'recogida' y la fecha de hoy, escritas a mano
    // por la propia función mientras el webhook tenía los datos buenos
    // delante y no los pasaba.
    expect(pedido.mode).toBe("domicilio");
    expect(pedido.fechaEntrega).toBe("2026-12-24");
    expect(pedido.postalCode?.trim()).toBe("28100");
  });

  it("lo que Stripe no trae se guarda como nulo, no como un valor por defecto", async () => {
    await repo.crearPedidoReconstruido({
      stripeSessionId: "cs_test_sin_entrega",
      mode: null,
      fechaEntrega: null,
      slot: null,
      storeId: null,
      address: null,
      postalCode: null,
      email: "cliente@example.com",
      telefono: "666123456",
      nombre: null,
      notas: null,
      totalCents: 3000,
      lineas: [{ nombre: "Roscón", qty: 1, unitPriceCents: 3000 }],
    });

    const [pedido] = (await repo.listarPedidos(50)).filter(
      (p) => p.stripeSessionId === "cs_test_sin_entrega",
    );
    // El panel lo enseña como «sin datos»: un día y una modalidad
    // inventados serían peores que admitir que no se saben.
    expect(pedido.mode).toBeNull();
    expect(pedido.fechaEntrega).toBeNull();
  });
});
