import { useEffect, useRef, useState } from "react";

type Props = {
  pedidoId: string;
  /** ISO, o null si no está archivado. */
  archivadoEn: string | null;
  archivadoPor: string | null;
};

const cuando = (iso: string) =>
  new Intl.DateTimeFormat("es-ES", {
    timeZone: "Europe/Madrid",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

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
 * «Archivar» de cada pedido (12-11-2026). Guarda en el servidor; la tarjeta
 * se queda donde está (con `data-archivado`, que la pliega) hasta que se
 * recarga la lista, para poder deshacerlo al momento.
 */
export default function PedidoArchivar({ pedidoId, archivadoEn, archivadoPor }: Props) {
  const [en, setEn] = useState(archivadoEn);
  const [por, setPor] = useState(archivadoPor);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tarjeta = raiz.current?.closest("[data-pedido]");
    if (tarjeta) (tarjeta as HTMLElement).dataset.archivado = en ? "si" : "no";
  }, [en]);

  async function cambiar(archivar: boolean) {
    if (ocupado) return;
    setOcupado(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/pedidos/archivar", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: pedidoId, archivar }),
      });
      const datos = (await r.json().catch(() => ({}))) as {
        archivadoEn?: string | null;
        archivadoPor?: string | null;
        error?: string;
      };
      if (!r.ok || datos.archivadoEn === undefined) {
        setError(datos.error ?? "No se pudo guardar el cambio.");
        return;
      }
      setEn(datos.archivadoEn);
      setPor(datos.archivadoPor ?? null);
    } catch {
      setError("Sin conexión. Inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div ref={raiz} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
      {en ? (
        <>
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-ink-muted)" }}>
            Archivado
          </span>
          <span style={{ fontSize: 11, color: "var(--color-ink-muted)" }}>
            {por ? `${por} · ` : ""}
            {cuando(en)}
          </span>
          <button type="button" style={enlace} disabled={ocupado} onClick={() => cambiar(false)}>
            {ocupado ? "Guardando…" : "Sacar del archivo"}
          </button>
        </>
      ) : (
        <button type="button" style={enlace} disabled={ocupado} onClick={() => cambiar(true)}>
          {ocupado ? "Guardando…" : "Archivar"}
        </button>
      )}
      {error && (
        <span role="alert" style={{ fontSize: 12, color: "var(--color-teja)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
