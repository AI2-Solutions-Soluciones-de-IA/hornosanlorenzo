import { z } from "zod";
import type { OrderPayload, LineaLibre } from "~/lib/pedido";
import type { Producto } from "~/lib/db/productos";
import { opcionesDeHueco, type DefinicionPack } from "~/data/packs";
import { grupoLabel, grupoOfCategory, isCategoryId } from "~/data/categories";
import { nombreConTipo } from "~/data/secciones";

/**
 * TPV de las oficinas (13-11-2026): los pedidos que se toman por teléfono.
 * Sin `pg` ni `astro:*`: el formulario que acepta `/api/tpv/pedido` y la
 * carta que recibe la pantalla, las dos cosas puras para poder probarlas.
 *
 * Lo que cambia frente a la web: el correo es opcional, basta un nombre, se
 * pueden apuntar productos fuera de la carta (nombre y precio a mano) y el
 * pedido puede entrar ya cobrado. Los límites de la web no cortan: avisan
 * (`priceOrder` con `flexible`).
 */

export const tpvPayloadSchema = z.object({
  items: z
    .array(
      z.object({
        slug: z.string().min(1).max(120),
        variantId: z.string().min(1).max(60).optional(),
        qty: z.number().int().min(1).max(999),
        opciones: z
          .record(z.string().min(1).max(40), z.string().min(1).max(120))
          .refine((o) => Object.keys(o).length <= 8, "Demasiadas elecciones.")
          .optional(),
      }),
    )
    .max(60),
  libres: z
    .array(
      z.object({
        nombre: z.string().trim().min(2).max(120),
        // Hasta 2.000 € por unidad: un precio mayor es un dedo que se ha ido.
        precioCents: z.number().int().min(0).max(200_000),
        qty: z.number().int().min(1).max(999),
      }),
    )
    .max(20),
  mode: z.enum(["domicilio", "recogida"]),
  dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.enum(["morning", "afternoon"]).optional(),
  storeId: z.string().optional(),
  address: z.string().max(300).optional(),
  postalCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  name: z.string().trim().min(2).max(120),
  phone: z.string().min(9).max(20),
  /** Opcional: si lo da, le llega la confirmación. */
  email: z
    .union([z.literal(""), z.string().trim().email().max(160)])
    .optional(),
  notes: z.string().max(1000).optional(),
  /** Ya cobrado en la tienda; si no, se paga al recoger o al recibirlo. */
  pagado: z.boolean(),
});

export type TpvPayload = z.infer<typeof tpvPayloadSchema>;

/** Lo que `priceOrder` entiende, y lo de fuera de la carta aparte. */
export function aPedido(t: TpvPayload): {
  payload: OrderPayload;
  libres: LineaLibre[];
} {
  const recogida = t.mode === "recogida";
  return {
    payload: {
      items: t.items,
      mode: t.mode,
      dateISO: t.dateISO,
      slot: recogida ? (t.slot ?? "morning") : undefined,
      storeId: recogida ? t.storeId : undefined,
      address: recogida ? undefined : t.address?.trim(),
      postalCode: recogida ? undefined : t.postalCode,
      name: t.name.trim(),
      notes: t.notes?.trim() || undefined,
      email: t.email?.trim() ?? "",
      phone: t.phone.trim(),
    },
    libres: t.libres,
  };
}

/** Un producto tal como lo ve la pantalla del TPV. */
export type ProductoTpv = {
  slug: string;
  /** Con su tipo delante: «Empanada · Bonito». */
  nombre: string;
  /** Para los botones de filtro: «Dulce», «Salado», «Pan»… */
  grupo: string;
  precioCents: number | null;
  variantes: { id: string; label: string; precioCents: number }[];
  agotado: boolean;
  /**
   * La foto de la tienda (13-11-2026). La página la cambia por una miniatura
   * optimizada antes de mandarla a la pantalla; null si no tiene.
   */
  foto: { url: string; ancho: number; alto: number } | null;
  /** Solo los packs: qué hay que elegir y si lleva foto. */
  pack?: {
    lleva: string[];
    huecos: {
      id: string;
      etiqueta: string;
      opciones: { slug: string; nombre: string }[];
    }[];
    conFoto: boolean;
  };
};

/**
 * La carta del TPV: lo que tiene precio, en el orden de la carta. Lo que se
 * vende «a consultar» no entra: se apunta como producto fuera de la carta.
 * Un pack sin definición tampoco (no se sabría qué lleva).
 */
export function cartaTpv(
  productos: readonly Producto[],
  definiciones: ReadonlyMap<string, DefinicionPack>,
): ProductoTpv[] {
  const res: ProductoTpv[] = [];
  for (const p of productos) {
    if (!p.activo || p.consultar || p.priceCents === null) continue;
    const grupoId = isCategoryId(p.category)
      ? grupoOfCategory(p.category)
      : null;
    const base: ProductoTpv = {
      slug: p.slug,
      nombre: nombreConTipo(p.name, p.seccion),
      grupo: grupoId ? grupoLabel[grupoId] : "Otros",
      precioCents: p.priceCents,
      variantes: p.variantes.map((v) => ({
        id: v.variantId,
        label: v.label,
        precioCents: v.priceCents,
      })),
      agotado: p.agotado,
      foto:
        p.imageUrl && p.imageWidth && p.imageHeight
          ? { url: p.imageUrl, ancho: p.imageWidth, alto: p.imageHeight }
          : null,
    };
    if (p.category === "packs") {
      const def = definiciones.get(p.slug);
      if (!def) continue;
      base.variantes = [];
      base.pack = {
        lleva: def.piezas.flatMap((x) => (x.tipo === "fija" ? [x.titulo] : [])),
        huecos: def.piezas.flatMap((x) =>
          x.tipo === "eleccion"
            ? [
                {
                  id: x.id,
                  etiqueta: x.etiqueta,
                  opciones: opcionesDeHueco(x, productos).map((o) => ({
                    slug: o.slug,
                    nombre: o.name,
                  })),
                },
              ]
            : [],
        ),
        conFoto: def.piezas.some((x) => x.tipo === "fija" && x.requiereFoto),
      };
    }
    res.push(base);
  }
  return res;
}
