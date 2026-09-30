import { useState } from "react";

type Estado = "pagado" | "sin_pago";

type Props = {
  pedidoId: string;
  estadoInicial: Estado;
  /** Cobrado por Stripe: se enseña «Pagado» y no hay nada que tocar. */
  deStripe: boolean;
};

const etiqueta: React.CSSProperties = {
  display: "inline-block",
  padding: "4px 12px",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.16em",
};

/**
 * «Marcar como cobrado»: del mismo tamaño que la etiqueta de al lado. Con
 * el `.btn` grande, cada pedido sin pagar ocupaba media pantalla de botón.
 */
const botonCobrar: React.CSSProperties = {
  ...etiqueta,
  margin: 0,
  border: "1px solid var(--color-moka)",
  background: "var(--color-moka)",
  color: "var(--color-leche)",
  fontFamily: "inherit",
  lineHeight: "inherit",
  cursor: "pointer",
};

const enlace: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 12,
  color: "var(--color-ink-muted)",
  textDecoration: "underline",
  textUnderlineOffset: 4,
  cursor: "pointer",
  fontFamily: "inherit",
};

/**
 * Etiqueta de estado del pedido con el botón para cobrarlo a mano (o
 * deshacerlo). El estado de verdad lo decide el servidor: si responde que
 * el pedido ya no admite el cambio, se avisa y se recarga en vez de fingir.
 */
export default function PedidoEstado({ pedidoId, estadoInicial, deStripe }: Props) {
  const [estado, setEstado] = useState<Estado>(estadoInicial);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cambiar(nuevo: Estado) {
    if (ocupado) return;
    if (
      nuevo === "sin_pago" &&
      !window.confirm("¿Devolver este pedido a «Sin pagar»?")
    )
      return;
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/pedidos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: pedidoId, estado: nuevo }),
      });
      const datos = (await r.json().catch(() => ({}))) as { estado?: Estado; error?: string };
      if (!r.ok || !datos.estado) {
        setError(datos.error ?? "No se pudo guardar el cambio.");
        return;
      }
      setEstado(datos.estado);
    } catch {
      setError("Sin conexión. Inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  if (deStripe) {
    return (
      <p style={{ ...etiqueta, background: "var(--color-latte)", color: "var(--color-moka)", marginTop: 8 }}>
        Pagado por Stripe
      </p>
    );
  }

  return (
    <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {estado === "sin_pago" ? (
        <>
          <p style={{ ...etiqueta, background: "var(--color-teja)", color: "var(--color-leche)" }}>
            Sin pagar
          </p>
          <button
            type="button"
            onClick={() => cambiar("pagado")}
            disabled={ocupado}
            style={{ ...botonCobrar, opacity: ocupado ? 0.6 : 1 }}
          >
            {ocupado ? "Guardando…" : "Marcar como cobrado"}
          </button>
        </>
      ) : (
        <>
          <p style={{ ...etiqueta, background: "var(--color-latte)", color: "var(--color-moka)" }}>
            Cobrado en tienda
          </p>
          <button type="button" style={enlace} onClick={() => cambiar("sin_pago")} disabled={ocupado}>
            Deshacer
          </button>
        </>
      )}
      {error && (
        <p role="alert" style={{ fontSize: 12, color: "var(--color-teja)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
