import { useEffect, useState } from "react";
import { useCart } from "~/hooks/useCart";
import { claveLinea } from "~/lib/cart";
import { formatPriceCents } from "~/lib/format";
import { MODE_COPY } from "~/lib/entrega";
import CheckoutFlow, { type Prefill } from "~/islands/CheckoutFlow";
import {
  recogerCheckout,
  type CheckoutAparcado,
} from "~/lib/reanudar-checkout";

type Props = {
  /** Sin sesión llega `undefined` y el checkout se abre como siempre. */
  prefill?: Prefill;
};

export default function CartPage({ prefill }: Props) {
  const { cart, totalCents, totalQty, updateQty, removeItem, clearCart } =
    useCart();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [reanudar, setReanudar] = useState<CheckoutAparcado | null>(null);

  // De vuelta de «Ya soy cliente»: el checkout se reabre solo donde estaba.
  // Solo con sesión; si no llegó a entrar, el carrito se ve como siempre.
  useEffect(() => {
    const aparcado = recogerCheckout();
    if (aparcado && prefill) {
      setReanudar(aparcado);
      setCheckoutOpen(true);
    }
  }, [prefill]);

  if (cart.items.length === 0) {
    return (
      <section
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "3rem 1rem",
          textAlign: "center",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 36,
            marginBottom: 12,
          }}
        >
          Tu pedido está vacío
        </h1>
        <p style={{ color: "var(--color-ink-muted)", marginBottom: 24 }}>
          Empieza por el catálogo y añade lo que necesites.
        </p>
        <a href="/catalogo" className="btn btn-primario">
          Ver catálogo →
        </a>
      </section>
    );
  }

  return (
    <section style={{ maxWidth: 960, margin: "0 auto", padding: "2rem 1rem" }}>
      <p className="numeracion">Tu pedido</p>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 40,
          marginTop: 4,
        }}
      >
        {totalQty} {totalQty === 1 ? "artículo" : "artículos"}
      </h1>

      <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
        {cart.items.map((item) => (
          <div
            key={claveLinea(item)}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              gap: 16,
              padding: 16,
              border: "1px solid var(--color-avellana)",
              background: "var(--color-leche)",
            }}
          >
            <div>
              <p style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>
                {item.name}
              </p>
              {item.variantLabel && (
                <p style={{ fontSize: 13, color: "var(--color-ink-muted)" }}>
                  {item.variantLabel}
                </p>
              )}
              {item.detalle && item.detalle.length > 0 && (
                <ul
                  style={{
                    fontSize: 13,
                    color: "var(--color-ink-muted)",
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                  }}
                >
                  {/* Por posición: en Gran Celebración las dos quiches pueden ser la misma. */}
                  {item.detalle.map((linea, i) => (
                    <li key={`${i}-${linea}`}>{linea}</li>
                  ))}
                </ul>
              )}
              {item.fotoUrl && (
                <p style={{ fontSize: 13, color: "var(--color-ink-muted)" }}>
                  Con tu foto
                </p>
              )}
              <p
                style={{
                  fontSize: 14,
                  color: "var(--color-ink-muted)",
                  marginTop: 4,
                }}
              >
                {formatPriceCents(item.unitPriceCents)} c/u
              </p>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  border: "1px solid var(--color-avellana)",
                }}
              >
                <button
                  onClick={() =>
                    updateQty(claveLinea(item), item.qty - 1)
                  }
                  aria-label={`Quitar una unidad de ${item.name}`}
                  style={{
                    width: 36,
                    height: 36,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  −
                </button>
                <span
                  style={{ minWidth: 24, textAlign: "center", fontWeight: 600 }}
                >
                  {item.qty}
                </span>
                <button
                  onClick={() =>
                    updateQty(claveLinea(item), item.qty + 1)
                  }
                  aria-label={`Añadir una unidad de ${item.name}`}
                  style={{
                    width: 36,
                    height: 36,
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  +
                </button>
              </div>
              <p
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 18,
                  fontWeight: 600,
                }}
              >
                {formatPriceCents(item.unitPriceCents * item.qty)}
              </p>
              <button
                onClick={() => removeItem(claveLinea(item))}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-ink-muted)",
                  fontSize: 12,
                  textDecoration: "underline",
                  cursor: "pointer",
                }}
              >
                Quitar
              </button>
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 24,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 18,
        }}
      >
        <span>Total estimado</span>
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 24,
          }}
        >
          {formatPriceCents(totalCents)}
        </span>
      </div>

      {/* Condiciones de entrega del brief, antes de entrar al flujo */}
      <div
        style={{
          marginTop: 24,
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        {(["domicilio", "recogida"] as const).map((m) => (
          <div
            key={m}
            style={{
              padding: "1rem 1.25rem",
              border: "1px solid var(--color-avellana)",
              background: "var(--color-latte)",
            }}
          >
            <p className="numeracion">{MODE_COPY[m].label}</p>
            <p
              style={{
                marginTop: 8,
                fontSize: 13,
                lineHeight: 1.5,
                color: "var(--color-ink-muted)",
              }}
            >
              {MODE_COPY[m].body}
            </p>
          </div>
        ))}
      </div>

      <div
        style={{
          position: "sticky",
          bottom: 16,
          marginTop: 32,
          background: "var(--color-leche)",
          padding: 16,
          border: "1px solid var(--color-avellana)",
        }}
      >
        <button
          onClick={() => setCheckoutOpen(true)}
          className="btn btn-primario"
          style={{ width: "100%", border: "none", fontSize: 16 }}
        >
          Continuar con el pedido · {formatPriceCents(totalCents)}
        </button>
      </div>

      <p style={{ textAlign: "center", marginTop: 16 }}>
        <button
          onClick={() => {
            if (confirm("¿Vaciar el carrito?")) clearCart();
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--color-ink-muted)",
            textDecoration: "underline",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Vaciar carrito
        </button>
      </p>

      {checkoutOpen && (
        <CheckoutFlow
          cart={cart}
          totalCents={totalCents}
          onClose={() => {
            setCheckoutOpen(false);
            setReanudar(null);
          }}
          prefill={prefill}
          reanudar={reanudar}
        />
      )}
    </section>
  );
}
