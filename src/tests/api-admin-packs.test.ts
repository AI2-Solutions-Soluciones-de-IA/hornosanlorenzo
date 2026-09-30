import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("~/lib/cache", async (original) => ({
  ...(await original<typeof import("~/lib/cache")>()),
  invalidar: vi.fn(),
}));
vi.mock("~/lib/db/packs", () => ({
  rutasDePacks: vi.fn().mockResolvedValue(["/catalogo/otro-pack"]),
  todasLasDefiniciones: vi.fn(),
  crearPack: vi.fn(),
  actualizarPack: vi.fn(),
}));
vi.mock("~/lib/db/productos", () => ({
  listarProductos: vi.fn(),
  crearProducto: vi.fn(),
  actualizarProducto: vi.fn(),
  ProductoError: class extends Error {},
}));

const admin = { id: "u2", email: "c@d.e", name: "Carmen", rol: "admin" };
const cliente = { id: "u1", email: "a@b.c", name: "Ana", rol: "cliente" };

const prod = (o: Record<string, unknown>) => ({
  id: "x", category: "salado", seccion: "empanadas", priceCents: 1000,
  consultar: false, activo: true, agotado: false, variantes: [], ...o,
});
const CARTA = [
  prod({ slug: "empanada-de-carne", name: "Empanada de carne", priceCents: 1000 }),
  prod({ slug: "tarta-x", name: "Tarta X", category: "tartas", seccion: "tartas", priceCents: 2000 }),
];
const PACK_FILA = prod({
  id: "pk", slug: "pack-uno", name: "Pack uno", category: "packs", seccion: "packs",
  priceCents: 2500, shortDescription: "Para dos",
  imageUrl: null, imageAlt: null, imageWidth: null, imageHeight: null, orden: 5,
});

const entrada = (o: Record<string, unknown> = {}) => ({
  name: "Pack Merienda",
  priceCents: 2500,
  shortDescription: "Para merendar",
  imageUrl: null, imageAlt: null, imageWidth: null, imageHeight: null,
  activo: true, agotado: false, orden: 10,
  definicion: {
    ocasion: "Merienda",
    personas: { min: 2, max: 4, texto: "2 a 4 personas" },
    paraQuien: [],
    piezas: [
      { tipo: "fija", slug: "empanada-de-carne", titulo: "Empanada", descripcion: "" },
      { tipo: "fija", slug: "tarta-x", titulo: "Tarta", descripcion: "" },
    ],
  },
  ...o,
});

