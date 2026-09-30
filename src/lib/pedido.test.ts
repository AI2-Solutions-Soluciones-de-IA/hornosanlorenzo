import { describe, expect, it, vi, beforeEach } from "vitest";
import { earliestDate } from "~/lib/entrega";
import type { ProductoVendible } from "~/lib/db/productos";

/**
 * `priceOrder` es la pieza del dinero: el checkout entero se apoya en que
 * el precio y el destinatario del pedido salen del servidor, nunca del
 * navegador. Estas pruebas fijan esa intención.
 *
 * El catálogo ya no sale de la colección de contenido, sino de la tabla
 * `productos` a través de `productosParaPedido`. Se dobla ese import: así
 * las pruebas no dependen de qué haya cargado en la base de pruebas ese
 * día, y siguen siendo tan rápidas como cuando leían Markdown.
 */
const productosParaPedido = vi.fn();
const productosDeSecciones = vi.fn();
vi.mock("~/lib/db/productos", () => ({
  productosParaPedido,
  productosDeSecciones,
}));
// La foto se comprueba contra Vercel Blob: aquí se dobla, y su lógica real
// se prueba en su propio fichero.
const esFotoDePedido = vi.fn();
vi.mock("~/lib/storage/fotos-pedido", () => ({ esFotoDePedido }));

const { priceOrder } = await import("~/lib/pedido");
type OrderPayload = import("~/lib/pedido").OrderPayload;

/** Un producto sencillo, sin variantes, con precio de venta online. */
const SENCILLO: ProductoVendible = {
  slug: "tarta-de-queso",
  name: "Tarta de queso",
  category: "tartas",
  seccion: null,
  priceCents: 1850,
  consultar: false,
  activo: true,
  agotado: false,
  variantes: [],
};

/**
 * Un producto con tamaños. El precio base NO coincide con ninguna variante a
 * propósito: es exactamente el destape que trajo el panel (antes, en los 98
 * Markdown, el base era siempre el del tamaño más barato), y es lo que hace
 * visible que valorar sin `variantId` cobra un importe que ya no existe.
 */
const CON_TAMANOS: ProductoVendible = {
  slug: "bombon-noir",
  name: "Bombón Noir",
  category: "tartas",
  seccion: null,
  priceCents: 1650,
  consultar: false,
  activo: true,
  agotado: false,
  variantes: [
    { variantId: "pequena", label: "Pequeña", priceCents: 1800 },
    { variantId: "mediana", label: "Mediana", priceCents: 2600 },
  ],
};

const catalogo = (...productos: ProductoVendible[]) =>
  new Map(productos.map((p) => [p.slug, p]));

/**
 * `now` y `dateISO` van fijados a mano con `earliestDate`, no con una fecha
 * cualquiera: así la prueba no depende de qué día de la semana se ejecute
 * ni de las reglas de plazo cambiando con el tiempo.
 */
const AHORA = new Date("2026-03-10T10:00:00");
const FECHA_RECOGIDA = earliestDate("recogida", AHORA, {
  storeId: "alcobendas",
});
const FECHA_DOMICILIO = earliestDate("domicilio", AHORA);

beforeEach(() => {
  productosParaPedido.mockReset().mockResolvedValue(catalogo(SENCILLO));
});

const pedidoBase = (): OrderPayload => ({
  items: [{ slug: SENCILLO.slug, qty: 2 }],
  mode: "recogida",
  dateISO: FECHA_RECOGIDA,
  // FECHA_RECOGIDA es el mismo día (se pide a las 10:00 en Alcobendas), y
  // la recogida del mismo día solo es de tarde.
  slot: "afternoon",
  storeId: "alcobendas",
  email: "cliente@example.com",
  phone: "666123456",
});

