import type { CartItem } from "~/lib/cart";
import type { LineaPedido } from "~/lib/db/pedidos";
import type { ProductoVendible } from "~/lib/db/productos";

/**
 * «Repetir pedido»: qué líneas de un pedido antiguo pueden volver al carrito
 * y cuáles ya no.
 *
 * Los precios NUNCA se copian del pedido: un pedido de hace tres meses lleva
 * el importe que se cobró entonces, y el carrito tiene que enseñar el de
 * hoy. Por eso cada línea se resuelve contra lo que dice el catálogo ahora
 * mismo, con las mismas reglas que aplica `priceOrder` en el checkout: si
 * aquí se dejara pasar algo que allí se rechaza, el cliente vería «Añadido al
 * carrito» y a la hora de pagar un error que no entiende.
 *
 * Función pura a propósito: la página carga los productos y esto solo decide.
 */
export type Repeticion = {
  /** Lo que se mete en el carrito, ya con el precio actual y el `variantId`. */
  items: CartItem[];
  /** Nombres de las líneas que ya no se pueden pedir, para decirlo tal cual. */
  noDisponibles: string[];
};

/** El nombre con el que el cliente reconoce la línea en su pedido antiguo. */
function etiqueta(linea: LineaPedido): string {
  return linea.varianteLabel
    ? `${linea.nombre} (${linea.varianteLabel})`
    : linea.nombre;
}

/** La etiqueta de la variante se guardó tal cual; se compara sin ruido. */
const normaliza = (s: string) => s.trim().toLocaleLowerCase("es");

export function resolverRepeticion(
  lineas: LineaPedido[],
  productos: Map<string, ProductoVendible>,
): Repeticion {
  const items: CartItem[] = [];
  const noDisponibles: string[] = [];

  for (const linea of lineas) {
    // Un pack exige volver a elegir los sabores (y, en el de la foto,
    // volver a subirla): no se reconstruyen las elecciones.
    if (linea.detalle) {
      noDisponibles.push(`${linea.nombre} (vuelve a elegir los sabores)`);
      continue;
    }
    // Sin slug es un pedido reconstruido desde Stripe (migración 008): no
    // hay forma de saber qué ficha era.
    const producto = linea.slug ? productos.get(linea.slug) : undefined;
    if (!producto || !producto.activo || producto.agotado) {
      noDisponibles.push(etiqueta(linea));
      continue;
    }
    // Sin precio de venta online se encarga hablando con el obrador, no
    // desde el carrito.
    if (producto.consultar || producto.priceCents === null) {
      noDisponibles.push(etiqueta(linea));
      continue;
    }

    let unitPriceCents = producto.priceCents;
    let variantId: string | undefined;
    let variantLabel: string | undefined;

    // Con tamaños, elegir uno es obligatorio (misma regla que el checkout):
    // si la línea no traía ninguno, o el que traía ya no existe, no se elige
    // otro por el cliente. Y al revés: una línea con tamaño de un producto
    // que ya no los tiene es otra cosa distinta de la que pidió.
    if (producto.variantes.length > 0 || linea.varianteLabel) {
      const buscada = linea.varianteLabel
        ? normaliza(linea.varianteLabel)
        : null;
      const variante = buscada
        ? producto.variantes.find((v) => normaliza(v.label) === buscada)
        : undefined;
      if (!variante) {
        noDisponibles.push(etiqueta(linea));
        continue;
      }
      unitPriceCents = variante.priceCents;
      variantId = variante.variantId;
      variantLabel = variante.label;
    }

    items.push({
      slug: producto.slug,
      name: producto.name,
      variantId,
      variantLabel,
      qty: linea.qty,
      unitPriceCents,
    });
  }

  return { items, noDisponibles };
}
