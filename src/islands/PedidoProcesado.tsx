import { useEffect, useRef, useState } from "react";

type Props = {
  pedidoId: string;
  /** ISO, o null si no está procesado. */
  procesadoEn: string | null;
  procesadoPor: string | null;
};

const cuando = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Casilla «Procesado» de cada pedido (11-11-2026). Guarda en el servidor y
 * enseña quién y cuándo lo marcó. Pone `data-procesado` en la tarjeta del
 * pedido para que se vea apagada sin recargar la página.
 */
export default function PedidoProcesado({ pedidoId, procesadoEn, procesadoPor }: Props) {
  const [en, setEn] = useState(procesadoEn);
  const [por, setPor] = useState(procesadoPor);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tarjeta = raiz.current?.closest("[data-pedido]");
    if (tarjeta) (tarjeta as HTMLElement).dataset.procesado = en ? "si" : "no";
  }, [en]);

  async function cambiar(marcado: boolean) {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/pedidos/procesado", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: pedidoId, procesado: marcado }),
      });
      const datos = (await r.json().catch(() => ({}))) as {
        procesadoEn?: string | null;
        procesadoPor?: string | null;
        error?: string;
      };
      if (!r.ok || datos.procesadoEn === undefined) {
        setError(datos.error ?? "No se pudo guardar el cambio.");
        return;
      }
      setEn(datos.procesadoEn);
      setPor(datos.procesadoPor ?? null);
    } catch {
      setError("Sin conexión. Inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div ref={raiz} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          border: `1px solid ${en ? "var(--color-moka)" : "var(--color-avellana)"}`,
          background: en ? "var(--color-moka)" : "var(--color-leche)",
          color: en ? "var(--color-leche)" : "var(--color-moka)",
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          cursor: ocupado ? "wait" : "pointer",
          opacity: ocupado ? 0.6 : 1,
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={Boolean(en)}
          disabled={ocupado}
          onChange={(e) => cambiar(e.target.checked)}
          style={{ width: 16, height: 16, margin: 0, accentColor: "var(--color-caramelo)" }}
        />
        Procesado
      </label>
      {en && (
        <span style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
          {por ? `${por} · ` : ""}
          {cuando(en)}
        </span>
      )}
      {error && (
        <span role="alert" style={{ fontSize: 12, color: "var(--color-teja)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
