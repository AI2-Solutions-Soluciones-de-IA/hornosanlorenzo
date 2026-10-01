import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("~/lib/db/noticias", () => ({
  listarNoticias: vi.fn().mockResolvedValue([]),
  crearNoticia: vi.fn(),
  actualizarNoticia: vi.fn(),
  borrarNoticia: vi.fn(),
  NoticiaError: class extends Error {},
}));
vi.mock("~/lib/cache", async (original) => ({
  // `rutasTrasGuardarProducto` es la de verdad: lo que se prueba abajo es
  // que el endpoint le pasa la lectura de los packs de la base de datos.
  ...(await original<typeof import("~/lib/cache")>()),
  invalidar: vi.fn(),
  RUTAS_NOTICIAS: ["/"],
}));
vi.mock("~/lib/db/packs", () => ({
  rutasDePacks: vi.fn().mockResolvedValue(["/catalogo/pack-del-panel"]),
}));
vi.mock("~/lib/storage", () => ({
  guardarImagen: vi.fn(),
  ImagenError: class extends Error {},
}));
vi.mock("~/lib/db/productos", () => ({
  listarProductos: vi.fn().mockResolvedValue([]),
  crearProducto: vi.fn(),
  actualizarProducto: vi.fn(),
  ProductoError: class extends Error {},
}));
vi.mock("~/lib/db/pedidos", () => ({
  cambiarEstadoAMano: vi.fn().mockResolvedValue(true),
  listarPedidos: vi.fn().mockResolvedValue([]),
}));

const cliente = { id: "u1", email: "a@b.c", name: "Ana", rol: "cliente" };
const admin = { id: "u2", email: "c@d.e", name: "Carmen", rol: "admin" };

const peticion = (body: unknown) =>
  new Request("https://x.test/api/admin/noticias", {
    method: "POST",
    body: JSON.stringify(body),
  });

// Sin fichero: basta para probar la guardia (que corta antes de leer el
// `FormData`) y, con sesión de admin, para llegar a la validación propia
// del endpoint ("No hemos recibido la foto.").
const peticionImagen = (formData: FormData = new FormData()) =>
  new Request("https://x.test/api/admin/imagen", {
    method: "POST",
    body: formData,
  });

beforeEach(() => vi.resetModules());

describe("guardia de los endpoints del panel", () => {
  it("sin sesión, 404: ni siquiera se admite que el endpoint existe", async () => {
    const { POST } = await import("~/pages/api/admin/noticias");
    const r = await POST({
      request: peticion({}),
      locals: { usuario: null },
    } as never);
    expect(r.status).toBe(404);
  });

  it("con sesión de cliente, 404", async () => {
    const { POST } = await import("~/pages/api/admin/noticias");
    const r = await POST({
      request: peticion({}),
      locals: { usuario: cliente },
    } as never);
    expect(r.status).toBe(404);
  });

  it("con sesión de admin, entra en la validación (400 por datos, no 404)", async () => {
    const { POST } = await import("~/pages/api/admin/noticias");
    const r = await POST({
      request: peticion({}),
      locals: { usuario: admin },
    } as never);
    expect(r.status).toBe(400);
  });

  it("el producto enlazado tiene que ser un uuid o nada: un id inventado no llega a Postgres", async () => {
    const { POST } = await import("~/pages/api/admin/noticias");
    const r = await POST({
      request: peticion({
        titulo: "Roscón de Reyes 2027",
        excerpt: "Reservas abiertas hasta el 3 de enero.",
        fecha: "2026-12-15",
        productoId: "roscon-de-reyes",
      }),
      locals: { usuario: admin },
    } as never);
    expect(r.status).toBe(400);

    const { crearNoticia } = await import("~/lib/db/noticias");
    expect(crearNoticia).not.toHaveBeenCalled();
  });

  it("sin producto en el cuerpo, la noticia se guarda con `productoId: null`", async () => {
    const { crearNoticia } = await import("~/lib/db/noticias");
    vi.mocked(crearNoticia).mockResolvedValueOnce({ slug: "x" } as never);
    const { POST } = await import("~/pages/api/admin/noticias");
    const r = await POST({
      request: peticion({
        titulo: "San Lorenzo 2027",
        excerpt: "Fiestas patronales, horario especial.",
        fecha: "2027-08-10",
      }),
      locals: { usuario: admin },
    } as never);
    expect(r.status).toBe(201);
    expect(vi.mocked(crearNoticia).mock.calls[0][0]).toMatchObject({ productoId: null });
  });
});

describe("guardia del endpoint de subida de fotos", () => {
  it("sin sesión, 404", async () => {
    const { POST } = await import("~/pages/api/admin/imagen");
    const r = await POST({
      request: peticionImagen(),
      locals: { usuario: null },
    } as never);
    expect(r.status).toBe(404);
  });

  it("con sesión de cliente, 404", async () => {
    const { POST } = await import("~/pages/api/admin/imagen");
    const r = await POST({
      request: peticionImagen(),
      locals: { usuario: cliente },
    } as never);
    expect(r.status).toBe(404);
  });

  it("con sesión de admin y sin foto, 400: la guardia deja pasar, la validación no", async () => {
    const { POST } = await import("~/pages/api/admin/imagen");
    const r = await POST({
      request: peticionImagen(),
      locals: { usuario: admin },
    } as never);
    expect(r.status).toBe(400);
  });
});

