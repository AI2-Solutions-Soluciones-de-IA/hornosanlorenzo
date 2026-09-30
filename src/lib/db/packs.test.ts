import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { DefinicionPack } from "~/data/packs";

const URL_PRUEBAS = process.env.DATABASE_URL_TEST;
const describeSiHayBD = URL_PRUEBAS ? describe : describe.skip;

describeSiHayBD("repositorio de definiciones de pack", () => {
  let pool: import("pg").Pool;
  let repo: typeof import("~/lib/db/packs");

  const limpia = () =>
    pool.query("delete from productos where slug like 'test-packdb-%'");

  const definicion = (slug: string): DefinicionPack => ({
    slug,
    ocasion: "Cumpleaños en casa",
    personas: { min: 18, max: 20, texto: "18–20 personas" },
    paraQuien: ["Uno", "Dos"],
    piezas: [
      {
        tipo: "eleccion",
        id: "empanada",
        titulo: "1 empanada",
        descripcion: "Hojaldre",
        etiqueta: "Sabor de la empanada",
        seccion: "empanadas",
        variantId: "entera",
      },
      {
        tipo: "fija",
        slug: "los-prenaos-de-la-casa",
        titulo: "24 bollos",
        descripcion: "Bollitos",
      },
      {
        tipo: "eleccion",
        id: "quiche1",
        titulo: "1 quiche",
        descripcion: "",
        etiqueta: "Quiche",
        slugs: ["quiche-a", "quiche-b"],
      },
      {
        tipo: "fija",
        slug: "tarta-retrato",
        variantId: "pequena",
        titulo: "Foto",
        descripcion: "Oblea",
        requiereFoto: true,
        rotulo: "Foto comestible",
      },
    ],
  });

  const datos = (slug: string, extra: Record<string, unknown> = {}) => {
    const { slug: _s, ...def } = definicion(slug);
    return {
      slug,
      name: "Pack de prueba",
      priceCents: 5000,
      shortDescription: "Descriptor",
      imageUrl: null,
      imageAlt: null,
      imageWidth: null,
      imageHeight: null,
      activo: true,
      agotado: false,
      destacado: false,
      orden: 900,
      definicion: def,
      ...extra,
    };
  };

  beforeAll(async () => {
    process.env.DATABASE_URL = URL_PRUEBAS;
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: URL_PRUEBAS, max: 2 });
    repo = await import("~/lib/db/packs");
    await limpia();
  });

  afterAll(async () => {
    await limpia();
    await pool.end();
  });

  it("crea y devuelve una definición idéntica, con piezas en orden", async () => {
    const slug = "test-packdb-ida-vuelta";
    expect(await repo.crearPack(datos(slug))).toBe(slug);
    const mapa = await repo.definicionesPorSlugs([slug]);
    expect(mapa.get(slug)).toEqual(definicion(slug));
  });

  it("omite los opcionales cuando no se dan y trae consejo si existe", async () => {
    const slug = "test-packdb-opcionales";
    const base = datos(slug);
    await repo.crearPack({
      ...base,
      definicion: {
        ...base.definicion,
        consejo: "Al horno 5 min",
        piezas: [
          { tipo: "fija", slug: "x", titulo: "X", descripcion: "" },
        ],
      },
    });
    const d = (await repo.definicionesPorSlugs([slug])).get(slug)!;
    expect(d.consejo).toBe("Al horno 5 min");
    expect(d.piezas[0]).toEqual({
      tipo: "fija",
      slug: "x",
      titulo: "X",
      descripcion: "",
    });
    expect("variantId" in d.piezas[0]).toBe(false);
  });

  it("actualizarPack sustituye piezas y textos y mantiene el id del producto", async () => {
    const slug = "test-packdb-actualiza";
    await repo.crearPack(datos(slug));
    const antes = await pool.query("select id from productos where slug=$1", [slug]);
    const nueva = datos(slug, {
      name: "Otro nombre",
      priceCents: 6000,
    }) as ReturnType<typeof datos>;
    nueva.definicion = {
      ...nueva.definicion,
      ocasion: "Otra ocasión",
      piezas: [
        { tipo: "fija", slug: "y", titulo: "Y", descripcion: "d" },
      ],
    };
    await repo.actualizarPack(slug, nueva);
    const despues = await pool.query(
      "select id, name, price_cents from productos where slug=$1",
      [slug],
    );
    expect(despues.rows[0].id).toBe(antes.rows[0].id);
    expect(despues.rows[0].name).toBe("Otro nombre");
    expect(despues.rows[0].price_cents).toBe(6000);
    const d = (await repo.definicionesPorSlugs([slug])).get(slug)!;
    expect(d.ocasion).toBe("Otra ocasión");
    expect(d.piezas).toHaveLength(1);
    expect(d.piezas[0]).toMatchObject({ slug: "y" });
  });

  it("actualizarPack conserva temporada y especialidad y guarda destacado", async () => {
    const slug = "test-packdb-conserva";
    await repo.crearPack(datos(slug));
    await pool.query(
      "update productos set temporada = true, especialidad = 'A mano' where slug = $1",
      [slug],
    );
    await repo.actualizarPack(slug, datos(slug, { destacado: true }) as never);
    const { rows } = await pool.query(
      "select temporada, especialidad, destacado from productos where slug=$1",
      [slug],
    );
    expect(rows[0]).toEqual({ temporada: true, especialidad: "A mano", destacado: true });
    await repo.actualizarPack(slug, datos(slug, { destacado: false }) as never);
    const d = await pool.query("select destacado from productos where slug=$1", [slug]);
    expect(d.rows[0].destacado).toBe(false);
  });

  it("actualizarPack de un slug que no es pack o no existe lanza", async () => {
    const slug = "test-packdb-no-pack";
    await pool.query(
      `insert into productos (slug, name, category, price_cents, short_description)
       values ($1,'No pack','salado',100,'x')`,
      [slug],
    );
    await expect(repo.actualizarPack(slug, datos(slug))).rejects.toThrow();
    await expect(
      repo.actualizarPack("test-packdb-no-existe", datos("test-packdb-no-existe")),
    ).rejects.toThrow();
  });

  it("crearPack con un slug repetido lanza", async () => {
    const slug = "test-packdb-repetido";
    await repo.crearPack(datos(slug));
    await expect(repo.crearPack(datos(slug))).rejects.toThrow();
  });

  it("rutasDePacks incluye la ficha y todasLasDefiniciones solo trae packs", async () => {
    const slug = "test-packdb-rutas";
    await repo.crearPack(datos(slug));
    await pool.query(
      `insert into productos (slug, name, category, price_cents, short_description)
       values ('test-packdb-suelto','Suelto','salado',100,'x')
       on conflict do nothing`,
    );
    expect(await repo.rutasDePacks()).toContain(`/catalogo/${slug}`);
    const todas = await repo.todasLasDefiniciones();
    expect(todas.has(slug)).toBe(true);
    expect(todas.has("test-packdb-suelto")).toBe(false);
  });

  it("actualizarPack devuelve a su valor las columnas que el panel no edita, y conserva las que no toca", async () => {
    const slug = "test-packdb-fuerza";
    await repo.crearPack(datos(slug));
    await pool.query(
      `update productos set consultar=true, seccion=null, destacado=true,
         temporada=true, unit='x', cuerpo='c', allergens='{gluten}',
         especialidad='e' where slug=$1`,
      [slug],
    );
    await repo.actualizarPack(slug, datos(slug));
    const { rows } = await pool.query(
      `select category, seccion, consultar, unit, cuerpo, allergens,
              destacado, temporada, especialidad
         from productos where slug=$1`,
      [slug],
    );
    expect(rows[0]).toEqual({
      category: "packs",
      seccion: "packs",
      consultar: false,
      unit: null,
      cuerpo: "",
      allergens: [],
      destacado: false, // lo manda el panel
      temporada: true, // se conserva
      especialidad: "e", // se conserva
    });
  });
});