const req = (metodo: string, body?: unknown, query = "") =>
  new Request(`https://x.test/api/admin/packs${query}`, {
    method: metodo,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function preparar(productos: unknown[] = [...CARTA, PACK_FILA]) {
  const p = await import("~/lib/db/productos");
  vi.mocked(p.listarProductos).mockResolvedValue(productos as never);
  const k = await import("~/lib/db/packs");
  vi.mocked(k.crearPack).mockImplementation(async (d) => d.slug);
  vi.mocked(k.actualizarPack).mockResolvedValue(undefined);
  vi.mocked(k.todasLasDefiniciones).mockResolvedValue(
    new Map([["pack-uno", {
      slug: "pack-uno", ocasion: "Para dos",
      personas: { min: 1, max: 2, texto: "2 personas" }, paraQuien: [],
      piezas: [{ tipo: "fija", slug: "empanada-de-carne", titulo: "E", descripcion: "" }],
    }]]) as never,
  );
  return import("~/pages/api/admin/packs");
}

beforeEach(() => vi.resetModules());

describe("/api/admin/packs", () => {
  it("sin sesión de admin, 404 en los tres métodos", async () => {
    const m = await preparar();
    for (const usuario of [null, cliente]) {
      for (const f of [m.GET, m.POST, m.PUT]) {
        const r = await f({ request: req("POST", entrada()), url: new URL("https://x.test/api/admin/packs?slug=pack-uno"), locals: { usuario } } as never);
        expect(r.status).toBe(404);
      }
    }
  });

  it("GET: packs con suelto y ahorro, y la carta sin packs", async () => {
    const m = await preparar();
    const r = await m.GET({ request: req("GET"), url: new URL("https://x.test/api/admin/packs"), locals: { usuario: admin } } as never);
    expect(r.status).toBe(200);
    const c = await r.json();
    expect(c.packs).toHaveLength(1);
    expect(c.packs[0]).toMatchObject({ slug: "pack-uno", name: "Pack uno", priceCents: 2500, orden: 5, sueltoCents: 1000, ahorroPct: null });
    expect(c.packs[0].definicion.ocasion).toBe("Para dos");
    expect(c.carta.map((x: { slug: string }) => x.slug)).toEqual(["empanada-de-carne", "tarta-x"]);
    expect(Object.keys(c.carta[0]).sort()).toEqual(
      ["activo", "agotado", "consultar", "name", "priceCents", "seccion", "slug", "variantes"],
    );
  });

  it("POST válido: 201, slug del nombre, y invalida las rutas (también la propia)", async () => {
    const m = await preparar();
    const r = await m.POST({ request: req("POST", entrada()), url: new URL("https://x.test/api/admin/packs"), locals: { usuario: admin } } as never);
    expect(r.status).toBe(201);
    expect((await r.json()).slug).toBe("pack-merienda");
    const { crearPack } = await import("~/lib/db/packs");
    expect(vi.mocked(crearPack).mock.calls[0][0].slug).toBe("pack-merienda");
    const { invalidar } = await import("~/lib/cache");
    const rutas = vi.mocked(invalidar).mock.calls.at(-1)![0];
    for (const ruta of ["/", "/catalogo", "/catalogo/top-ventas", "/catalogo/packs", "/catalogo/pack-merienda", "/catalogo/otro-pack"])
      expect(rutas).toContain(ruta);
  });

  it("POST: si el slug choca con CUALQUIER producto, sufijo -2, -3", async () => {
    const m = await preparar([...CARTA, PACK_FILA, prod({ slug: "pack-merienda" }), prod({ slug: "pack-merienda-2" })]);
    const r = await m.POST({ request: req("POST", entrada()), url: new URL("https://x.test/api/admin/packs"), locals: { usuario: admin } } as never);
    expect((await r.json()).slug).toBe("pack-merienda-3");
  });

  it("POST inválido: 400 con errores y sin guardar", async () => {
    const m = await preparar();
    const malo = entrada();
    (malo.definicion.piezas[0] as { slug: string }).slug = "no-existe";
    const r = await m.POST({ request: req("POST", malo), url: new URL("https://x.test/api/admin/packs"), locals: { usuario: admin } } as never);
    expect(r.status).toBe(400);
    const c = await r.json();
    expect(c.errores[0]).toMatchObject({ donde: "pieza 1" });
    const { crearPack } = await import("~/lib/db/packs");
    expect(crearPack).not.toHaveBeenCalled();
  });

  it("POST con cuerpo que no encaja con el esquema: 400 con errores", async () => {
    const m = await preparar();
    const r = await m.POST({ request: req("POST", { name: 3 }), url: new URL("https://x.test/api/admin/packs"), locals: { usuario: admin } } as never);
    expect(r.status).toBe(400);
    expect((await r.json()).errores.length).toBeGreaterThan(0);
  });

  it("POST con avisos: 201 y los avisos vuelven", async () => {
    const m = await preparar();
    const r = await m.POST({ request: req("POST", entrada({ priceCents: 3000 })), url: new URL("https://x.test/api/admin/packs"), locals: { usuario: admin } } as never);
    expect(r.status).toBe(201);
    expect((await r.json()).avisos[0].donde).toBe("precio");
  });

  it("PUT de un slug inexistente (o que no es pack): 404", async () => {
    const m = await preparar();
    for (const slug of ["nada", "empanada-de-carne"]) {
      const r = await m.PUT({ request: req("PUT", entrada()), url: new URL(`https://x.test/api/admin/packs?slug=${slug}`), locals: { usuario: admin } } as never);
      expect(r.status).toBe(404);
    }
    const r = await m.PUT({ request: req("PUT", entrada()), url: new URL("https://x.test/api/admin/packs"), locals: { usuario: admin } } as never);
    expect(r.status).toBe(400);
  });

  it("PUT válido: 200, conserva el slug aunque cambie el nombre, e invalida", async () => {
    const m = await preparar();
    const r = await m.PUT({ request: req("PUT", entrada({ name: "Otro nombre" })), url: new URL("https://x.test/api/admin/packs?slug=pack-uno"), locals: { usuario: admin } } as never);
    expect(r.status).toBe(200);
    expect((await r.json()).slug).toBe("pack-uno");
    const { actualizarPack } = await import("~/lib/db/packs");
    expect(vi.mocked(actualizarPack).mock.calls[0][0]).toBe("pack-uno");
    expect(vi.mocked(actualizarPack).mock.calls[0][1].slug).toBeUndefined();
    const { invalidar } = await import("~/lib/cache");
    expect(vi.mocked(invalidar).mock.calls.at(-1)![0]).toContain("/catalogo/pack-uno");
  });

  it("PUT con un slug en el cuerpo no lo cambia", async () => {
    const m = await preparar();
    await m.PUT({ request: req("PUT", { ...entrada(), slug: "hackeado" }), url: new URL("https://x.test/api/admin/packs?slug=pack-uno"), locals: { usuario: admin } } as never);
    const { actualizarPack } = await import("~/lib/db/packs");
    expect(vi.mocked(actualizarPack).mock.calls[0][0]).toBe("pack-uno");
    expect(vi.mocked(actualizarPack).mock.calls[0][1]).not.toHaveProperty("slug");
  });
});

describe("Productos ya no crea ni edita packs", () => {
  const MSG = "Los packs se crean y editan en la sección Packs";
  const cuerpo = (o = {}) => ({
    name: "Tarta", category: "tartas", shortDescription: "Una tarta.",
    priceCents: 1000, consultar: false, allergens: [], variantes: [], ...o,
  });

  it("POST y PUT con category packs: 400 con el mensaje", async () => {
    await preparar();
    const { POST, PUT } = await import("~/pages/api/admin/productos");
    for (const f of [POST, PUT]) {
      const r = await f({ request: req("POST", cuerpo({ id: "p1", category: "packs" })), locals: { usuario: admin } } as never);
      expect(r.status).toBe(400);
      expect((await r.json()).error).toContain(MSG);
    }
    const { crearProducto, actualizarProducto } = await import("~/lib/db/productos");
    expect(crearProducto).not.toHaveBeenCalled();
    expect(actualizarProducto).not.toHaveBeenCalled();
  });

  it("PUT sobre un producto que ES un pack: 400, aunque mande otra categoría", async () => {
    await preparar();
    const { PUT } = await import("~/pages/api/admin/productos");
    const { actualizarProducto } = await import("~/lib/db/productos");
    const r = await PUT({ request: req("PUT", cuerpo({ id: "pk" })), locals: { usuario: admin } } as never);
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain(MSG);
    expect(actualizarProducto).not.toHaveBeenCalled();
  });
});