describe("guardia y validación de /api/admin/productos", () => {
  const peticionProducto = (body: unknown) =>
    new Request("https://x.test/api/admin/productos", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("con sesión de cliente, 404", async () => {
    const { POST } = await import("~/pages/api/admin/productos");
    const r = await POST({
      request: peticionProducto({}),
      locals: { usuario: cliente },
    } as never);
    expect(r.status).toBe(404);
  });

  it("un precio negativo o cero no entra, aunque lo mande un admin", async () => {
    const { POST } = await import("~/pages/api/admin/productos");
    const base = {
      name: "Tarta",
      category: "tartas",
      shortDescription: "Una tarta.",
      priceCents: 0,
      consultar: false,
      allergens: [],
      variantes: [],
    };
    const r = await POST({
      request: peticionProducto(base),
      locals: { usuario: admin },
    } as never);
    expect(r.status).toBe(400);
  });

  it("una categoría inventada tampoco: la lista está cerrada en código", async () => {
    const { POST } = await import("~/pages/api/admin/productos");
    const r = await POST({
      request: peticionProducto({
        name: "Tarta",
        category: "inventada",
        shortDescription: "Una tarta.",
        priceCents: 1000,
        consultar: false,
        allergens: [],
        variantes: [],
      }),
      locals: { usuario: admin },
    } as never);
    expect(r.status).toBe(400);
  });

  it("dos variantes con el mismo identificador tampoco: se rechaza antes de llegar a Postgres", async () => {
    const { POST } = await import("~/pages/api/admin/productos");
    const r = await POST({
      request: peticionProducto({
        name: "Tarta",
        category: "tartas",
        shortDescription: "Una tarta.",
        priceCents: 1000,
        consultar: false,
        allergens: [],
        variantes: [
          { variantId: "grande", label: "Grande", priceCents: 2000 },
          { variantId: "grande", label: "Extra grande", priceCents: 3000 },
        ],
      }),
      locals: { usuario: admin },
    } as never);
    expect(r.status).toBe(400);
    const cuerpo = await r.json();
    expect(cuerpo.error).toMatch(/identificador/i);
  });

  describe("fotos del carrusel", () => {
    const foto = { url: "https://blob.test/productos/b.webp", ancho: 1600, alto: 1067 };
    const conFotos = (extra: Record<string, unknown>) => ({
      name: "Tarta",
      category: "tartas",
      shortDescription: "Una tarta.",
      priceCents: 1000,
      imageUrl: "https://blob.test/productos/a.webp",
      imageAlt: "La tarta entera",
      imageWidth: 1600,
      imageHeight: 1067,
      ...extra,
    });

    it("se guardan detrás de la principal, tal cual llegan", async () => {
      const { POST } = await import("~/pages/api/admin/productos");
      const { crearProducto } = await import("~/lib/db/productos");
      vi.mocked(crearProducto).mockResolvedValueOnce({ slug: "tarta" } as never);
      const r = await POST({
        request: peticionProducto(conFotos({ fotosExtra: [{ ...foto, alt: "Un corte" }] })),
        locals: { usuario: admin },
      } as never);
      expect(r.status).toBe(201);
      expect(vi.mocked(crearProducto).mock.calls[0][0].fotosExtra).toEqual([
        { ...foto, alt: "Un corte" },
      ]);
    });

    it("cada una necesita su texto alternativo", async () => {
      const { POST } = await import("~/pages/api/admin/productos");
      const r = await POST({
        request: peticionProducto(conFotos({ fotosExtra: [{ ...foto, alt: "  " }] })),
        locals: { usuario: admin },
      } as never);
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/carrusel/i);
    });

    it("sin foto principal no se admiten", async () => {
      const { POST } = await import("~/pages/api/admin/productos");
      const r = await POST({
        request: peticionProducto(
          conFotos({ imageUrl: null, imageAlt: null, fotosExtra: [{ ...foto, alt: "Un corte" }] }),
        ),
        locals: { usuario: admin },
      } as never);
      expect(r.status).toBe(400);
      expect((await r.json()).error).toMatch(/principal/i);
    });

    it("como mucho cuatro además de la principal", async () => {
      const { POST } = await import("~/pages/api/admin/productos");
      const r = await POST({
        request: peticionProducto(
          conFotos({ fotosExtra: Array.from({ length: 5 }, (_, i) => ({ ...foto, alt: `Foto ${i}` })) }),
        ),
        locals: { usuario: admin },
      } as never);
      expect(r.status).toBe(400);
    });
  });
});

