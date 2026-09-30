import { describe, expect, it } from "vitest";
import { resolverRepeticion } from "~/lib/repetir-pedido";
import type { LineaPedido } from "~/lib/db/pedidos";
import type { ProductoVendible } from "~/lib/db/productos";

// Sin base de datos: la función recibe las líneas del pedido antiguo y lo
// que hoy dice el catálogo, y decide qué puede volver al carrito.

const producto = (extra: Partial<ProductoVendible> = {}): ProductoVendible => ({
  slug: "tarta-de-queso",
  name: "Tarta de queso",
  category: "tartas",
  seccion: null,
  priceCents: 1850,
  consultar: false,
  activo: true,
  agotado: false,
  variantes: [],
  ...extra,
});

const linea = (extra: Partial<LineaPedido> = {}): LineaPedido => ({
  slug: "tarta-de-queso",
  nombre: "Tarta de queso",
  varianteLabel: null,
  qty: 2,
  unitPriceCents: 1600,
  ...extra,
});

const catalogo = (...productos: ProductoVendible[]) =>
  new Map(productos.map((p) => [p.slug, p]));

describe("resolverRepeticion", () => {
  it("una línea que sigue en la carta vuelve al carrito con el precio de HOY, no el que se cobró", () => {
    const { items, noDisponibles } = resolverRepeticion(
      [linea({ unitPriceCents: 1600 })],
      catalogo(producto({ priceCents: 1850 })),
    );
    expect(noDisponibles).toEqual([]);
    expect(items).toEqual([
      {
        slug: "tarta-de-queso",
        name: "Tarta de queso",
        variantId: undefined,
        variantLabel: undefined,
        qty: 2,
        unitPriceCents: 1850,
      },
    ]);
  });

  it("un producto que ya no existe en el catálogo se lista como no disponible", () => {
    const { items, noDisponibles } = resolverRepeticion(
      [linea({ slug: "roscon", nombre: "Roscón" })],
      catalogo(producto()),
    );
    expect(items).toEqual([]);
    expect(noDisponibles).toEqual(["Roscón"]);
  });

  it("una línea sin slug (pedido reconstruido desde Stripe) no se puede repetir", () => {
    const { items, noDisponibles } = resolverRepeticion(
      [linea({ slug: null, nombre: "Roscón" })],
      catalogo(producto()),
    );
    expect(items).toEqual([]);
    expect(noDisponibles).toEqual(["Roscón"]);
  });

  it("un producto desactivado no vuelve al carrito", () => {
    const { items, noDisponibles } = resolverRepeticion(
      [linea()],
      catalogo(producto({ activo: false })),
    );
    expect(items).toEqual([]);
    expect(noDisponibles).toEqual(["Tarta de queso"]);
  });

  it("un producto agotado no vuelve al carrito", () => {
    const { items, noDisponibles } = resolverRepeticion(
      [linea()],
      catalogo(producto({ agotado: true })),
    );
    expect(items).toEqual([]);
    expect(noDisponibles).toEqual(["Tarta de queso"]);
  });

  it("un producto que ahora es «consultar» (sin precio online) no vuelve al carrito", () => {
    const { items, noDisponibles } = resolverRepeticion(
      [linea()],
      catalogo(producto({ consultar: true, priceCents: null })),
    );
    expect(items).toEqual([]);
    expect(noDisponibles).toEqual(["Tarta de queso"]);
  });

  describe("variantes", () => {
    const conTamanos = producto({
      priceCents: 1650,
      variantes: [
        { variantId: "pequena", label: "Pequeña", priceCents: 1800 },
        { variantId: "grande", label: "Grande", priceCents: 2600 },
      ],
    });

    it("casa la variante por etiqueta y se lleva su id y su precio actual", () => {
      const { items, noDisponibles } = resolverRepeticion(
        [linea({ varianteLabel: "Grande", unitPriceCents: 2400 })],
        catalogo(conTamanos),
      );
      expect(noDisponibles).toEqual([]);
      expect(items).toEqual([
        {
          slug: "tarta-de-queso",
          name: "Tarta de queso",
          variantId: "grande",
          variantLabel: "Grande",
          qty: 2,
          unitPriceCents: 2600,
        },
      ]);
    });

    it("si la etiqueta ya no casa con ningún tamaño, la línea es no disponible", () => {
      const { items, noDisponibles } = resolverRepeticion(
        [linea({ varianteLabel: "Mediana" })],
        catalogo(conTamanos),
      );
      expect(items).toEqual([]);
      expect(noDisponibles).toEqual(["Tarta de queso (Mediana)"]);
    });

    it("si el producto tiene tamaños y la línea no traía ninguno, no se elige uno por él", () => {
      // Igual que en el checkout: sin tamaño no hay precio ni se sabe cuál
      // preparar, así que no se mete «el primero» a ciegas.
      const { items, noDisponibles } = resolverRepeticion(
        [linea({ varianteLabel: null })],
        catalogo(conTamanos),
      );
      expect(items).toEqual([]);
      expect(noDisponibles).toEqual(["Tarta de queso"]);
    });

    it("si la línea traía tamaño y el producto ya no tiene ninguno, tampoco casa", () => {
      const { items, noDisponibles } = resolverRepeticion(
        [linea({ varianteLabel: "Grande" })],
        catalogo(producto({ variantes: [] })),
      );
      expect(items).toEqual([]);
      expect(noDisponibles).toEqual(["Tarta de queso (Grande)"]);
    });
  });

  it("mezcla: respeta el orden de las líneas y separa lo que sí de lo que no", () => {
    const { items, noDisponibles } = resolverRepeticion(
      [
        linea({ slug: "croissant", nombre: "Croissant", qty: 3 }),
        linea({ slug: "roscon", nombre: "Roscón" }),
        linea({ slug: "tarta-de-queso", nombre: "Tarta de queso", qty: 1 }),
      ],
      catalogo(
        producto(),
        producto({ slug: "croissant", name: "Croissant", priceCents: 190 }),
      ),
    );
    expect(items.map((i) => [i.slug, i.qty, i.unitPriceCents])).toEqual([
      ["croissant", 3, 190],
      ["tarta-de-queso", 1, 1850],
    ]);
    expect(noDisponibles).toEqual(["Roscón"]);
  });
});
