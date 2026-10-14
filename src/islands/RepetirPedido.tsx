import { useState } from "react";
import { addItem, loadCart, type CartItem } from "~/lib/cart";
import { unidadesLibres, LIMITE_UNIDADES_COPY } from "~/lib/limites-pedido";
import { emitToast } from "~/islands/ToastHost";

type Props = {
  /**
   * Las líneas YA resueltas contra el catálogo de hoy por la página, con el
   * precio actual y el `variantId` (`~/lib/repetir-pedido.ts`). La isla no
   * decide nada: solo las mete en el carrito, que vive en `localStorage` y
   * por eso esto tiene que correr en el navegador.
   */
  items: CartItem[];
  /** Lo que ya no se puede pedir, para decirlo antes de que pulse. */
  noDisponibles: string[];
};

// Mismo botón que `AddToCart.tsx` y el `.btn-primario` del sitio (`--color-boton`),
// con las esquinas redondeadas de todos los botones (`--radius-boton`).
const boton: React.CSSProperties = {
  background: "var(--color-boton)",
  color: "var(--color-leche)",
  border: "none",
  padding: "0.75rem 1.5rem",
  borderRadius: "var(--radius-boton)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

export default function RepetirPedido({ items, noDisponibles }: Props) {
  const [anadido, setAnadido] = useState(false);
  const nada = items.length === 0;

  function onRepetir() {
    // `addItem` recorta lo que pase del límite por producto: se avisa si pasa.
    let recortado = false;
    for (const item of items) {
      if (item.qty > unidadesLibres(loadCart().items, item.slug)) recortado = true;
      addItem(item);
    }
    const anadido = `Añadido al carrito: ${items.length} ${items.length === 1 ? "producto" : "productos"}`;
    emitToast(recortado ? `${anadido}. ${LIMITE_UNIDADES_COPY}` : anadido, {
      aviso: recortado,
    });
    // El botón pasa a ser el enlace al carrito en vez de redirigir a secas:
    // así el aviso de arriba se llega a ver, y pulsar dos veces no duplica.
    setAnadido(true);
  }

  return (
    <div style={{ marginTop: 16 }}>
      {anadido ? (
        <a
          href="/carrito"
          style={{ ...boton, display: "inline-block", textDecoration: "none" }}
        >
          Ver el carrito
        </a>
      ) : (
        <button
          type="button"
          onClick={onRepetir}
          disabled={nada}
          style={{
            ...boton,
            cursor: nada ? "not-allowed" : "pointer",
            opacity: nada ? 0.5 : 1,
          }}
        >
          Repetir pedido
        </button>
      )}

      {noDisponibles.length > 0 && (
        <p
          style={{
            marginTop: 8,
            fontSize: 13,
            color: "var(--color-ink-muted)",
          }}
        >
          {nada
            ? "Ya no está disponible nada de este pedido: "
            : "Ya no está disponible: "}
          {noDisponibles.join(", ")}
        </p>
      )}
    </div>
  );
}
