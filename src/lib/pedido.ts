import { z } from "zod";
import {
  isDateAllowed,
  meetsMinimum,
  shippingCents,
  admiteCP,
  esTelefonoValido,
  ZONA_REPARTO_COPY,
  minimoPedidoCents,
  franjasRecogida,
  RECOGIDA_MISMO_DIA_DESDE,
  MIN_ORDER_COPY,
} from "~/lib/entrega";
import { stores, type StoreId } from "~/data/stores";
import { productosParaPedido } from "~/lib/db/productos";
import { definicionesPorSlugs } from "~/lib/db/packs";
import {
  resolverPack,
  slugsFijos,
  PackError,
  type DefinicionPack,
  type PiezaResuelta,
} from "~/data/packs";
import { esFotoDePedido } from "~/lib/storage/fotos-pedido";

/** ¿Las claves de `opciones` son exactamente los huecos de la definición actual? */
function mismosHuecos(
  def: DefinicionPack,
  opciones: Readonly<Record<string, string>>,
): boolean {
  const ids = def.piezas.flatMap((x) => (x.tipo === "eleccion" ? [x.id] : []));
  const claves = Object.keys(opciones);
  return claves.length === new Set(ids).size && claves.every((k) => ids.includes(k));
}

/**
 * Modelo de pedido del lado del servidor.
 *
 * El navegador solo manda referencias y cantidades: los precios se recalculan
 * aquí a partir de la tabla `productos`, que es la única fuente de verdad.
 * Nunca se confía en un importe que venga del cliente.
 */

export const orderPayloadSchema = z.object({
  items: z
    .array(
      z.object({
        slug: z.string().min(1).max(120),
        variantId: z.string().min(1).max(60).optional(),
        qty: z.number().int().min(1).max(99),
        /** Solo en un pack: hueco → slug elegido (`{ empanada: "…" }`). */
        opciones: z
          .record(z.string().min(1).max(40), z.string().min(1).max(120))
          // Ningún pack tiene más de 3 huecos: 8 sobra y acota el trabajo.
          .refine((o) => Object.keys(o).length <= 8, "Demasiadas elecciones.")
          .optional(),
        /** Solo en un pack con foto: la URL que devolvió la subida. */
        fotoUrl: z.string().url().max(500).optional(),
      }),
    )
    .min(1)
    .max(40),
  mode: z.enum(["domicilio", "recogida"]),
  dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Solo en recogida: el envío a domicilio no elige franja. */
  slot: z.enum(["morning", "afternoon"]).optional(),
  storeId: z.string().optional(),
  address: z.string().max(300).optional(),
  /** Solo en domicilio: cinco dígitos, y tiene que ser zona de reparto. */
  postalCode: z
    .string()
    .regex(/^\d{5}$/)
    .optional(),
  name: z.string().max(120).optional(),
  notes: z.string().max(500).optional(),
  email: z.string().email().max(160),
  /** Obligatorio en las dos modalidades: es como se avisa de un problema. */
  phone: z.string().min(9).max(20),
});

export type OrderPayload = z.infer<typeof orderPayloadSchema>;

export type PricedLine = {
  slug: string;
  name: string;
  variantLabel?: string;
  qty: number;
  unitPriceCents: number;
  totalCents: number;
  /** Solo en un pack: sus piezas por UNIDAD de pack, ya validadas. */
  detalle?: PiezaResuelta[];
  fotoUrl?: string;
};

export type PricedOrder = {
  lines: PricedLine[];
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  payload: OrderPayload;
  /**
   * Quién hizo el pedido, si tenía sesión. Sale de `Astro.locals.usuario` en
   * el endpoint que llama a `priceOrder`, nunca del cuerpo de la petición:
   * aceptarlo del navegador dejaría que cualquiera atribuyera su pedido a
   * otra persona. Un invitado no tiene sesión, así que aquí queda `undefined`.
   */
  userId?: string;
};

export class OrderError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

/**
 * Valida el pedido y le pone precio leyendo el catálogo.
 * Lanza OrderError con un mensaje presentable si algo no cuadra.
 *
 * `userId` es opcional y solo lo rellena quien llama desde el endpoint, a
 * partir de la sesión: aquí no se lee de ningún sitio que el navegador
 * pueda tocar.
 */