describe("priceOrder", () => {
  it("rechaza un código postal fuera de la zona de reparto", async () => {
    // El pedido tiene que ser válido en todo salvo el código postal: un
    // slug inventado también lo habría rechazado (por «producto no
    // disponible»), pero entonces la prueba seguiría en verde aunque se
    // rompiera del todo la validación de zona. Con un producto real y una
    // fecha válida para domicilio, lo único que puede fallar es el CP.
    const payload: OrderPayload = {
      items: [{ slug: SENCILLO.slug, qty: 1 }],
      mode: "domicilio",
      dateISO: FECHA_DOMICILIO,
      address: "Calle Falsa 123",
      // Ningún rango de `admiteCP` llega a 28900: fuera de zona a propósito.
      postalCode: "28900",
      email: "cliente@example.com",
      phone: "666123456",
    };

    // No basta con comprobar que lanza `OrderError`: cualquier otro motivo
    // de rechazo (fecha, producto, teléfono...) también es un `OrderError`
    // y dejaría pasar la prueba aunque `admiteCP` se rompiera. Se afirma
    // sobre el motivo, no solo sobre el tipo.
    await expect(priceOrder(payload, { now: AHORA })).rejects.toMatchObject({
      message: expect.stringContaining(
        "No repartimos en el código postal 28900",
      ),
    });
  });

  it("rechaza un reparto por debajo del mínimo del día de entrega", async () => {
    // Miércoles 11 de marzo: mínimo de 25 €. Una tarta de 18,50 no llega.
    const payload: OrderPayload = {
      items: [{ slug: SENCILLO.slug, qty: 1 }],
      mode: "domicilio",
      dateISO: FECHA_DOMICILIO,
      address: "Calle Falsa 123",
      postalCode: "28001",
      email: "cliente@example.com",
      phone: "666123456",
    };
    await expect(priceOrder(payload, { now: AHORA })).rejects.toMatchObject({
      message: expect.stringContaining("mínimo a domicilio es de 25 €"),
    });
  });

  it("el viernes el mínimo del reparto sube a 35 €", async () => {
    // Dos tartas, 37 €: pasan el viernes 13. Con una menos de precio no.
    const payload: OrderPayload = {
      items: [{ slug: SENCILLO.slug, qty: 2 }],
      mode: "domicilio",
      dateISO: "2026-03-13",
      address: "Calle Falsa 123",
      postalCode: "28001",
      email: "cliente@example.com",
      phone: "666123456",
    };
    await expect(priceOrder(payload, { now: AHORA })).resolves.toMatchObject({
      subtotalCents: 3700,
    });

    productosParaPedido.mockResolvedValue(
      catalogo({ ...SENCILLO, priceCents: 1500 }),
    );
    await expect(priceOrder(payload, { now: AHORA })).rejects.toMatchObject({
      message: expect.stringContaining("mínimo a domicilio es de 35 €"),
    });
  });

  it("la recogida del mismo día no admite la franja de mañana", async () => {
    expect(FECHA_RECOGIDA).toBe("2026-03-10");
    await expect(
      priceOrder({ ...pedidoBase(), slot: "morning" }, { now: AHORA }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("a partir de las 17:00"),
    });
  });

  it("en Alcobendas el sábado solo se recoge por la mañana", async () => {
    const sabado = { ...pedidoBase(), dateISO: "2026-03-14" };
    await expect(
      priceOrder({ ...sabado, slot: "afternoon" }, { now: AHORA }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("cierra a las 14:30"),
    });
    await expect(
      priceOrder({ ...sabado, slot: "morning" }, { now: AHORA }),
    ).resolves.toBeTruthy();
  });

  it("a partir de las 13:00 Alcobendas ya no prepara para hoy", () => {
    expect(
      earliestDate("recogida", new Date("2026-03-10T12:59:00"), {
        storeId: "alcobendas",
      }),
    ).toBe("2026-03-10");
    expect(
      earliestDate("recogida", new Date("2026-03-10T13:00:00"), {
        storeId: "alcobendas",
      }),
    ).toBe("2026-03-11");
  });

  it("rechaza una fecha de recogida anterior a la primera disponible", async () => {
    const payload: OrderPayload = {
      ...pedidoBase(),
      // Lunes, muy anterior a cualquier `earliestDate` posible para 2026:
      // no depende de a qué hora se ejecute la prueba.
      dateISO: "2020-01-06",
    };

    await expect(priceOrder(payload, { now: AHORA })).rejects.toThrow(
      /fecha elegida no está disponible/i,
    );
  });

  it("rechaza un teléfono que no parece válido", async () => {
    const payload: OrderPayload = { ...pedidoBase(), phone: "123456789" };

    await expect(priceOrder(payload, { now: AHORA })).rejects.toThrow(
      /teléfono de contacto no parece válido/i,
    );
  });

  it("rechaza un producto que no existe en el catálogo", async () => {
    const payload: OrderPayload = {
      ...pedidoBase(),
      items: [{ slug: "no-existe", qty: 1 }],
    };

    await expect(priceOrder(payload, { now: AHORA })).rejects.toThrow(
      /ya no está disponible/i,
    );
  });

  it("rechaza una variante que no existe", async () => {
    const payload: OrderPayload = {
      ...pedidoBase(),
      items: [{ slug: SENCILLO.slug, variantId: "no-existe", qty: 1 }],
    };

    await expect(priceOrder(payload, { now: AHORA })).rejects.toThrow(
      /opción elegida.*ya no está disponible/i,
    );
  });

  it("un producto con tamaños exige elegir uno: no se cobra el precio base", async () => {
    productosParaPedido.mockResolvedValue(catalogo(CON_TAMANOS));
    const payload: OrderPayload = {
      ...pedidoBase(),
      items: [{ slug: CON_TAMANOS.slug, qty: 1 }],
    };

    await expect(priceOrder(payload, { now: AHORA })).rejects.toThrow(
      /Elige un tamaño para «Bombón Noir»/i,
    );
  });

  it("con el tamaño elegido, cobra el de la variante y lo deja escrito en la línea", async () => {
    productosParaPedido.mockResolvedValue(catalogo(CON_TAMANOS));
    const payload: OrderPayload = {
      ...pedidoBase(),
      items: [{ slug: CON_TAMANOS.slug, variantId: "mediana", qty: 1 }],
    };

    const pedido = await priceOrder(payload, { now: AHORA });

    expect(pedido.lines[0].unitPriceCents).toBe(2600);
    // Sin la etiqueta, el obrador no sabe cuál de las tartas hacer.
    expect(pedido.lines[0].variantLabel).toBe("Mediana");
  });

  it("un producto a consultar no tiene precio de venta online", async () => {
    productosParaPedido.mockResolvedValue(
      catalogo({ ...SENCILLO, consultar: true, priceCents: null }),
    );

    await expect(priceOrder(pedidoBase(), { now: AHORA })).rejects.toThrow(
      /se encarga hablando con el obrador/i,
    );
  });

  it("ignora un importe que venga del navegador: el precio sale del catálogo", async () => {
    const payload = pedidoBase();

    // El tipo `OrderPayload` no tiene ningún campo de precio —a propósito—,
    // pero si algo lo colara (un fallo del esquema de validación, por
    // ejemplo), `priceOrder` tampoco debe hacerle caso. Se fuerza el tipo
    // para simular justo ese escenario.
    const payloadConPrecioFalso = {
      ...payload,
      priceCents: 1,
      totalCents: 1,
      unitPriceCents: 1,
    } as unknown as OrderPayload;

    const pedido = await priceOrder(payloadConPrecioFalso, { now: AHORA });

    expect(pedido.lines).toHaveLength(1);
    expect(pedido.lines[0].unitPriceCents).toBe(SENCILLO.priceCents);
    expect(pedido.subtotalCents).toBe((SENCILLO.priceCents ?? 0) * 2);
    expect(pedido.totalCents).not.toBe(1);
  });

  it("no acepta el userId desde el cuerpo de la petición", async () => {
    const payload = pedidoBase();

    // Igual que el precio: el tipo no declara `userId`, pero si se colara
    // en el cuerpo no debe suplantar al de la sesión.
    const payloadConUserIdFalso = {
      ...payload,
      userId: "usuario-ajeno",
    } as unknown as OrderPayload;

    const sinSesion = await priceOrder(payloadConUserIdFalso, { now: AHORA });
    expect(sinSesion.userId).toBeUndefined();

    const conSesion = await priceOrder(payloadConUserIdFalso, {
      now: AHORA,
      userId: "usuario-de-la-sesion",
    });
    expect(conSesion.userId).toBe("usuario-de-la-sesion");
  });
});

