import type { ReactNode } from "react";
import type { Problema } from "~/lib/admin-packs-api";

/**
 * Estilos y piezas comunes del editor de packs. Mismos tokens que
 * `AdminProductos.tsx`: el manual de marca prohíbe esquinas redondeadas,
 * sombras y degradados, de ahí el `borderRadius: 0` explícito.
 */
export const etiqueta: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: "var(--color-ink-muted)",
  fontWeight: 500,
};

export const campo: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.65rem 0.9rem",
  border: "1px solid var(--color-avellana)",
  borderRadius: 0,
  fontSize: 14,
  fontFamily: "inherit",
  background: "var(--color-leche)",
  marginTop: 8,
};

export const insignia: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
  padding: "0.2rem 0.5rem",
  border: "1px solid var(--color-caramelo)",
  color: "var(--color-caramelo)",
  whiteSpace: "nowrap",
};

export const botonLinea: React.CSSProperties = {
  background: "none",
  border: "1px solid var(--color-avellana)",
  borderRadius: 0,
  padding: "0.5rem 0.75rem",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
  color: "var(--color-ink)",
};

export const ayuda: React.CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  color: "var(--color-ink-muted)",
};

export const MENSAJE_GENERICO = "Algo ha fallado. Inténtalo de nuevo.";
export const SIN_CONEXION = "No hemos podido conectar. Comprueba tu conexión.";

/** Errores (caramelo, como en Productos) y avisos (tinta suave) junto a su campo. */
export function Problemas({
  errores = [],
  avisos = [],
}: {
  errores?: readonly Problema[];
  avisos?: readonly Problema[];
}) {
  if (errores.length === 0 && avisos.length === 0) return null;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
      {errores.map((e, i) => (
        <li
          key={`e${i}`}
          role="alert"
          style={{
            fontSize: 13,
            color: "var(--color-caramelo)",
            fontWeight: 600,
            marginTop: 4,
          }}
        >
          {e.mensaje}
        </li>
      ))}
      {avisos.map((a, i) => (
        <li
          key={`a${i}`}
          style={{
            fontSize: 13,
            color: "var(--color-ink-muted)",
            marginTop: 4,
          }}
        >
          Aviso: {a.mensaje}
        </li>
      ))}
    </ul>
  );
}

/** Un bloque del formulario, separado del anterior por un filete. */
export function Bloque({
  numero,
  titulo,
  children,
}: {
  numero: string;
  titulo: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        borderTop: "1px solid var(--color-avellana)",
        paddingTop: 20,
        marginTop: 32,
      }}
    >
      <p className="numeracion">{numero}</p>
      <h2
        className="font-[family-name:var(--font-display)] text-2xl"
        style={{ marginTop: 4 }}
      >
        {titulo}
      </h2>
      {children}
    </section>
  );
}

/** ↑ ↓ Quitar, para las listas ordenadas del formulario. */
export function Mover({
  i,
  total,
  onMover,
  onQuitar,
  que,
}: {
  i: number;
  total: number;
  onMover: (dir: -1 | 1) => void;
  onQuitar: () => void;
  que: string;
}) {
  const desactivado = (d: boolean): React.CSSProperties => ({
    ...botonLinea,
    padding: "0.45rem 0.65rem",
    opacity: d ? 0.4 : 1,
    cursor: d ? "not-allowed" : "pointer",
  });
  return (
    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => onMover(-1)}
        disabled={i === 0}
        aria-label={`Subir ${que}`}
        title="Subir"
        style={desactivado(i === 0)}
      >
        ↑
      </button>
      <button
        type="button"
        onClick={() => onMover(1)}
        disabled={i === total - 1}
        aria-label={`Bajar ${que}`}
        title="Bajar"
        style={desactivado(i === total - 1)}
      >
        ↓
      </button>
      <button
        type="button"
        onClick={onQuitar}
        aria-label={`Quitar ${que}`}
        style={botonLinea}
      >
        Quitar
      </button>
    </div>
  );
}
