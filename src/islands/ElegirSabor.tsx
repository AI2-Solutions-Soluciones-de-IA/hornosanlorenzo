import { useEffect, useState } from "react";
import { addItem } from "~/lib/cart";
import { emitToast } from "~/islands/ToastHost";
import { formatPriceCents } from "~/lib/format";

/** `precioAntesCents`: con oferta de Este mes, el de siempre para tacharlo. */
type Variant = { id: string; label: string; priceCents: number; precioAntesCents?: number };

export type Sabor = {
  slug: string;
  name: string;
  /** null = sin precio de venta online. */
  priceCents: number | null;
  precioAntesCents?: number;
  consultar: boolean;
  agotado: boolean;
  unit?: string;
  variants: Variant[];
  /** Etiqueta de la carta del sabor, si la tiene. */
  especialidad?: string | null;
};

type Props = {
  /** «Empanada», «Suprema»: para el nombre de la línea del carrito. */
  singular: string;
  titulo: string;
  sabores: Sabor[];
};

const selectStyle: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  width: "100%",
  minHeight: 40,
  padding: "0 2rem 0 0.75rem",
  border: "1px solid var(--color-line)",
  borderRadius: 0,
  background:
    "var(--color-leche) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='8' viewBox='0 0 12 12' fill='none' stroke='%23322820' stroke-width='1.6'%3E%3Cpath d='m2 4.5 4 3.5 4-3.5'/%3E%3C/svg%3E\") no-repeat right 0.75rem center",
  color: "var(--color-ink)",
  font: "inherit",
  fontSize: 13,
  cursor: "pointer",
};

const comprable = (s: Sabor) =>
  !s.agotado && !s.consultar && s.priceCents !== null;

/**
 * Selector de sabor de una tarjeta agrupada (`ProductoSaboresCard`). Cada
 * sabor es su propio producto: lo que entra al carrito es el slug y el
 * tamaño del elegido, con su precio, igual que desde su tarjeta suelta.
 */
export default function ElegirSabor({ singular, titulo, sabores }: Props) {
  // Hasta hidratar, los selectores son HTML suelto: si alguien elige un
  // sabor en ese rato, React lo pisa al montar y al carrito iría otro. Se
  // bloquean hasta que la isla está viva.
  const [listo, setListo] = useState(false);
  useEffect(() => setListo(true), []);

  const [slug, setSlug] = useState(
    () => (sabores.find(comprable) ?? sabores[0]).slug,
  );
  const sabor = sabores.find((s) => s.slug === slug) ?? sabores[0];
  const [variantId, setVariantId] = useState<string | undefined>(
    sabor.variants[0]?.id,
  );

  // Cada sabor trae sus tamaños: al cambiar de sabor se vuelve al primero.
  function elegirSabor(nuevo: string) {
    setSlug(nuevo);
    const s = sabores.find((x) => x.slug === nuevo);
    setVariantId(s?.variants[0]?.id);
  }

  const variant = sabor.variants.find((v) => v.id === variantId);
  const precio = variant?.priceCents ?? sabor.priceCents;
  const precioAntes = variant ? variant.precioAntesCents : sabor.precioAntesCents;
  const nombre = `${singular} · ${sabor.name}`;

  function onAdd() {
    if (!comprable(sabor) || precio === null) return;
    addItem({
      slug: sabor.slug,
      name: nombre,
      variantId: variant?.id,
      variantLabel: variant?.label,
      unitPriceCents: precio,
      qty: 1,
    });
    emitToast(`Añadido — ${nombre}${variant ? ` (${variant.label})` : ""}`);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.625rem",
        marginTop: "1rem",
      }}
    >
      <select
        value={slug}
        onChange={(e) => elegirSabor(e.target.value)}
        disabled={!listo}
        aria-label={`Sabor de ${titulo.toLowerCase()}`}
        style={selectStyle}
      >
        {sabores.map((s) => (
          <option key={s.slug} value={s.slug} disabled={!comprable(s)}>
            {s.name}
            {s.agotado ? " — agotado hoy" : s.consultar ? " — consultar" : ""}
          </option>
        ))}
      </select>

      {sabor.especialidad && (
        <p className="especialidad" style={{ margin: 0 }}>
          {sabor.especialidad}
        </p>
      )}

      {sabor.variants.length > 1 && (
        <select
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          disabled={!listo}
          aria-label={`Tamaño de ${nombre}`}
          style={selectStyle}
        >
          {sabor.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.5rem",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "1.25rem",
            fontWeight: 600,
            margin: 0,
          }}
        >
          {precio !== null && precioAntes !== undefined && (
            <s style={{ fontSize: "0.7em", fontWeight: 400, color: "var(--color-ink-muted)", marginRight: "0.4em" }}>
              <span className="sr-only">Antes </span>
              {formatPriceCents(precioAntes)}
            </s>
          )}
          {precio === null ? "Consultar" : formatPriceCents(precio)}
          {sabor.unit && sabor.variants.length <= 1 && (
            <span
              style={{
                fontSize: 12,
                color: "var(--color-ink-muted)",
                fontWeight: 400,
              }}
            >
              {" "}
              / {sabor.unit}
            </span>
          )}
        </p>
        {comprable(sabor) ? (
          <button
            type="button"
            onClick={onAdd}
            disabled={!listo}
            style={{
              background: "var(--color-caramelo)",
              color: "var(--color-leche)",
              border: "none",
              padding: "0.5rem 1rem",
              borderRadius: 0,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Añadir
          </button>
        ) : (
          <span className="numeracion">Agotado hoy</span>
        )}
      </div>
    </div>
  );
}