describe("PUT /api/admin/productos invalida las fichas de los packs", () => {
  it("las lee de la base de datos, también las de packs creados desde el panel", async () => {
    const { actualizarProducto } = await import("~/lib/db/productos");
    vi.mocked(actualizarProducto).mockResolvedValueOnce({ slug: "empanada-de-carne" } as never);
    const { PUT } = await import("~/pages/api/admin/productos");
    const r = await PUT({
      request: new Request("https://x.test/api/admin/productos", {
        method: "PUT",
        body: JSON.stringify({
          id: "p1",
          name: "Empanada de carne",
          category: "salado",
          shortDescription: "Una empanada.",
          priceCents: 1380,
          consultar: false,
          allergens: [],
          variantes: [],
        }),
      }),
      locals: { usuario: admin },
    } as never);
    expect(r.status).toBe(200);
    const { invalidar } = await import("~/lib/cache");
    const rutas = vi.mocked(invalidar).mock.calls.at(-1)![0];
    expect(rutas).toContain("/catalogo/pack-del-panel");
    expect(rutas).toContain("/catalogo/empanada-de-carne");
    expect(rutas).toContain("/catalogo/packs");
  });
});

describe("guardia y validación de PATCH /api/admin/pedidos", () => {
  const patch = (body: unknown) =>
    new Request("https://x.test/api/admin/pedidos", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  const cuerpo = { id: "b560ca67-4e60-460a-93d8-2395ebfe2133", estado: "pagado" };

  it("sin sesión o con sesión de cliente, 404", async () => {
    const { PATCH } = await import("~/pages/api/admin/pedidos/index");
    expect((await PATCH({ request: patch(cuerpo), locals: { usuario: null } } as never)).status).toBe(404);
    expect((await PATCH({ request: patch(cuerpo), locals: { usuario: cliente } } as never)).status).toBe(404);
    const { cambiarEstadoAMano } = await import("~/lib/db/pedidos");
    expect(cambiarEstadoAMano).not.toHaveBeenCalled();
  });

  it("solo admite `pagado` o `sin_pago`: nadie marca un pedido como `iniciado` desde el panel", async () => {
    const { PATCH } = await import("~/pages/api/admin/pedidos/index");
    const r = await PATCH({
      request: patch({ ...cuerpo, estado: "iniciado" }),
      locals: { usuario: admin },
    } as never);
    expect(r.status).toBe(400);
  });

  it("con admin y datos válidos, cambia el estado y devuelve el nuevo", async () => {
    const { PATCH } = await import("~/pages/api/admin/pedidos/index");
    const r = await PATCH({ request: patch(cuerpo), locals: { usuario: admin } } as never);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ estado: "pagado" });
    const { cambiarEstadoAMano } = await import("~/lib/db/pedidos");
    expect(cambiarEstadoAMano).toHaveBeenCalledWith(cuerpo.id, "pagado");
  });

  it("si el pedido no admite ese cambio (Stripe, iniciado, no existe), 409 y lo dice", async () => {
    const { cambiarEstadoAMano } = await import("~/lib/db/pedidos");
    vi.mocked(cambiarEstadoAMano).mockResolvedValueOnce(false);
    const { PATCH } = await import("~/pages/api/admin/pedidos/index");
    const r = await PATCH({ request: patch(cuerpo), locals: { usuario: admin } } as never);
    expect(r.status).toBe(409);
  });
});

describe("guardia de GET /api/admin/pedidos/exportar", () => {
  const ctx = (usuario: unknown, query = "") => ({
    url: new URL(`https://x.test/api/admin/pedidos/exportar${query}`),
    locals: { usuario },
  });

  it("sin sesión o con sesión de cliente, 404 y no se lee nada", async () => {
    const { GET } = await import("~/pages/api/admin/pedidos/exportar");
    expect((await GET(ctx(null) as never)).status).toBe(404);
    expect((await GET(ctx(cliente) as never)).status).toBe(404);
    const { listarPedidos } = await import("~/lib/db/pedidos");
    expect(listarPedidos).not.toHaveBeenCalled();
  });

  it("con admin devuelve un .xlsx y pasa el rango de fechas; lo que no es fecha se ignora", async () => {
    const { GET } = await import("~/pages/api/admin/pedidos/exportar");
    const r = await GET(ctx(admin, "?fecha=entrega&desde=2026-09-16&hasta=2026-09-20") as never);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("spreadsheetml");
    expect(r.headers.get("content-disposition")).toContain(
      "pedidos-entrega-2026-09-16-a-2026-09-20.xlsx",
    );
    const { listarPedidos } = await import("~/lib/db/pedidos");
    expect(listarPedidos).toHaveBeenCalledWith(2000, {
      entregaDesde: "2026-09-16",
      entregaHasta: "2026-09-20",
      texto: undefined,
    });
  });

  it("un enlace viejo de un solo día sigue funcionando", async () => {
    const { GET } = await import("~/pages/api/admin/pedidos/exportar");
    const r = await GET(ctx(admin, "?entrega=2026-09-16&entrada=ayer") as never);
    expect(r.headers.get("content-disposition")).toContain("pedidos-entrega-2026-09-16.xlsx");
    const { listarPedidos } = await import("~/lib/db/pedidos");
    expect(listarPedidos).toHaveBeenCalledWith(2000, {
      entregaDesde: "2026-09-16",
      entregaHasta: "2026-09-16",
      texto: undefined,
    });
  });
});
