import { describe, expect, it, beforeAll, afterAll } from "vitest";

const URL_PRUEBAS = process.env.DATABASE_URL_TEST;
const describeSiHayBD = URL_PRUEBAS ? describe : describe.skip;

describeSiHayBD("repositorio de productos", () => {
  let pool: import("pg").Pool;
  let repo: typeof import("~/lib/db/productos");

  const datos = (extra: Record<string, unknown> = {}) => ({
    name: "Tarta de queso",
    category: "tartas",
    seccion: "cremosas",
    priceCents: 1850,
    consultar: false,
    unit: "8–10 raciones",
    shortDescription: "Receta tradicional, elaboración diaria.",
    cuerpo: "**Especialidad desde 1986.**",
    allergens: ["gluten", "huevo"],
    destacado: false,
    temporada: false,
    orden: 205,
    imageUrl: null,
    imageAlt: null,
    imageWidth: null,
    imageHeight: null,
    fotosExtra: [],
    fotoProvisional: false,
    activo: true,
    agotado: false,
    especialidad: null,
    variantes: [],
    ...extra,
  });

  /** Lo creado por este fichero, para borrar solo eso al acabar. */
  const creados: string[] = [];
  const crea = async (d: Parameters<typeof repo.crearProducto>[0]) => {
    const p = await repo.crearProducto(d);
    creados.push(p.id);
    return p;
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: URL_PRUEBAS, max: 2 });
    repo = await import("~/lib/db/productos");
    await pool.query("delete from productos");
  });

  afterAll(async () => {
    // Solo lo propio: otros ficheros (packs) usan la tabla a la vez, y
    // vaciarla entera al acabar les quitaba sus fichas a media prueba.
    await pool.query("delete from productos where id = any($1::uuid[])", [creados]);
    await pool.end();
  });

  it("productosParaPedido devuelve la categoría y la sección", async () => {
    const p = await crea(
      datos({ name: "Quiche de prueba pedido", category: "salado", seccion: "quiches" }),
    );
    const mapa = await repo.productosParaPedido([p.slug]);
    expect(mapa.get(p.slug)).toMatchObject({
      category: "salado",
      seccion: "quiches",
    });
  });

  it("productosDeSecciones trae todas las de la sección, agotadas incluidas, y ninguna de otra", async () => {
    const activa = await crea(
      datos({ name: "Quiche activa secciones", category: "salado", seccion: "quiches", orden: 301 }),
    );
    const agotada = await crea(
      datos({
        name: "Quiche agotada secciones",
        category: "salado",
        seccion: "quiches",
        agotado: true,
        orden: 302,
      }),
    );
    const plancha = await crea(
      datos({ name: "Plancha secciones", category: "tartas", seccion: "planchas", orden: 303 }),
    );

    const quiches = await repo.productosDeSecciones(["quiches"]);
    const slugs = quiches.map((p) => p.slug);
    expect(slugs).toContain(activa.slug);
    expect(slugs).toContain(agotada.slug);
    expect(slugs).not.toContain(plancha.slug);
    // En orden de carta: `orden` primero.
    expect(slugs.indexOf(activa.slug)).toBeLessThan(slugs.indexOf(agotada.slug));
    expect(quiches.every((p) => p.seccion === "quiches")).toBe(true);
    expect(await repo.productosDeSecciones([])).toEqual([]);
  });

  it("guarda la etiqueta de especialidad y la quita al dejarla en null", async () => {
    const creado = await crea(
      datos({ name: "Flan de Queso", especialidad: "Especialidad desde 1986" }),
    );
    expect(creado.especialidad).toBe("Especialidad desde 1986");
    const sinEtiqueta = await repo.actualizarProducto(
      creado.id,
      datos({ name: "Flan de Queso", especialidad: null }),
    );
    expect(sinEtiqueta?.especialidad).toBeNull();
  });

  it("crea un producto con sus variantes y las devuelve en orden", async () => {
    const producto = await crea(
      datos({
        name: "Roscón de Reyes",
        variantes: [
          { variantId: "grande", label: "Grande", priceCents: 2600, orden: 1 },
          {
            variantId: "pequeno",
            label: "Pequeño",
            priceCents: 1800,
            orden: 0,
          },
        ],
      }),
    );

    expect(producto.slug).toBe("roscon-de-reyes");
    expect(producto.variantes.map((v) => v.variantId)).toEqual([
      "pequeno",
      "grande",
    ]);
  });

  it("guarda las fotos del carrusel en su orden y las sustituye al editar", async () => {
    const foto = (n: number) => ({
      url: `https://blob.test/productos/foto-${n}.webp`,
      alt: `Foto ${n}`,
      ancho: 1600,
      alto: 1067,
    });
    const producto = await crea(
      datos({ name: "Tarta con carrusel", fotosExtra: [foto(2), foto(1)] }),
    );
    expect(producto.fotosExtra).toEqual([foto(2), foto(1)]);

    const cambiado = await repo.actualizarProducto(producto.id, {
      ...datos({ name: "Tarta con carrusel" }),
      fotosExtra: [foto(3)],
    });
    expect(cambiado?.fotosExtra).toEqual([foto(3)]);
    expect((await repo.obtenerProducto(producto.slug))?.fotosExtra).toEqual([foto(3)]);
  });

  it("guarda la marca de foto provisional y la quita al editar", async () => {
    const producto = await crea(
      datos({ name: "Tarta con foto prestada", fotoProvisional: true }),
    );
    expect(producto.fotoProvisional).toBe(true);
    const cambiado = await repo.actualizarProducto(producto.id, {
      ...datos({ name: "Tarta con foto prestada" }),
      fotoProvisional: false,
    });
    expect(cambiado?.fotoProvisional).toBe(false);
  });

  it("una ficha sin fotos de carrusel devuelve una lista vacía, no null", async () => {
    const producto = await crea(datos({ name: "Tarta sin carrusel" }));
    expect(producto.fotosExtra).toEqual([]);
  });

  it("sustituye las variantes al editar, no las acumula", async () => {
    const producto = await crea(
      datos({
        name: "Brazo de gitano",
        variantes: [
          { variantId: "chico", label: "Chico", priceCents: 1200, orden: 0 },
        ],
      }),
    );

    const cambiado = await repo.actualizarProducto(producto.id, {
      ...datos({ name: "Brazo de gitano" }),
      variantes: [
        { variantId: "grande", label: "Grande", priceCents: 1900, orden: 0 },
      ],
    });

    expect(cambiado?.variantes).toHaveLength(1);
    expect(cambiado?.variantes[0].variantId).toBe("grande");
  });

  it("el slug no se recalcula al editar, aunque cambie el nombre", async () => {
    const producto = await crea(
      datos({ name: "Torta de aceite" }),
    );
    expect(producto.slug).toBe("torta-de-aceite");

    // Nombre distinto a propósito: si `actualizarProducto` recalculara el
    // slug a partir de él, esta prueba lo detectaría. Con el mismo nombre
    // de antes, un slug recalculado por error habría dado el mismo valor
    // y habría pasado igual (el fallo real que se le escapó a la tarea 14
    // la primera vez).
    const cambiado = await repo.actualizarProducto(producto.id, {
      ...datos({ name: "Torta de aceite de oliva virgen extra" }),
      variantes: [],
    });

    expect(cambiado?.slug).toBe("torta-de-aceite");
  });

  it("no deja guardar una ficha sin precio y sin «consultar»", async () => {
    await expect(
      crea(
        datos({ name: "Sin precio", priceCents: null, consultar: false }),
      ),
    ).rejects.toMatchObject({ name: "ProductoError" });
  });

  it("un producto desactivado desaparece del catálogo y de su propia URL", async () => {
    const producto = await crea(
      datos({ name: "Retirada", activo: false }),
    );

    const activos = await repo.listarProductos({ soloActivos: true });
    expect(activos.map((p) => p.id)).not.toContain(producto.id);

    expect(
      await repo.obtenerProducto(producto.slug, { soloActivo: true }),
    ).toBeNull();
    // Pero el panel sí lo ve: desactivar no es borrar.
    expect(await repo.obtenerProducto(producto.slug)).not.toBeNull();
    const todos = await repo.listarProductos({ soloActivos: false });
    expect(todos.map((p) => p.id)).toContain(producto.id);
  });

  it("productosParaPedido trae solo lo pedido, con su estado de venta", async () => {
    const vendible = await crea(datos({ name: "A la venta" }));
    const agotado = await crea(
      datos({ name: "Se acabó", agotado: true }),
    );
    // La otra mitad del contrato del docstring: `priceOrder` (tarea 16)
    // también necesita poder decir «ya no está disponible» de un producto
    // desactivado, no solo «se ha agotado» de uno agotado.
    const desactivado = await crea(
      datos({ name: "Retirada del pedido", activo: false }),
    );

    const mapa = await repo.productosParaPedido([
      vendible.slug,
      agotado.slug,
      desactivado.slug,
      "no-existe",
    ]);

    expect(mapa.size).toBe(3);
    expect(mapa.get(vendible.slug)?.agotado).toBe(false);
    expect(mapa.get(agotado.slug)?.agotado).toBe(true);
    expect(mapa.get(desactivado.slug)?.activo).toBe(false);
    expect(mapa.get("no-existe")).toBeUndefined();
  });

  it("el listado del catálogo va en el orden de la carta", async () => {
    await pool.query("delete from productos where id = any($1::uuid[])", [creados]);
    await crea(datos({ name: "Segunda", orden: 200 }));
    await crea(datos({ name: "Primera", orden: 100 }));
    const lista = await repo.listarProductos({ soloActivos: true });
    // Otros ficheros comparten la tabla y pueden dejar filas suyas a media
    // ejecución: solo se mira el orden de las dos propias.
    const propias = lista.map((p) => p.name).filter((n) => n === "Primera" || n === "Segunda");
    expect(propias).toEqual(["Primera", "Segunda"]);
  });

  // Ofertas de Este mes: la noticia rebaja el producto en lo público y en el
  // cobro, nunca en lo que lee el panel. Van en este fichero y no en uno
  // propio porque este vacía `productos` al empezar y al acabar: en otro
  // fichero, que corre en paralelo, se quedarían sin su producto a medias.
  describe("ofertas de Este mes", () => {
    let noticias: typeof import("~/lib/db/noticias");
    const ids: string[] = [];
    const noticia = (productoId: string, extra: Record<string, unknown>) =>
      noticias
        .crearNoticia({
          titulo: `Oferta de prueba ${Math.random().toString(36).slice(2, 8)}`,
          excerpt: "Una oferta para las pruebas del repositorio.",
          cuerpo: "",
          fecha: "2026-10-01",
          imageUrl: null,
          imageAlt: null,
          imageWidth: null,
          imageHeight: null,
          tags: [],
          publicada: true,
          productoId,
          ...extra,
        })
        .then((n) => (ids.push(n.id), n));
    const hoyMadrid = () =>
      new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Madrid" }).format(new Date());

    beforeAll(async () => {
      noticias = await import("~/lib/db/noticias");
    });
    afterAll(async () => {
      await pool.query("delete from noticias where id = any($1::uuid[])", [ids]);
    });

    it("rebaja en el cobro y en la carta pública, y deja el panel con el precio de siempre", async () => {
      const p = await crea(
        datos({
          name: "Tarta en oferta",
          variantes: [
            { variantId: "s", label: "S", priceCents: 1800, orden: 0 },
            { variantId: "m", label: "M", priceCents: 2600, orden: 1 },
          ],
        }),
      );
      await noticia(p.id, { ofertaVariantes: { m: 2200 }, ofertaHasta: hoyMadrid() });

      const cobro = (await repo.productosParaPedido([p.slug])).get(p.slug)!;
      expect(cobro.variantes.map((v) => v.priceCents)).toEqual([1800, 2200]);
      expect(cobro.variantes[1].precioAntesCents).toBe(2600);

      const ficha = await repo.obtenerProducto(p.slug, { conOfertas: true });
      expect(ficha?.variantes[1].priceCents).toBe(2200);
      expect(ficha?.ofertaHasta).toBe(hoyMadrid());

      const panel = (await repo.listarProductos({ soloActivos: false })).find((x) => x.id === p.id);
      expect(panel?.variantes[1].priceCents).toBe(2600);
      expect(panel?.variantes[1].precioAntesCents).toBeUndefined();
    });

    it("no rebaja si la oferta caducó ayer o si la noticia no está publicada", async () => {
      const caducada = await crea(datos({ name: "Oferta caducada" }));
      await noticia(caducada.id, { ofertaCents: 1000, ofertaHasta: "2020-01-01" });
      const borrador = await crea(datos({ name: "Oferta en borrador" }));
      await noticia(borrador.id, { ofertaCents: 1000, publicada: false });

      const mapa = await repo.productosParaPedido([caducada.slug, borrador.slug]);
      expect(mapa.get(caducada.slug)?.priceCents).toBe(1850);
      expect(mapa.get(borrador.slug)?.priceCents).toBe(1850);
    });

    it("la tarjeta de Este mes enseña el producto rebajado", async () => {
      const p = await crea(datos({ name: "Empanada en oferta" }));
      const n = await noticia(p.id, { ofertaCents: 1500 });
      const publica = await noticias.obtenerNoticia(n.slug, { soloPublicada: true });
      expect(publica?.producto?.priceCents).toBe(1500);
      expect(publica?.producto?.precioAntesCents).toBe(1850);
      expect(publica?.ofertaCents).toBe(1500);
    });
  });

  // Secciones de Este mes: aquí y no en un fichero propio por lo mismo que
  // las ofertas (este fichero vacía `productos` al empezar).
  describe("secciones de Este mes", () => {
    let secciones: typeof import("~/lib/db/seccionesEsteMes");
    const ids: string[] = [];
    const nueva = async (d: Partial<import("~/lib/db/seccionesEsteMes").DatosSeccion>) => {
      const s = await secciones.crearSeccion({
        titulo: "Sección de prueba",
        descripcion: "",
        orden: 0,
        publicada: true,
        productoIds: [],
        ...d,
      });
      ids.push(s.id);
      return s;
    };

    beforeAll(async () => {
      secciones = await import("~/lib/db/seccionesEsteMes");
    });
    afterAll(async () => {
      await pool.query("delete from secciones_este_mes where id = any($1::uuid[])", [ids]);
    });

    it("guarda los productos en el orden elegido y los cambia al editar", async () => {
      const a = await crea(datos({ name: "Sin gluten A" }));
      const b = await crea(datos({ name: "Sin gluten B" }));
      const s = await nueva({ titulo: "Nuevos sin gluten", productoIds: [b.id, a.id] });
      expect(s.productoIds).toEqual([b.id, a.id]);

      const editada = await secciones.actualizarSeccion(s.id, {
        titulo: "Nuevos sin gluten",
        descripcion: "Recién salidos del obrador.",
        orden: 1,
        publicada: true,
        productoIds: [a.id],
      });
      expect(editada?.productoIds).toEqual([a.id]);
      expect(editada?.descripcion).toBe("Recién salidos del obrador.");
    });

    it("la web solo ve las publicadas, con sus productos activos y en orden", async () => {
      const activo = await crea(datos({ name: "Producto visible" }));
      const inactivo = await crea(datos({ name: "Producto retirado", activo: false }));
      const vista = await nueva({ titulo: "Visible", orden: -100, productoIds: [inactivo.id, activo.id] });
      const oculta = await nueva({ titulo: "Oculta", publicada: false, productoIds: [activo.id] });
      const vacia = await nueva({ titulo: "Sin activos", orden: -99, productoIds: [inactivo.id] });

      const publicas = await secciones.seccionesPublicas();
      const mia = publicas.find((s) => s.id === vista.id);
      expect(mia?.productos.map((p) => p.id)).toEqual([activo.id]);
      expect(publicas.some((s) => s.id === oculta.id)).toBe(false);
      // Sin ningún producto activo, no se enseña.
      expect(publicas.some((s) => s.id === vacia.id)).toBe(false);
    });

    it("una sección publicada rebaja sus productos en el cobro; oculta o caducada, no", async () => {
      const a = await crea(datos({ name: "Rebajado por sección" }));
      const b = await crea(
        datos({
          name: "Rebajado por tamaño en sección",
          variantes: [
            { variantId: "s", label: "S", priceCents: 1800, orden: 0 },
            { variantId: "m", label: "M", priceCents: 2600, orden: 1 },
          ],
        }),
      );
      const oculta = await crea(datos({ name: "Sección oculta con oferta" }));
      const caducada = await crea(datos({ name: "Sección caducada con oferta" }));
      const s = await nueva({
        titulo: "Con ofertas",
        productoIds: [a.id, b.id],
        ofertas: {
          [a.id]: { ofertaCents: 1500, ofertaVariantes: {} },
          [b.id]: { ofertaCents: null, ofertaVariantes: { m: 2000 } },
        },
      });
      await nueva({ titulo: "Oculta", publicada: false, productoIds: [oculta.id], ofertas: { [oculta.id]: { ofertaCents: 900, ofertaVariantes: {} } } });
      await nueva({ titulo: "Caducada", productoIds: [caducada.id], ofertaHasta: "2020-01-01", ofertas: { [caducada.id]: { ofertaCents: 900, ofertaVariantes: {} } } });

      expect(s.ofertas[a.id]).toEqual({ ofertaCents: 1500, ofertaVariantes: {} });
      const cobro = await repo.productosParaPedido([a.slug, b.slug, oculta.slug, caducada.slug]);
      expect(cobro.get(a.slug)?.priceCents).toBe(1500);
      expect(cobro.get(a.slug)?.precioAntesCents).toBe(1850);
      expect(cobro.get(b.slug)?.variantes.map((v) => v.priceCents)).toEqual([1800, 2000]);
      expect(cobro.get(oculta.slug)?.priceCents).toBe(1850);
      expect(cobro.get(caducada.slug)?.priceCents).toBe(1850);

      const publica = (await secciones.seccionesPublicas()).find((x) => x.id === s.id);
      expect(publica?.productos[0].priceCents).toBe(1500);
    });

    it("el orden del panel decide dónde sale cada sección", async () => {
      const p = await crea(datos({ name: "Para ordenar secciones" }));
      const x = await nueva({ titulo: "Orden X", orden: 500, productoIds: [p.id] });
      const y = await nueva({ titulo: "Orden Y", orden: 501, productoIds: [p.id] });
      await secciones.ordenarSecciones([y.id, x.id]);
      const ids = (await secciones.listarSecciones()).map((s) => s.id).filter((id) => id === x.id || id === y.id);
      expect(ids).toEqual([y.id, x.id]);
    });

    it("borrar un producto de la carta lo quita de la sección sin romperla", async () => {
      const p = await crea(datos({ name: "Se borrará" }));
      const s = await nueva({ titulo: "Con borrado", productoIds: [p.id] });
      await pool.query("delete from productos where id = $1", [p.id]);
      const tras = (await secciones.listarSecciones()).find((x) => x.id === s.id);
      expect(tras?.productoIds).toEqual([]);
      expect(await secciones.borrarSeccion(s.id)).toBe(true);
    });
  });
});
