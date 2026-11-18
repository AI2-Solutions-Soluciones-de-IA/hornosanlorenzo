import { describe, expect, it } from "vitest";
import { aPedido, cartaTpv, tpvPayloadSchema } from "~/lib/tpv";
import type { Producto } from "~/lib/db/productos";
import type { DefinicionPack } from "~/data/packs";

const producto = (extra: Partial<Producto>): Producto =>
  ({
    id: "x",
    slug: "p",
    name: "P",
    category: "salado",
    seccion: null,
    priceCents: 1000,
    consultar: false,
    activo: true,
    agotado: false,
    variantes: [],
    ...extra,
  }) as Producto;

describe("tpvPayloadSchema", () => {
  const base = {
    items: [{ slug: "barra-artesana", qty: 2 }],
    libres: [],
    mode: "recogida",
    dateISO: "2026-11-20",
    slot: "morning",
    storeId: "alcobendas",
    name: "Lucía",
    phone: "611234567",
    pagado: false,
  };

  it("el correo es opcional, pero si se escribe tiene que ser un correo", () => {
    expect(tpvPayloadSchema.safeParse(base).success).toBe(true);
    expect(tpvPayloadSchema.safeParse({ ...base, email: "" }).success).toBe(true);
    expect(tpvPayloadSchema.safeParse({ ...base, email: "lucia@" }).success).toBe(false);
  });

  it("admite más unidades que la web (pedidos grandes por teléfono)", () => {
    expect(tpvPayloadSchema.safeParse({ ...base, items: [{ slug: "x", qty: 300 }] }).success).toBe(true);
  });
});

describe("aPedido", () => {
  it("en recogida no pasa dirección; a domicilio, ni tienda ni franja", () => {
    const comun = {
      items: [],
      libres: [{ nombre: "Tarta", precioCents: 3000, qty: 1 }],
      dateISO: "2026-11-20",
      name: " Lucía ",
      phone: "611234567",
      pagado: true,
      address: "Calle 1",
      postalCode: "28100",
      storeId: "pozuelo",
      slot: "afternoon" as const,
    };
    const r = aPedido({ ...comun, mode: "recogida" });
    expect(r.payload).toMatchObject({ storeId: "pozuelo", slot: "afternoon", address: undefined, name: "Lucía", email: "" });
    const d = aPedido({ ...comun, mode: "domicilio" });
    expect(d.payload).toMatchObject({ storeId: undefined, slot: undefined, address: "Calle 1", postalCode: "28100" });
    expect(d.libres).toHaveLength(1);
  });
});

describe("cartaTpv", () => {
  it("deja fuera lo que no tiene precio y lo inactivo, y nombra con el tipo", () => {
    const carta = cartaTpv(
      [
        producto({ slug: "empanada-de-bonito", name: "Bonito", seccion: "empanadas" }),
        producto({ slug: "consulta", consultar: true, priceCents: null }),
        producto({ slug: "apagado", activo: false }),
      ],
      new Map(),
    );
    expect(carta.map((p) => p.slug)).toEqual(["empanada-de-bonito"]);
    expect(carta[0].nombre).toBe("Empanada · Bonito");
    expect(carta[0].grupo).toBe("Salado");
    expect(carta[0].foto).toBeNull();
  });

  it("lleva la foto de la tienda con sus medidas", () => {
    const [p] = cartaTpv(
      [producto({ imageUrl: "https://x.public.blob.vercel-storage.com/a.webp", imageWidth: 1600, imageHeight: 1200 })],
      new Map(),
    );
    expect(p.foto).toEqual({ url: "https://x.public.blob.vercel-storage.com/a.webp", ancho: 1600, alto: 1200 });
  });

  it("un pack lleva sus huecos con las opciones vendibles; sin definición no sale", () => {
    const def: DefinicionPack = {
      slug: "pack-merienda",
      ocasion: "",
      personas: { min: 4, max: 6, texto: "" },
      paraQuien: [],
      piezas: [
        { tipo: "fija", slug: "cebra", titulo: "Una cebra", descripcion: "" },
        { tipo: "eleccion", id: "empanada", titulo: "", descripcion: "", etiqueta: "Sabor de la empanada", seccion: "empanadas" },
      ],
    };
    const productos = [
      producto({ slug: "pack-merienda", category: "packs", priceCents: 3500 }),
      producto({ slug: "pack-sin-def", category: "packs" }),
      producto({ slug: "cebra", category: "bolleria" }),
      producto({ slug: "empanada-de-bonito", name: "Bonito", seccion: "empanadas" }),
      producto({ slug: "empanada-agotada", name: "Atún", seccion: "empanadas", agotado: true }),
    ];
    const carta = cartaTpv(productos, new Map([["pack-merienda", def]]));
    const pack = carta.find((p) => p.slug === "pack-merienda")!;
    expect(carta.some((p) => p.slug === "pack-sin-def")).toBe(false);
    expect(pack.pack).toEqual({
      lleva: ["Una cebra"],
      huecos: [{ id: "empanada", etiqueta: "Sabor de la empanada", opciones: [{ slug: "empanada-de-bonito", nombre: "Bonito" }] }],
      conFoto: false,
    });
  });
});
