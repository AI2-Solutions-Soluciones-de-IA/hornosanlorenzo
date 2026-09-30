import { useEffect, useRef, useState } from "react";
import { addItem } from "~/lib/cart";
import { emitToast } from "~/islands/ToastHost";
import { formatPriceCents } from "~/lib/format";
import {
  detallePack,
  faltaParaAnadir,
  type PiezaPedido,
} from "~/lib/pack-pedido";
import { subirFotoPedido } from "~/lib/storage/subir-foto";

type Props = {
  slug: string;
  name: string;
  priceCents: number;
  /**
   * Todas las piezas en el orden de la ficha: los huecos con sus opciones ya
   * filtradas en servidor y las fijas con su texto. Una sola lista (y no
   * huecos y fijas por separado) porque el desglose del carrito va en ese
   * orden.
   */
  piezas: PiezaPedido[];
  conFoto: boolean;
  agotado: boolean;
};

// Copia de `TIPOS_FOTO` y `MAX_BYTES_FOTO` de `~/lib/storage/fotos-pedido.ts`,
// que es quien manda (el token de subida los impone). No se importan de allí
// porque ese módulo arrastra el código de servidor de `@vercel/blob` al
// navegador. Aquí solo sirven para avisar antes de subir.
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES_FOTO = 20 * 1024 * 1024;
/** Por debajo de esto en el lado corto, la foto impresa sale blanda. */
const LADO_MINIMO = 1200;

type Foto =
  | { estado: "vacia" }
  | { estado: "subiendo" }
  | { estado: "lista"; url: string; vista: string; pequena: boolean }
  | { estado: "error"; mensaje: string };

const selectStyle: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  width: "100%",
  minHeight: 44,
  padding: "0 2rem 0 0.75rem",
  border: "1px solid var(--color-line)",
  borderRadius: 0,
  background:
    "var(--color-leche) url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='8' viewBox='0 0 12 12' fill='none' stroke='%23322820' stroke-width='1.6'%3E%3Cpath d='m2 4.5 4 3.5 4-3.5'/%3E%3C/svg%3E\") no-repeat right 0.75rem center",
  color: "var(--color-ink)",
  font: "inherit",
  fontSize: 14,
  cursor: "pointer",
};

const etiquetaStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: "var(--color-ink-muted)",
  fontWeight: 600,
  marginBottom: 6,
};

const avisoStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--color-ink-muted)",
  margin: 0,
};

/** Lado corto en píxeles, o null si el navegador no sabe decodificarla. */
async function ladoCorto(fichero: File): Promise<number | null> {
  try {
    const bitmap = await createImageBitmap(fichero);
    const lado = Math.min(bitmap.width, bitmap.height);
    bitmap.close();
    return lado;
  } catch {
    return null;
  }
}

/**
 * El pedido de un pack: un desplegable por hueco, la foto si el pack la
 * lleva, la cantidad y «Añadir al carrito». El navegador solo manda slugs,
 * elecciones y la URL de la foto: el precio lo vuelve a calcular el servidor
 * al pagar, y es él quien rechaza un pack incompleto.
 */