export async function priceOrder(
  payload: OrderPayload,
  { userId, now = new Date() }: { userId?: string; now?: Date } = {},
): Promise<PricedOrder> {
  if (payload.mode === "domicilio") {
    if (!payload.address || payload.address.trim().length < 6) {
      throw new OrderError("Falta la dirección de entrega.");
    }
    // El navegador ya lo comprueba, pero el reparto se decide aquí: un CP de
    // fuera de zona no puede entrar por mucho que el cliente edite el formulario.
    if (!payload.postalCode) {
      throw new OrderError("Falta el código postal de entrega.");
    }
    if (!admiteCP(payload.postalCode)) {
      throw new OrderError(
        `No repartimos en el código postal ${payload.postalCode}. ${ZONA_REPARTO_COPY}`,
      );
    }
  } else {
    const valid = stores.some((s) => s.id === payload.storeId);
    if (!valid) throw new OrderError("La tienda de recogida no es válida.");
  }

  if (!esTelefonoValido(payload.phone)) {
    throw new OrderError("El teléfono de contacto no parece válido.");
  }

  // La fuente de verdad del precio es la tabla `productos`. Se piden solo los
  // slugs del carrito, no el catálogo entero: son 98 fichas y aquí hacen falta
  // dos o tres.
  // Un pack necesita leer sus piezas, no solo su ficha: las fijas y las
  // elegidas van por slug. Las opciones de un hueco NO se piden por sección:
  // `resolverPack` valida la elegida contra la sección de su propia ficha.
  // Las definiciones de pack salen de Postgres (las edita el panel): una sola
  // consulta con los slugs del carrito, que devuelve solo los que son pack.
  const definiciones = await definicionesPorSlugs([
    ...new Set(payload.items.map((i) => i.slug)),
  ]);
  const defs = payload.items.map((i) => definiciones.get(i.slug));
  const slugs = new Set(payload.items.map((i) => i.slug));
  for (const [n, def] of defs.entries()) {
    if (!def) continue;
    for (const s of slugsFijos(def)) slugs.add(s);
    for (const s of Object.values(payload.items[n].opciones ?? {})) slugs.add(s);
  }
  const bySlug = await productosParaPedido([...slugs]);

  const lines: PricedLine[] = [];
  for (const [index, item] of payload.items.entries()) {
    const product = bySlug.get(item.slug);
    if (!product || !product.activo) {
      // Mismo mensaje para «no existe» y «desactivado»: para quien compra son
      // lo mismo, y distinguirlo solo serviría para adivinar qué hay detrás.
      throw new OrderError(`El producto «${item.slug}» ya no está disponible.`);
    }

    // El de «consultar» va antes que el de «agotado»: un producto sin precio
    // de venta online no es de los que vuelven a haber, así que decirle al
    // cliente que «vuelva a intentarlo» sería engañoso. Con los dos a la vez,
    // el mensaje correcto es el que no invita a reintentar algo que nunca
    // podrá comprarse por aquí.
    if (product.consultar || product.priceCents === null) {
      throw new OrderError(
        `«${product.name}» se encarga hablando con el obrador: no tiene precio de venta online.`,
      );
    }

    if (product.agotado) {
      throw new OrderError(
        `«${product.name}» se ha agotado. Quítalo del carrito y vuelve a intentarlo.`,
      );
    }

    // Un pack se cobra al precio de SU ficha (ya validada arriba); lo que se
    // comprueba aquí es que las piezas que lo componen se puedan servir hoy y
    // que las elecciones sean legales. Va antes de las variantes: un pack no
    // tiene, y así un `variantId` colado no cambia el importe.
    const def = defs[index];
    // La categoría y la definición tienen que coincidir: un pack sin
    // definición se vendería sin desglose, y una definición con una fila de
    // otra categoría pinta la ficha normal (con AddToCart) de algo que aquí
    // no se puede pedir.
    const esPack = product.category === "packs";
    if (esPack !== Boolean(def))
      throw new OrderError(`«${product.name}» no está disponible ahora mismo.`);
    if (esPack && item.variantId) throw new OrderError("Elección no válida.");
    let detalle: PiezaResuelta[] | undefined;
    if (def) {
      // El pack se editó desde el panel después de meterlo en el carrito: sus
      // huecos ya no son los que trae la línea. Se dice qué hacer en vez de
      // un «Elección no válida» que no explica nada (foco de revisión 1).
      if (!mismosHuecos(def, item.opciones ?? {}))
        throw new OrderError(
          `«${product.name}» ha cambiado desde que lo añadiste: quítalo del carrito y vuelve a elegirlo.`,
        );
      try {
        detalle = resolverPack(def, bySlug, item.opciones ?? {});
      } catch (err) {
        if (err instanceof PackError)
          throw new OrderError(`«${product.name}»: ${err.message}`);
        throw err;
      }
      const conFoto = def.piezas.some((x) => x.tipo === "fija" && x.requiereFoto);
      if (conFoto && !item.fotoUrl)
        throw new OrderError(`«${product.name}»: sube la foto para la plancha.`);
      if (!conFoto && item.fotoUrl) throw new OrderError("Elección no válida.");
      // La URL la manda el navegador: solo vale una foto que esté de verdad
      // en nuestro almacén.
      if (item.fotoUrl && !(await esFotoDePedido(item.fotoUrl)))
        throw new OrderError(
          `«${product.name}»: no encontramos la foto. Vuelve a subirla.`,
        );
    } else if (item.opciones || item.fotoUrl) {
      // Un producto normal no admite elecciones: es un cliente manipulado.
      throw new OrderError("Elección no válida.");
    }

    let unitPriceCents = product.priceCents;
    let variantLabel: string | undefined;

    // Con variantes, elegir una es OBLIGATORIO, no opcional. Mientras la
    // carta vivía en los 98 Markdown, `priceCents` era siempre igual al
    // tamaño más barato y omitir `variantId` solo perdía la etiqueta. El
    // panel (tarea 19) desacopló los dos campos: son casillas distintas del
    // formulario, y nada en él sugiere que el «Precio» de arriba siga
    // importando cuando hay tamaños. Así que subir «Pequeña» de 16,50 a
    // 18,00 y dejar el base en 16,50 basta para que una petición sin
    // `variantId` se cobre al precio viejo. Y peor que el dinero: la línea
    // llega a /admin/pedidos como «1× Bombón Noir» SIN tamaño, y el obrador
    // no puede saber cuál de las tres tartas tiene que hacer.
    if (product.variantes.length > 0 && !item.variantId) {
      throw new OrderError(
        `Elige un tamaño para «${product.name}»: sin él no podemos ponerle precio ni saber cuál preparar.`,
      );
    }

    if (item.variantId) {
      const variant = product.variantes.find(
        (v) => v.variantId === item.variantId,
      );
      if (!variant) {
        throw new OrderError(
          `La opción elegida de «${product.name}» ya no está disponible.`,
        );
      }
      unitPriceCents = variant.priceCents;
      variantLabel = variant.label;
    }

    lines.push({
      slug: item.slug,
      name: product.name,
      variantLabel,
      qty: item.qty,
      unitPriceCents,
      totalCents: unitPriceCents * item.qty,
      detalle,
      fotoUrl: item.fotoUrl,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.totalCents, 0);

  // El plazo depende del importe y de la tienda, así que la fecha no se puede
  // validar hasta tener el pedido valorado.
  if (
    !isDateAllowed(payload.mode, payload.dateISO, now, {
      subtotalCents,
      storeId: payload.storeId,
    })
  ) {
    throw new OrderError(
      "La fecha elegida no está disponible para este pedido. Revisa el día de entrega.",
    );
  }

  // La franja depende del día: para hoy solo hay tarde, y en Alcobendas los
  // sábados, domingos y festivos solo mañana.
  if (payload.mode === "recogida") {
    const franjas = franjasRecogida(payload.storeId, payload.dateISO, now);
    if (!franjas.includes(payload.slot ?? "morning")) {
      const tienda = stores.find((s) => s.id === payload.storeId);
      throw new OrderError(
        franjas.includes("afternoon")
          ? `La recogida del mismo día es a partir de las ${RECOGIDA_MISMO_DIA_DESDE}: elige la franja de tarde.`
          : `Ese día la tienda cierra a las ${tienda?.pickupUntilReducido ?? "14:30"}: elige la franja de mañana.`,
      );
    }
  }

  // El mínimo depende del día de entrega, no del día en que se pide.
  if (!meetsMinimum(payload.mode, subtotalCents, payload.dateISO)) {
    const minimo = minimoPedidoCents(payload.mode, payload.dateISO) / 100;
    throw new OrderError(
      `Para ese día el pedido mínimo a domicilio es de ${minimo} €. ${MIN_ORDER_COPY}`,
    );
  }

  const envio = shippingCents(payload.mode, subtotalCents);

  return {
    lines,
    subtotalCents,
    shippingCents: envio,
    totalCents: subtotalCents + envio,
    payload,
    userId,
  };
}

/** Dónde se entrega, en una línea, para el correo y los metadatos de Stripe. */
export function destinationLabel(payload: OrderPayload): string {
  if (payload.mode === "domicilio") {
    return [payload.address, payload.postalCode].filter(Boolean).join(" · ");
  }
  const store = stores.find((s) => s.id === (payload.storeId as StoreId));
  return store ? `${store.shortName} — ${store.address}` : "";
}