describe("priceOrder — estados de venta", () => {
  it("un producto desactivado no se puede comprar, y se dice sin tecnicismos", async () => {
    productosParaPedido.mockResolvedValue(
      catalogo({ ...SENCILLO, activo: false }),
    );
    await expect(priceOrder(pedidoBase(), { now: AHORA })).rejects.toThrow(
      /ya no está disponible/i,
    );
  });

  it("un producto agotado tampoco, y con un mensaje distinto", async () => {
    productosParaPedido.mockResolvedValue(
      catalogo({ ...SENCILLO, agotado: true }),
    );
    await expect(priceOrder(pedidoBase(), { now: AHORA })).rejects.toThrow(
      /se ha agotado/i,
    );
  });

  it("agotado y a consultar a la vez: gana el mensaje de consultar, no el de agotado", async () => {
    // Un producto sin precio de venta online no es de los que «vuelven a
    // haber»: decirle al cliente que lo reintente sería engañoso. El orden
    // de las comprobaciones importa, así que se fija aquí y no queda como
    // un detalle incidental de la implementación.
    productosParaPedido.mockResolvedValue(
      catalogo({
        ...SENCILLO,
        consultar: true,
        priceCents: null,
        agotado: true,
      }),
    );
    await expect(priceOrder(pedidoBase(), { now: AHORA })).rejects.toThrow(
      /se encarga hablando con el obrador/i,
    );
  });

  it("el precio sale del catálogo, nunca de lo que mande el navegador", async () => {
    // El payload no tiene ni un campo de precio, y aun así el total es exacto.
    const order = await priceOrder(pedidoBase(), { now: AHORA });
    expect(order.subtotalCents).toBe(3700);
    expect(order.lines[0].unitPriceCents).toBe(1850);
  });

  it("solo pide a la base de datos los productos del carrito", async () => {
    await priceOrder(pedidoBase(), { now: AHORA });
    expect(productosParaPedido).toHaveBeenCalledWith([SENCILLO.slug]);
  });
});