export default function PackPedido({
  slug,
  name,
  priceCents,
  piezas,
  conFoto,
  agotado,
}: Props) {
  // Mismo motivo que en `ElegirSabor`: hasta hidratar, lo que se elija en el
  // HTML suelto lo pisaría React al montar.
  const [listo, setListo] = useState(false);
  useEffect(() => setListo(true), []);

  const [elegidos, setElegidos] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [foto, setFoto] = useState<Foto>({ estado: "vacia" });
  const inputFoto = useRef<HTMLInputElement>(null);
  // Si eligen otra foto mientras sube la primera, la respuesta que llegue
  // tarde no puede pisar a la nueva.
  const turno = useRef(0);

  // La miniatura es un `blob:` local: se suelta al cambiarla o al salir.
  const vista = foto.estado === "lista" ? foto.vista : null;
  useEffect(() => {
    if (!vista) return;
    return () => URL.revokeObjectURL(vista);
  }, [vista]);

  async function elegirFoto(fichero: File | undefined) {
    const mio = ++turno.current;
    if (!fichero) {
      setFoto({ estado: "vacia" });
      return;
    }
    if (!TIPOS_FOTO.includes(fichero.type)) {
      setFoto({
        estado: "error",
        mensaje: "La foto tiene que ser JPG, PNG o WebP.",
      });
      return;
    }
    if (fichero.size > MAX_BYTES_FOTO) {
      setFoto({
        estado: "error",
        mensaje: "La foto pesa más de 20 MB. Prueba con otra.",
      });
      return;
    }
    setFoto({ estado: "subiendo" });
    try {
      const [lado, url] = await Promise.all([
        ladoCorto(fichero),
        subirFotoPedido(fichero),
      ]);
      if (mio !== turno.current) return;
      setFoto({
        estado: "lista",
        url,
        vista: URL.createObjectURL(fichero),
        pequena: lado !== null && lado < LADO_MINIMO,
      });
    } catch (error) {
      if (mio !== turno.current) return;
      console.error("No se pudo subir la foto:", error);
      setFoto({
        estado: "error",
        mensaje:
          "No hemos podido subir la foto. Vuelve a elegirla o prueba con otra.",
      });
    }
  }

  const fotoUrl = foto.estado === "lista" ? foto.url : null;
  const falta = faltaParaAnadir(piezas, elegidos, {
    exigida: conFoto,
    url: fotoUrl,
  });
  const puede = listo && !agotado && falta === null;

  function onAdd() {
    const detalle = detallePack(piezas, elegidos);
    if (!puede || !detalle) return;
    addItem({
      slug,
      name,
      opciones: elegidos,
      fotoUrl: fotoUrl ?? undefined,
      detalle,
      unitPriceCents: priceCents,
      qty,
    });
    emitToast(`Añadido — ${name}`);
    // Otro pack llevará otra foto: se limpia. Las elecciones se quedan.
    if (conFoto) {
      turno.current++;
      setFoto({ estado: "vacia" });
      if (inputFoto.current) inputFoto.current.value = "";
    }
  }

  if (agotado) {
    return (
      <button type="button" disabled style={botonStyle(false)}>
        No disponible ahora mismo
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {piezas.map((p) =>
        p.tipo === "eleccion" ? (
          <div key={p.id}>
            <label htmlFor={`hueco-${p.id}`} style={etiquetaStyle}>
              {p.etiqueta}
            </label>
            <select
              id={`hueco-${p.id}`}
              value={elegidos[p.id] ?? ""}
              onChange={(e) =>
                setElegidos((prev) => ({ ...prev, [p.id]: e.target.value }))
              }
              disabled={!listo}
              style={selectStyle}
            >
              <option value="" disabled>
                Elige…
              </option>
              {p.opciones.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        ) : null,
      )}

      {conFoto && (
        <div>
          <label htmlFor="foto-pack" style={etiquetaStyle}>
            Tu foto para la plancha
          </label>
          <p style={{ ...avisoStyle, marginBottom: 8 }}>
            Sube la foto en la mejor calidad que tengas: se imprime tal y como
            nos llega.
          </p>
          <input
            ref={inputFoto}
            id="foto-pack"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={!listo || foto.estado === "subiendo"}
            onChange={(e) => elegirFoto(e.target.files?.[0])}
            style={{ font: "inherit", fontSize: 13, maxWidth: "100%" }}
          />
          <div aria-live="polite" style={{ marginTop: 8 }}>
            {foto.estado === "subiendo" && <p style={avisoStyle}>Subiendo…</p>}
            {foto.estado === "error" && (
              <p style={{ ...avisoStyle, color: "var(--color-ink)" }}>
                {foto.mensaje}
              </p>
            )}
            {foto.estado === "lista" && (
              <div
                style={{ display: "flex", gap: 12, alignItems: "flex-start" }}
              >
                <img
                  src={foto.vista}
                  alt="Tu foto, tal y como se ha subido"
                  width={72}
                  height={72}
                  style={{
                    width: 72,
                    height: 72,
                    objectFit: "cover",
                    border: "1px solid var(--color-line)",
                  }}
                />
                <p style={avisoStyle}>
                  Foto subida.
                  {foto.pequena && (
                    <>
                      <br />
                      Esta foto es pequeña y puede salir borrosa al imprimirla.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <span style={{ ...etiquetaStyle, marginBottom: 0 }} id="qty-pack">
          Cantidad
        </span>
        <div
          role="group"
          aria-labelledby="qty-pack"
          style={{
            display: "inline-flex",
            alignItems: "center",
            border: "1px solid var(--color-line)",
          }}
        >
          <button
            type="button"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Reducir cantidad"
            style={pasoStyle}
          >
            −
          </button>
          <span
            aria-live="polite"
            style={{ minWidth: 28, textAlign: "center", fontWeight: 600 }}
          >
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((q) => Math.min(10, q + 1))}
            aria-label="Aumentar cantidad"
            style={pasoStyle}
          >
            +
          </button>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={onAdd}
          disabled={!puede}
          style={botonStyle(puede)}
        >
          Añadir al carrito · {formatPriceCents(priceCents * qty)}
        </button>
        {listo && falta && (
          <p style={{ ...avisoStyle, marginTop: 8 }}>{falta}</p>
        )}
      </div>
    </div>
  );
}

const pasoStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  width: 40,
  height: 40,
  cursor: "pointer",
  fontSize: 16,
  color: "var(--color-ink)",
};

function botonStyle(activo: boolean): React.CSSProperties {
  return {
    width: "100%",
    background: activo ? "var(--color-caramelo)" : "var(--color-latte)",
    color: activo ? "var(--color-leche)" : "var(--color-ink-muted)",
    border: activo ? "none" : "1px solid var(--color-avellana)",
    padding: "0.875rem 1.5rem",
    borderRadius: 0,
    fontSize: 15,
    fontWeight: 700,
    cursor: activo ? "pointer" : "not-allowed",
  };
}
