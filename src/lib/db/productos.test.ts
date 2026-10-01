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
    activo: true,
    agotado: false,
    especialidad: null,
    variantes: [],
    ...extra,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: URL_PRUEBAS, max: 2 });
    repo = await import("~/lib/db/productos");
    await pool.query("delete from productos");
  });

  afterAll(async () => {
    await pool.query("delete from productos");
    await pool.end();
  });

  it("productosParaPedido devuelve la categoría y la sección", async () => {
    const p = await repo.crearProducto(
      datos({ name: "Quiche de prueba pedido", category: "salado", seccion: "quiches" }),
    );
    const mapa = await repo.productosParaPedido([p.slug]);
    expect(mapa.get(p.slug)).toMatchObject({
      category: "salado",
      seccion: "quiches",
    });
  });

  it("productosDeSecciones trae todas las de la sección, agotadas incluidas, y ninguna de otra", async () => {
    const activa = await repo.crearProducto(
      datos({ name: "Quiche activa secciones", category: "salado", seccion: "quiches", orden: 301 }),
    );
    const agotada = await repo.crearProducto(
      datos({
        name: "Quiche agotada secciones",
        category: "salado",
        seccion: "quiches",
        agotado: true,
        orden: 302,
      }),
    );
    const plancha = await repo.crearProducto(
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
    const creado = await repo.crearProducto(
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
    const producto = await repo.crearProducto(
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
    const producto = await repo.crearProducto(
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

  it("una ficha sin fotos de carrusel devuelve una lista vacía, no null", async () => {
    const producto = await repo.crearProducto(datos({ name: "Tarta sin carrusel" }));
    expect(producto.fotosExtra).toEqual([]);
  });

  it("sustituye las variantes al editar, no las acumula", async () => {
    const producto = await repo.crearProducto(
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
    const producto = await repo.crearProducto(
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
      repo.crearProducto(
        datos({ name: "Sin precio", priceCents: null, consultar: false }),
      ),
    ).rejects.toMatchObject({ name: "ProductoError" });
  });

  it("un producto desactivado desaparece del catálogo y de su propia URL", async () => {
    const producto = await repo.crearProducto(
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
    const vendible = await repo.crearProducto(datos({ name: "A la venta" }));
    const agotado = await repo.crearProducto(
      datos({ name: "Se acabó", agotado: true }),
    );
    // La otra mitad del contrato del docstring: `priceOrder` (tarea 16)
    // también necesita poder decir «ya no está disponible» de un producto
    // desactivado, no solo «se ha agotado» de uno agotado.
    const desactivado = await repo.crearProducto(
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
    await pool.query("delete from productos");
    await repo.crearProducto(datos({ name: "Segunda", orden: 200 }));
    await repo.crearProducto(datos({ name: "Primera", orden: 100 }));
    const lista = await repo.listarProductos({ soloActivos: true });
    // Otros ficheros comparten la tabla y pueden dejar filas suyas a media
    // ejecución: solo se mira el orden de las dos propias.
    const propias = lista.map((p) => p.name).filter((n) => n === "Primera" || n === "Segunda");
    expect(propias).toEqual(["Primera", "Segunda"]);
  });
});