/**
 * Packs: el precio sale de la ficha del propio pack, y las piezas (fijas y
 * elegidas) se validan contra el catálogo. Los slugs y variantes son los reales
 * de la carta; los nombres, los de la ficha.
 */
describe("priceOrder con packs", () => {
  const prod = (
    slug: string,
    name: string,
    category: string,
    seccion: string | null,
    priceCents: number,
    variantes: [string, string, number][] = [],
    extra: Partial<ProductoVendible> = {},
  ): ProductoVendible => ({
    slug,
    name,
    category,
    seccion,
    priceCents,
    consultar: false,
    activo: true,
    agotado: false,
    variantes: variantes.map(([variantId, label, priceCents]) => ({
      variantId,
      label,
      priceCents,
    })),
    ...extra,
  });

  const CATALOGO_PACKS: ProductoVendible[] = [
    prod("pack-cumpleanos", "Pack Cumpleaños", "packs", null, 7100),
    prod("pack-futbolero", "Pack Futbolero", "packs", null, 4900),
    prod("empanada-de-carne", "Empanada de carne", "empanadas", "empanadas", 1380, [
      ["media", "Media", 1380],
      ["entera", "Entera", 2280],
    ]),
    prod("empanada-de-bonito", "Empanada de bonito", "empanadas", "empanadas", 1380, [
      ["media", "Media", 1380],
      ["entera", "Entera", 2280],
    ]),
    prod("los-prenaos-de-la-casa", "Los preñaos de la casa", "para-compartir", "para-compartir", 1050, [
      ["u12", "12 unidades", 1050],
      ["u24", "24 unidades", 1850],
    ]),
    prod("plancha-oreo", "Plancha Oreo", "planchas", "planchas", 1360, [
      ["pequena", "L", 1360],
      ["grande", "XL", 2080],
    ]),
    prod("plancha-fresa-y-nata", "Plancha de fresa y nata", "planchas", "planchas", 1360, [
      ["pequena", "L", 1360],
      ["grande", "XL", 2080],
    ]),
    prod("tarta-retrato", "Tarta retrato", "tartas", "detalles-celebracion", 600, [
      ["pequena", "Pequeña", 1500],
      ["mediana", "Mediana", 1000],
      ["grande", "Grande", 600],
    ]),
    prod("mini-croissants-surtido-salado", "Mini croissants surtido salado", "las-lorenzas", "las-lorenzas-salado", 1850, [
      ["u12", "12", 1850],
      ["u24", "24", 3400],
    ]),
    prod("surtido-de-pastelitos", "Surtido de pastelitos", "bocados", "bocados", 1550, [
      ["medio-kg", "½ kg", 1550],
      ["kg", "1 kg", 2600],
    ]),
  ];

  const FOTO = "https://abc.public.blob.vercel-storage.com/pedidos-fotos/foto-x.jpg";
  const OPCIONES = { empanada: "empanada-de-carne", plancha: "plancha-oreo" };

  const conCatalogo = (cambios: Record<string, Partial<ProductoVendible>> = {}) => {
    const todo = CATALOGO_PACKS.map((p) => ({ ...p, ...cambios[p.slug] }));
    // Como la BD real: devuelve solo los slugs que se le piden.
    productosParaPedido.mockImplementation(async (slugs: string[]) =>
      catalogo(...todo.filter((p) => slugs.includes(p.slug))),
    );
  };

  const pedidoPack = (item: OrderPayload["items"][number]): OrderPayload => ({
    ...pedidoBase(),
    items: [item],
  });

  const cumple = (extra: Partial<OrderPayload["items"][number]> = {}) =>
    pedidoPack({
      slug: "pack-cumpleanos",
      qty: 1,
      opciones: OPCIONES,
      fotoUrl: FOTO,
      ...extra,
    });

  beforeEach(() => {
    conCatalogo();
    productosDeSecciones.mockReset();
    esFotoDePedido.mockReset().mockResolvedValue(true);
  });

  it("valora el Pack Cumpleaños al precio del pack, con su desglose y la foto", async () => {
    const pedido = await priceOrder(cumple(), { now: AHORA });
    expect(pedido.lines).toHaveLength(1);
    const [l] = pedido.lines;
    expect(l.unitPriceCents).toBe(7100);
    expect(l.totalCents).toBe(7100);
    expect(l.variantLabel).toBeUndefined();
    expect(l.fotoUrl).toBe(FOTO);
    expect(l.detalle).toHaveLength(4);
    expect(l.detalle!.map((d) => d.slug)).toEqual([
      "empanada-de-carne",
      "los-prenaos-de-la-casa",
      "plancha-oreo",
      "tarta-retrato",
    ]);
    expect(pedido.subtotalCents).toBe(7100);
  });

  it("con cantidad 2 cobra dos packs y el desglose sigue siendo por unidad", async () => {
    const pedido = await priceOrder(cumple({ qty: 2 }), { now: AHORA });
    expect(pedido.lines[0].totalCents).toBe(14200);
    expect(pedido.lines[0].detalle).toHaveLength(4);
  });

  it("sin opciones rechaza el pack y nombra «Pack Cumpleaños»", async () => {
    await expect(
      priceOrder(cumple({ opciones: undefined }), { now: AHORA }),
    ).rejects.toMatchObject({
      name: "OrderError",
      message: expect.stringContaining("Pack Cumpleaños"),
    });
  });

  it("rechaza una empanada agotada y la nombra", async () => {
    conCatalogo({ "empanada-de-carne": { agotado: true } });
    await expect(priceOrder(cumple(), { now: AHORA })).rejects.toMatchObject({
      name: "OrderError",
      message: expect.stringContaining("Empanada de carne"),
    });
  });

  it("rechaza una plancha puesta en el hueco de la empanada", async () => {
    await expect(
      priceOrder(
        cumple({ opciones: { empanada: "plancha-oreo", plancha: "plancha-oreo" } }),
        { now: AHORA },
      ),
    ).rejects.toMatchObject({ name: "OrderError" });
  });

  it("un pack con foto sin fotoUrl pide subirla", async () => {
    await expect(
      priceOrder(cumple({ fotoUrl: undefined }), { now: AHORA }),
    ).rejects.toMatchObject({
      name: "OrderError",
      message: expect.stringContaining("sube la foto"),
    });
  });

  it("rechaza una foto que no es de nuestro almacén", async () => {
    esFotoDePedido.mockResolvedValue(false);
    await expect(priceOrder(cumple(), { now: AHORA })).rejects.toMatchObject({
      name: "OrderError",
    });
    expect(esFotoDePedido).toHaveBeenCalledWith(FOTO);
  });

  it("un producto que no es pack no admite opciones ni foto", async () => {
    productosParaPedido.mockResolvedValue(catalogo(SENCILLO));
    for (const extra of [{ opciones: { x: "y" } }, { fotoUrl: FOTO }]) {
      await expect(
        priceOrder(pedidoPack({ slug: SENCILLO.slug, qty: 1, ...extra }), {
          now: AHORA,
        }),
      ).rejects.toMatchObject({
        name: "OrderError",
        message: "Elección no válida.",
      });
    }
  });

  it("una foto en un pack sin pieza con foto (Futbolero) se rechaza", async () => {
    await expect(
      priceOrder(
        pedidoPack({
          slug: "pack-futbolero",
          qty: 1,
          opciones: { empanada: "empanada-de-bonito" },
          fotoUrl: FOTO,
        }),
        { now: AHORA },
      ),
    ).rejects.toMatchObject({ name: "OrderError" });
  });

  it("el Pack Futbolero sin foto se valora bien", async () => {
    const pedido = await priceOrder(
      pedidoPack({
        slug: "pack-futbolero",
        qty: 1,
        opciones: { empanada: "empanada-de-bonito" },
      }),
      { now: AHORA },
    );
    expect(pedido.lines[0].totalCents).toBe(4900);
    expect(pedido.lines[0].detalle).toHaveLength(3);
    expect(esFotoDePedido).not.toHaveBeenCalled();
  });

  it("no lee secciones: la elección se valida con la sección del producto elegido", async () => {
    await priceOrder(cumple(), { now: AHORA });
    expect(productosDeSecciones).not.toHaveBeenCalled();
  });
});
