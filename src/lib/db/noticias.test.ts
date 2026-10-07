import { describe, expect, it, beforeAll, afterAll } from "vitest";

const URL_PRUEBAS = process.env.DATABASE_URL_TEST;
const describeSiHayBD = URL_PRUEBAS ? describe : describe.skip;

describeSiHayBD("repositorio de noticias", () => {
  let pool: import("pg").Pool;
  let repo: typeof import("~/lib/db/noticias");

  const datos = (extra: Record<string, unknown> = {}) => ({
    titulo: "Roscón de Reyes 2026",
    excerpt: "Reservas abiertas hasta el 3 de enero.",
    cuerpo: "El roscón es el postre de la casa.\n\n**Reservas:** en tienda.",
    fecha: "2025-12-15",
    imageUrl: "https://x.public.blob.vercel-storage.com/noticias/roscon.webp",
    imageAlt: "Roscón de Reyes con nata",
    imageWidth: 1600,
    imageHeight: 1000,
    tags: ["temporada", "navidad"],
    publicada: true,
    ...extra,
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: URL_PRUEBAS, max: 2 });
    repo = await import("~/lib/db/noticias");
    await pool.query("delete from noticias");
  });

  afterAll(async () => {
    await pool.query("delete from noticias");
    await pool.end();
  });

  it("crea una noticia y le saca el slug del título", async () => {
    const noticia = await repo.crearNoticia(datos());
    expect(noticia.slug).toBe("roscon-de-reyes-2026");
    expect(noticia.tags).toEqual(["temporada", "navidad"]);
    expect(noticia.imageWidth).toBe(1600);
  });

  it("no deja dos noticias con el mismo slug: lo dice en cristiano", async () => {
    await expect(repo.crearNoticia(datos())).rejects.toMatchObject({
      name: "NoticiaError",
      status: 409,
    });
    // El mensaje no puede escupir el nombre del índice de Postgres.
    await expect(repo.crearNoticia(datos())).rejects.toThrow(
      /ya hay una noticia/i,
    );
  });

  it("una noticia sin publicar no sale en la web pero sí en el panel", async () => {
    await repo.crearNoticia(
      datos({ titulo: "Borrador de San Valentín", publicada: false }),
    );

    const publicas = await repo.listarNoticias({ soloPublicadas: true });
    expect(publicas.map((n) => n.titulo)).not.toContain(
      "Borrador de San Valentín",
    );

    const todas = await repo.listarNoticias({ soloPublicadas: false });
    expect(todas.map((n) => n.titulo)).toContain("Borrador de San Valentín");

    // Y tampoco se puede llegar a ella por su URL adivinando el slug.
    expect(
      await repo.obtenerNoticia("borrador-de-san-valentin", {
        soloPublicada: true,
      }),
    ).toBeNull();
    expect(
      await repo.obtenerNoticia("borrador-de-san-valentin"),
    ).not.toBeNull();
  });

  it("actualiza y borra, y el slug no se recalcula aunque cambie el título", async () => {
    const noticia = await repo.crearNoticia(datos({ titulo: "Torrijas 2026" }));
    expect(noticia.slug).toBe("torrijas-2026");
    const cambiada = await repo.actualizarNoticia(noticia.id, {
      // Título distinto a propósito: si `actualizarNoticia` recalculara el
      // slug a partir de él, esta prueba lo detectaría. Con el mismo
      // título de antes (como estaba escrita esta prueba) un slug
      // recalculado por error habría dado el mismo valor y habría pasado
      // igual.
      ...datos({ titulo: "Torrijas de Semana Santa 2026" }),
      excerpt: "Solo en Semana Santa.",
    });
    expect(cambiada?.excerpt).toBe("Solo en Semana Santa.");
    // La URL ya compartida (`/noticias/torrijas-2026`) tiene que seguir
    // funcionando aunque el título haya cambiado.
    expect(cambiada?.slug).toBe("torrijas-2026");
    // Devuelve el slug, no un recuento: el endpoint lo necesita para
    // invalidar la propia página de la noticia (`/noticias/<slug>`), que si
    // no se queda viva y compartible después de borrarla.
    expect(await repo.borrarNoticia(noticia.id)).toBe("torrijas-2026");
    expect(await repo.borrarNoticia(noticia.id)).toBeNull();
  });

  it("las publicadas salen de la más reciente a la más antigua", async () => {
    await pool.query("delete from noticias");
    await repo.crearNoticia(datos({ titulo: "Vieja", fecha: "2025-01-01" }));
    await repo.crearNoticia(datos({ titulo: "Nueva", fecha: "2026-01-01" }));
    const lista = await repo.listarNoticias({ soloPublicadas: true });
    expect(lista.map((n) => n.titulo)).toEqual(["Nueva", "Vieja"]);
  });

  it("una nueva entra la primera y el orden del panel manda sobre la fecha", async () => {
    await pool.query("delete from noticias");
    const a = await repo.crearNoticia(datos({ titulo: "Primera escrita", fecha: "2026-03-01" }));
    const b = await repo.crearNoticia(datos({ titulo: "Segunda escrita", fecha: "2025-03-01" }));
    // La nueva sale delante aunque su fecha sea más antigua.
    expect((await repo.listarNoticias({ soloPublicadas: true })).map((n) => n.id)).toEqual([b.id, a.id]);

    await repo.ordenarNoticias([a.id, b.id]);
    expect((await repo.listarNoticias({ soloPublicadas: false })).map((n) => n.id)).toEqual([a.id, b.id]);
  });

  describe("producto enlazado (Este mes)", () => {
    let productos: typeof import("~/lib/db/productos");
    const ficha = (extra: Record<string, unknown> = {}) => ({
      name: "Roscón de Reyes (noticias.test)",
      category: "tartas",
      seccion: null,
      priceCents: 2400,
      consultar: false,
      unit: null,
      shortDescription: "Con nata o sin rellenar.",
      cuerpo: "",
      allergens: [],
      destacado: false,
      temporada: true,
      orden: 1,
      imageUrl: null,
      imageAlt: null,
      imageWidth: null,
      imageHeight: null,
      fotosExtra: [],
      fotoProvisional: false,
      activo: true,
      agotado: false,
      especialidad: null,
      variantes: [
        { variantId: "mediano", label: "Mediano", priceCents: 2400, orden: 0 },
        { variantId: "grande", label: "Grande", priceCents: 3600, orden: 1 },
      ],
      ...extra,
    });

    // `productos` es la tabla de `productos.test.ts`, que corre a la vez:
    // aquí solo se borra la ficha que crea esta prueba, nunca la tabla.
    beforeAll(async () => {
      productos = await import("~/lib/db/productos");
      await pool.query("delete from noticias");
      await pool.query("delete from productos where name = 'Roscón de Reyes (noticias.test)'");
    });

    afterAll(async () => {
      await pool.query("delete from noticias");
      await pool.query("delete from productos where name = 'Roscón de Reyes (noticias.test)'");
    });

    it("sin producto, la noticia sale con `producto: null` y sigue siendo una noticia", async () => {
      const n = await repo.crearNoticia(datos({ titulo: "San Lorenzo 2026" }));
      expect(n.productoId).toBeNull();
      expect(n.producto).toBeNull();
    });

    it("con producto, devuelve lo que la tarjeta necesita para pintar precio y añadir", async () => {
      const roscon = await productos.crearProducto(ficha());
      const n = await repo.crearNoticia(
        datos({ titulo: "Roscón 2027", productoId: roscon.id }),
      );
      expect(n.productoId).toBe(roscon.id);
      expect(n.producto).toEqual({
        slug: roscon.slug,
        name: "Roscón de Reyes (noticias.test)",
        category: "tartas",
        priceCents: 2400,
        consultar: false,
        activo: true,
        agotado: false,
        unit: null,
        variantes: [
          { id: "mediano", label: "Mediano", priceCents: 2400 },
          { id: "grande", label: "Grande", priceCents: 3600 },
        ],
      });
      // El listado y la lectura por slug llevan lo mismo que el `returning`.
      const [enLista] = (await repo.listarNoticias({ soloPublicadas: true })).filter(
        (x) => x.id === n.id,
      );
      expect(enLista.producto?.slug).toBe(roscon.slug);
      expect((await repo.obtenerNoticia(n.slug))?.producto?.slug).toBe(roscon.slug);
    });

    it("el precio se lee de la ficha, no se copia: cambiarlo en la carta lo cambia en Este mes", async () => {
      const [n] = (await repo.listarNoticias({ soloPublicadas: false })).filter(
        (x) => x.titulo === "Roscón 2027",
      );
      await pool.query("update productos set price_cents = 2600 where id = $1", [n.productoId]);
      expect((await repo.obtenerNoticia(n.slug))?.producto?.priceCents).toBe(2600);
    });

    it("editar la noticia puede quitar el producto, y borrar la ficha la deja sin él", async () => {
      const [n] = (await repo.listarNoticias({ soloPublicadas: false })).filter(
        (x) => x.titulo === "Roscón 2027",
      );
      const sin = await repo.actualizarNoticia(n.id, { ...datos({ titulo: n.titulo }), productoId: null });
      expect(sin?.producto).toBeNull();

      const con = await repo.actualizarNoticia(n.id, { ...datos({ titulo: n.titulo }), productoId: n.productoId });
      expect(con?.producto?.slug).toBeTruthy();

      await pool.query("delete from productos where id = $1", [n.productoId]);
      const huerfana = await repo.obtenerNoticia(n.slug);
      expect(huerfana?.productoId).toBeNull();
      expect(huerfana?.producto).toBeNull();
    });

    it("un producto que no existe no entra, y lo dice en cristiano", async () => {
      await expect(
        repo.crearNoticia(
          datos({ titulo: "Fantasma", productoId: "00000000-0000-0000-0000-000000000000" }),
        ),
      ).rejects.toMatchObject({ name: "NoticiaError", status: 400 });
      await expect(
        repo.crearNoticia(
          datos({ titulo: "Fantasma", productoId: "00000000-0000-0000-0000-000000000000" }),
        ),
      ).rejects.toThrow(/producto/i);
    });
  });
});
