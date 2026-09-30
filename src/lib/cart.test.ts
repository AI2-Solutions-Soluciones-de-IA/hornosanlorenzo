import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// cart.ts fija `isBrowser` al cargar el módulo y Vitest corre en node: hay que
// doblar `window` ANTES de importarlo, si no las funciones no hacen nada.
const almacen = new Map<string, string>();
const dispatchEvent = vi.fn();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => almacen.get(k) ?? null,
    setItem: (k: string, v: string) => void almacen.set(k, v),
    removeItem: (k: string) => void almacen.delete(k),
  },
  dispatchEvent,
};
(globalThis as unknown as { CustomEvent: unknown }).CustomEvent ??= class {
  constructor(
    public type: string,
    public init?: unknown,
  ) {}
};

let cart: typeof import("~/lib/cart");

beforeAll(async () => {
  cart = await import("~/lib/cart");
});

beforeEach(() => {
  almacen.clear();
  dispatchEvent.mockClear();
});

const pack = (opciones: Record<string, string>, extra = {}) => ({
  slug: "pack-cumpleanos",
  name: "Pack Cumpleaños",
  opciones,
  unitPriceCents: 3000,
  ...extra,
});

describe("carrito con packs", () => {
  it("elecciones distintas son dos líneas", () => {
    cart.addItem(pack({ empanada: "a", plancha: "b" }));
    const c = cart.addItem(pack({ empanada: "c", plancha: "b" }));
    expect(c.items).toHaveLength(2);
  });

  it("mismas elecciones en otro orden de claves suman en una línea", () => {
    cart.addItem(pack({ empanada: "a", plancha: "b" }));
    const c = cart.addItem(pack({ plancha: "b", empanada: "a" }));
    expect(c.items).toHaveLength(1);
    expect(c.items[0].qty).toBe(2);
  });

  it("misma elección y distinta fotoUrl son dos líneas", () => {
    cart.addItem(pack({ empanada: "a" }, { fotoUrl: "https://x/1.jpg" }));
    const c = cart.addItem(pack({ empanada: "a" }, { fotoUrl: "https://x/2.jpg" }));
    expect(c.items).toHaveLength(2);
  });

  it("updateQty por clave no toca la otra línea", () => {
    const p1 = pack({ empanada: "a" });
    cart.addItem(p1);
    cart.addItem(pack({ empanada: "c" }));
    const c = cart.updateQty(cart.claveLinea(p1), 3);
    expect(c.items[0].qty).toBe(3);
    expect(c.items[1].qty).toBe(1);
  });

  it("removeItem por clave quita solo esa línea", () => {
    const p1 = pack({ empanada: "a" });
    cart.addItem(p1);
    cart.addItem(pack({ empanada: "c" }));
    const c = cart.removeItem(cart.claveLinea(p1));
    expect(c.items).toHaveLength(1);
    expect(c.items[0].opciones).toEqual({ empanada: "c" });
  });

  it("un producto normal sigue funcionando con slug + variantId", () => {
    const base = { slug: "barra", name: "Barra", variantId: "v1", unitPriceCents: 200 };
    cart.addItem(base);
    cart.addItem(base);
    cart.addItem({ ...base, variantId: "v2" });
    let c = cart.loadCart();
    expect(c.items).toHaveLength(2);
    c = cart.updateQty(cart.claveLinea({ slug: "barra", variantId: "v1" }), 5);
    expect(c.items[0].qty).toBe(5);
    c = cart.removeItem(cart.claveLinea({ slug: "barra", variantId: "v1" }));
    expect(c.items).toHaveLength(1);
  });

  it("un carrito viejo sin opciones sigue cargando", () => {
    almacen.set(
      "hsl-cart-v1",
      JSON.stringify({
        items: [{ slug: "barra", name: "Barra", qty: 2, unitPriceCents: 200 }],
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    expect(cart.loadCart().items).toHaveLength(1);
  });
});
