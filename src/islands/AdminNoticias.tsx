import { useState } from "react";
import { formatDate, formatPriceCents } from "~/lib/format";
import { eurosACentimos } from "~/lib/euros";

/**
 * Misma forma que `Noticia` de `~/lib/db/noticias`, redefinida aquí en vez
 * de importada: ese módulo arrastra `~/lib/db/pool` (Postgres), que no
 * tiene sentido meter en el bundle de una isla de cliente. Mismo patrón que
 * `CheckoutFlow.tsx` con `Direccion`.
 */
export type Noticia = {
  id: string;
  slug: string;
  titulo: string;
  excerpt: string;
  cuerpo: string;
  fecha: string;
  imageUrl: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  tags: string[];
  publicada: boolean;
  productoId: string | null;
  /** Lo que devuelve el servidor del producto enlazado; aquí solo se enseña el nombre. */
  producto: { slug: string; name: string } | null;
  ofertaCents: number | null;
  ofertaVariantes: Record<string, number>;
  ofertaHasta: string | null;
  /**
   * Cuándo se mandó a los suscritos a las ofertas; `null` = no se ha mandado.
   * Llega como `Date` desde la página (Astro la serializa) y como texto
   * desde la API: `new Date()` vale para los dos.
   */
  enviadaEn: string | Date | null;
};

/**
 * Lo justo para el desplegable «Producto de la carta» y para la oferta:
 * el precio de siempre de la ficha (y de cada tamaño) va al lado de la
 * casilla del precio de oferta.
 */
export type ProductoOpcion = {
  id: string;
  name: string;
  priceCents: number | null;
  consultar: boolean;
  variantes: { variantId: string; label: string; priceCents: number }[];
  /** La foto de la ficha, para poder ponerla en la noticia con un clic. */
  foto?: { url: string; ancho: number; alto: number; alt: string } | null;
};

type Props = {
  noticiasIniciales: Noticia[];
  productos: ProductoOpcion[];
};

// Mismos tokens y patrón de campo/error que `CuentaDirecciones.tsx`: nada
// nuevo aquí, solo se reutiliza lo que ya fija el panel para campos,
// errores y botones. El manual de marca prohíbe esquinas redondeadas y
// sombras, de ahí el `borderRadius: 0` explícito.
const label: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.18em",
  color: "var(--color-ink-muted)",
  fontWeight: 500,
};

const field: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "0.75rem 1rem",
  border: "1px solid var(--color-avellana)",
  borderRadius: 0,
  fontSize: 14,
  fontFamily: "inherit",
  background: "var(--color-leche)",
  marginTop: 8,
};

const MENSAJE_GENERICO = "Algo ha fallado. Inténtalo de nuevo.";

/** Fecha de hoy en formato `YYYY-MM-DD`, para precargar el formulario. */
function hoyISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

type FormularioNoticia = {
  titulo: string;
  fecha: string;
  excerpt: string;
  cuerpo: string;
  tagsTexto: string;
  imageUrl: string | null;
  imageAlt: string;
  imageWidth: number | null;
  imageHeight: number | null;
  publicada: boolean;
  /** `""` es «ninguno»: un `<select>` no sabe de `null`. */
  productoId: string;
  /** Precio de oferta en euros, tal como se escribe; `""` = sin oferta. */
  ofertaEuros: string;
  /** Lo mismo por tamaño (`variantId` → euros). */
  ofertaVariantesEuros: Record<string, string>;
  /** `""` = mientras esté publicada. */
  ofertaHasta: string;
};

const FORMULARIO_VACIO: FormularioNoticia = {
  titulo: "",
  fecha: hoyISO(),
  excerpt: "",
  cuerpo: "",
  tagsTexto: "",
  imageUrl: null,
  imageAlt: "",
  imageWidth: null,
  imageHeight: null,
  publicada: false,
  productoId: "",
  ofertaEuros: "",
  ofertaVariantesEuros: {},
  ofertaHasta: "",
};

const aEuros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function formularioDesdeNoticia(n: Noticia): FormularioNoticia {
  return {
    titulo: n.titulo,
    fecha: n.fecha,
    excerpt: n.excerpt,
    cuerpo: n.cuerpo,
    tagsTexto: n.tags.join(", "),
    imageUrl: n.imageUrl,
    imageAlt: n.imageAlt ?? "",
    imageWidth: n.imageWidth,
    imageHeight: n.imageHeight,
    publicada: n.publicada,
    productoId: n.productoId ?? "",
    ofertaEuros: n.ofertaCents === null ? "" : aEuros(n.ofertaCents),
    ofertaVariantesEuros: Object.fromEntries(
      Object.entries(n.ofertaVariantes ?? {}).map(([id, c]) => [id, aEuros(c)]),
    ),
    ofertaHasta: n.ofertaHasta ?? "",
  };
}

/**
 * Pasa la oferta del formulario a céntimos. Devuelve un mensaje si algún
 * precio no se entiende; que rebaje de verdad lo comprueba el servidor.
 */
function ofertaDelFormulario(
  f: FormularioNoticia,
  producto: ProductoOpcion | undefined,
):
  | { error: string }
  | { ofertaCents: number | null; ofertaVariantes: Record<string, number>; ofertaHasta: string | null } {
  const vacia = { ofertaCents: null, ofertaVariantes: {}, ofertaHasta: null };
  if (!producto) return vacia;
  if (producto.variantes.length > 0) {
    const ofertaVariantes: Record<string, number> = {};
    for (const v of producto.variantes) {
      const texto = f.ofertaVariantesEuros[v.variantId]?.trim() ?? "";
      if (!texto) continue;
      const c = eurosACentimos(texto);
      if (c === null || c <= 0) return { error: `El precio de oferta de «${v.label}» no se entiende.` };
      ofertaVariantes[v.variantId] = c;
    }
    const hay = Object.keys(ofertaVariantes).length > 0;
    return { ofertaCents: null, ofertaVariantes, ofertaHasta: hay ? f.ofertaHasta || null : null };
  }
  if (!f.ofertaEuros.trim()) return vacia;
  const c = eurosACentimos(f.ofertaEuros);
  if (c === null || c <= 0) return { error: "El precio de oferta no se entiende." };
  return { ofertaCents: c, ofertaVariantes: {}, ofertaHasta: f.ofertaHasta || null };
}

async function llamarNoticias(
  method: "POST" | "PUT" | "DELETE",
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; noticia?: Noticia }> {
  try {
    const respuesta = await fetch("/api/admin/noticias", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      return { ok: false, error: cuerpo?.error ?? MENSAJE_GENERICO };
    }
    return { ok: true, noticia: cuerpo?.noticia };
  } catch {
    return {
      ok: false,
      error: "No hemos podido conectar. Comprueba tu conexión.",
    };
  }
}

export default function AdminNoticias({ noticiasIniciales, productos }: Props) {
  const [noticias, setNoticias] = useState(noticiasIniciales);
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formulario, setFormulario] =
    useState<FormularioNoticia>(FORMULARIO_VACIO);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [ocupada, setOcupada] = useState<string | null>(null);

  function abrirNueva() {
    setFormulario(FORMULARIO_VACIO);
    setEditandoId(null);
    setErrorServidor(null);
    setMensaje(null);
    setAbierto(true);
  }

  function abrirEditar(n: Noticia) {
    setFormulario(formularioDesdeNoticia(n));
    setEditandoId(n.id);
    setErrorServidor(null);
    setMensaje(null);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    setEditandoId(null);
  }

  /** Pone en la noticia la foto (y su texto alternativo) del producto elegido. */
  function usarFotoDe(producto: ProductoOpcion | undefined) {
    const foto = producto?.foto;
    if (!foto) return;
    setFormulario((actual) => ({
      ...actual,
      imageUrl: foto.url,
      imageWidth: foto.ancho,
      imageHeight: foto.alto,
      imageAlt: foto.alt,
    }));
  }

  function actualizaCampo<K extends keyof FormularioNoticia>(
    campo: K,
    valor: FormularioNoticia[K],
  ) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichero = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo fichero
    if (!fichero) return;

    setErrorServidor(null);
    setSubiendoFoto(true);

    const cuerpo = new FormData();
    cuerpo.append("foto", fichero);
    cuerpo.append("carpeta", "noticias");

    try {
      const respuesta = await fetch("/api/admin/imagen", {
        method: "POST",
        body: cuerpo,
      });
      const datos = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setErrorServidor(datos?.error ?? MENSAJE_GENERICO);
      } else {
        setFormulario((actual) => ({
          ...actual,
          imageUrl: datos.url,
          imageWidth: datos.ancho,
          imageHeight: datos.alto,
        }));
      }
    } catch {
      setErrorServidor("No hemos podido conectar. Comprueba tu conexión.");
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Mientras la foto sube, guardar dejaría la noticia sin ella: la subida
    // manda la URL final al estado, y hasta que no llega no hay nada que
    // enviar todavía.
    if (guardando || subiendoFoto) return;

    setErrorServidor(null);
    setMensaje(null);

    const oferta = ofertaDelFormulario(
      formulario,
      productos.find((p) => p.id === formulario.productoId),
    );
    if ("error" in oferta) {
      setErrorServidor(oferta.error);
      return;
    }
    setGuardando(true);

    const datos = {
      titulo: formulario.titulo.trim(),
      excerpt: formulario.excerpt.trim(),
      cuerpo: formulario.cuerpo,
      fecha: formulario.fecha,
      imageUrl: formulario.imageUrl,
      imageAlt: formulario.imageAlt.trim() || null,
      imageWidth: formulario.imageWidth,
      imageHeight: formulario.imageHeight,
      tags: formulario.tagsTexto
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      publicada: formulario.publicada,
      productoId: formulario.productoId || null,
      ...oferta,
    };

    const resultado = editandoId
      ? await llamarNoticias("PUT", { id: editandoId, ...datos })
      : await llamarNoticias("POST", datos);

    setGuardando(false);
    if (!resultado.ok || !resultado.noticia) {
      setErrorServidor(resultado.error ?? MENSAJE_GENERICO);
      return;
    }

    // Se refresca la lista con lo que ha devuelto el servidor —el `slug` y
    // el `id` los decide él— y no con lo que tenía el formulario.
    const guardada = resultado.noticia;
    setNoticias((actuales) =>
      actuales.some((n) => n.id === guardada.id)
        ? actuales.map((n) => (n.id === guardada.id ? guardada : n))
        : [guardada, ...actuales],
    );
    setMensaje("Guardado. En la web se ve en unos segundos.");
    cerrar();
  }

  /** Manda la noticia publicada a los suscritos a las ofertas (una sola vez). */
  async function onEnviar(n: Noticia) {
    if (ocupada) return;
    if (
      !window.confirm(
        `¿Enviar «${n.titulo}» por correo a todos los suscritos a las ofertas? Solo se puede enviar una vez.`,
      )
    )
      return;

    setErrorServidor(null);
    setMensaje(null);
    setOcupada(n.id);
    try {
      const r = await fetch("/api/admin/noticias/enviar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: n.id }),
      });
      const datos = await r.json().catch(() => null);
      if (!r.ok) {
        setErrorServidor(datos?.error ?? MENSAJE_GENERICO);
        return;
      }
      setNoticias((actuales) =>
        actuales.map((x) => (x.id === n.id ? { ...x, enviadaEn: new Date().toISOString() } : x)),
      );
      setMensaje(datos?.aviso ?? `Enviada a ${datos?.enviados} suscritos.`);
    } catch {
      setErrorServidor("No hemos podido conectar. Comprueba tu conexión.");
    } finally {
      setOcupada(null);
    }
  }

  async function onBorrar(n: Noticia) {
    if (ocupada) return;
    if (!window.confirm(`¿Borrar «${n.titulo}»? No se puede deshacer.`)) return;

    setErrorServidor(null);
    setMensaje(null);
    setOcupada(n.id);

    const resultado = await llamarNoticias("DELETE", { id: n.id });

    setOcupada(null);
    if (!resultado.ok) {
      setErrorServidor(resultado.error ?? MENSAJE_GENERICO);
      return;
    }

    setNoticias((actuales) => actuales.filter((x) => x.id !== n.id));
    if (editandoId === n.id) cerrar();
  }

  return (
    <div style={{ maxWidth: "40rem" }}>
      {mensaje && (
        <p
          role="status"
          style={{
            marginBottom: 16,
            padding: "0.75rem 1rem",
            border: "1px solid var(--color-avellana)",
            background: "var(--color-latte)",
            fontSize: 13,
          }}
        >
          {mensaje}
        </p>
      )}

      {/* Los errores de la lista (enviar, borrar): el del formulario va
          dentro del formulario, y con él cerrado no se veía nada. */}
      {!abierto && errorServidor && (
        <p
          role="alert"
          style={{
            marginBottom: 16,
            padding: "0.75rem 1rem",
            border: "1px solid var(--color-teja)",
            color: "var(--color-teja)",
            fontSize: 13,
          }}
        >
          {errorServidor}
        </p>
      )}

      {!abierto && (
        <button
          type="button"
          className="btn btn-primario"
          onClick={abrirNueva}
          style={{ border: "none" }}
        >
          Escribir una noticia
        </button>
      )}

      {!abierto && noticias.length === 0 && (
        <p style={{ marginTop: 16, color: "var(--color-ink-muted)" }}>
          Todavía no hay ninguna noticia escrita.
        </p>
      )}

      {!abierto && noticias.length > 0 && (
        <ul style={{ listStyle: "none", padding: 0, margin: "20px 0 0" }}>
          {noticias.map((n) => (
            <li
              key={n.id}
              style={{
                border: "1px solid var(--color-avellana)",
                padding: "0.75rem 1rem",
                marginTop: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <button
                type="button"
                onClick={() => abrirEditar(n)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  flex: 1,
                }}
              >
                <p className="numeracion">
                  {n.publicada ? "Publicada" : "Borrador"} ·{" "}
                  {formatDate(new Date(`${n.fecha}T00:00:00`))}
                </p>
                <p style={{ marginTop: 4, fontWeight: 600 }}>{n.titulo}</p>
                {n.producto && (
                  <p className="numeracion" style={{ marginTop: 4 }}>
                    Con producto: {n.producto.name}
                  </p>
                )}
              </button>
              {n.publicada &&
                (n.enviadaEn ? (
                  <span className="numeracion" style={{ whiteSpace: "nowrap" }}>
                    Enviada el {formatDate(new Date(n.enviadaEn))}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => onEnviar(n)}
                    disabled={ocupada === n.id}
                    style={{
                      background: "none",
                      border: "1px solid var(--color-avellana)",
                      padding: "0.4rem 0.75rem",
                      fontSize: 13,
                      cursor: ocupada === n.id ? "not-allowed" : "pointer",
                      opacity: ocupada === n.id ? 0.6 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {ocupada === n.id ? "Enviando…" : "Enviar a los suscritos"}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => onBorrar(n)}
                disabled={ocupada === n.id}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  fontSize: 13,
                  textDecoration: "underline",
                  color: "var(--color-teja)",
                  cursor: ocupada === n.id ? "not-allowed" : "pointer",
                  opacity: ocupada === n.id ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}

      {abierto && (
        <form onSubmit={onSubmit} noValidate>
          <div>
            <label style={label} htmlFor="an-titulo">
              Título
            </label>
            <input
              id="an-titulo"
              value={formulario.titulo}
              onChange={(e) => actualizaCampo("titulo", e.target.value)}
              required
              minLength={3}
              maxLength={140}
              style={field}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor="an-fecha">
              Fecha
            </label>
            <input
              id="an-fecha"
              type="date"
              value={formulario.fecha}
              onChange={(e) => actualizaCampo("fecha", e.target.value)}
              required
              style={field}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor="an-excerpt">
              Entradilla ({formulario.excerpt.length}/240)
            </label>
            <textarea
              id="an-excerpt"
              value={formulario.excerpt}
              onChange={(e) =>
                actualizaCampo("excerpt", e.target.value.slice(0, 240))
              }
              required
              minLength={10}
              maxLength={240}
              rows={2}
              style={{ ...field, resize: "vertical" }}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor="an-cuerpo">
              Cuerpo (Markdown)
            </label>
            <textarea
              id="an-cuerpo"
              value={formulario.cuerpo}
              onChange={(e) => actualizaCampo("cuerpo", e.target.value)}
              rows={10}
              style={{ ...field, resize: "vertical", fontFamily: "monospace" }}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor="an-tags">
              Etiquetas (separadas por comas)
            </label>
            <input
              id="an-tags"
              value={formulario.tagsTexto}
              onChange={(e) => actualizaCampo("tagsTexto", e.target.value)}
              placeholder="roscón, temporada, obrador"
              style={field}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor="an-producto">
              Producto de la carta (se podrá añadir al carrito desde la noticia)
            </label>
            {/* Solo fichas activas: enlazar una desactivada dejaría la
                noticia sin botón sin que nadie se diera cuenta. Si la
                noticia ya apuntaba a una que después se desactivó, se
                mantiene como opción para no perder el enlace al guardar. */}
            <select
              id="an-producto"
              value={formulario.productoId}
              onChange={(e) => {
                actualizaCampo("productoId", e.target.value);
                // Sin foto todavía, se pone la del producto: casi siempre es
                // la que se quiere, y se puede cambiar abajo.
                if (!formulario.imageUrl) usarFotoDe(productos.find((p) => p.id === e.target.value));
              }}
              style={field}
            >
              <option value="">Ninguno: solo texto</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {formulario.productoId &&
                !productos.some((p) => p.id === formulario.productoId) && (
                  <option value={formulario.productoId}>
                    (producto desactivado: se conserva el enlace)
                  </option>
                )}
            </select>
          </div>

          {(() => {
            const producto = productos.find((p) => p.id === formulario.productoId);
            if (!producto) return null;
            if (producto.consultar || producto.priceCents === null)
              return (
                <p style={{ marginTop: 8, fontSize: 13, color: "var(--color-ink-muted)" }}>
                  Este producto se vende a consultar: no admite precio de oferta.
                </p>
              );
            return (
              <fieldset
                style={{
                  marginTop: 16,
                  border: "1px solid var(--color-avellana)",
                  padding: "12px 16px 16px",
                }}
              >
                <legend style={{ ...label, padding: "0 6px" }}>Precio de oferta (opcional)</legend>
                <p style={{ fontSize: 13, color: "var(--color-ink-muted)", margin: "0 0 4px" }}>
                  Vale en toda la web mientras la noticia esté publicada. En la carta se ve el
                  precio de siempre tachado. Déjalo vacío para venderlo al precio normal.
                </p>
                {producto.variantes.length > 0 ? (
                  producto.variantes.map((v) => (
                    <div key={v.variantId} style={{ marginTop: 12 }}>
                      <label style={label} htmlFor={`an-oferta-${v.variantId}`}>
                        {v.label} · de siempre {formatPriceCents(v.priceCents)}
                      </label>
                      <input
                        id={`an-oferta-${v.variantId}`}
                        inputMode="decimal"
                        placeholder="Sin oferta"
                        value={formulario.ofertaVariantesEuros[v.variantId] ?? ""}
                        onChange={(e) =>
                          actualizaCampo("ofertaVariantesEuros", {
                            ...formulario.ofertaVariantesEuros,
                            [v.variantId]: e.target.value,
                          })
                        }
                        style={{ ...field, maxWidth: 200 }}
                      />
                    </div>
                  ))
                ) : (
                  <div style={{ marginTop: 12 }}>
                    <label style={label} htmlFor="an-oferta">
                      Precio de oferta · de siempre {formatPriceCents(producto.priceCents)}
                    </label>
                    <input
                      id="an-oferta"
                      inputMode="decimal"
                      placeholder="Sin oferta"
                      value={formulario.ofertaEuros}
                      onChange={(e) => actualizaCampo("ofertaEuros", e.target.value)}
                      style={{ ...field, maxWidth: 200 }}
                    />
                  </div>
                )}
                <div style={{ marginTop: 12 }}>
                  <label style={label} htmlFor="an-oferta-hasta">
                    Válida hasta (incluido; vacío = mientras esté publicada)
                  </label>
                  <input
                    id="an-oferta-hasta"
                    type="date"
                    value={formulario.ofertaHasta}
                    onChange={(e) => actualizaCampo("ofertaHasta", e.target.value)}
                    style={{ ...field, maxWidth: 200 }}
                  />
                </div>
              </fieldset>
            );
          })()}

          <div style={{ marginTop: 16 }}>
            <p style={label}>Foto</p>
            {/* El `<input type="file">` nativo es un texto gris que no parece
                un control: el obrador no veía dónde pinchar. Se queda en el
                DOM para el teclado y el lector de pantalla, pero oculto, y lo
                que se ve es la etiqueta vestida de botón, que abre el mismo
                selector al pincharla. */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginTop: 8,
                flexWrap: "wrap",
              }}
            >
              {formulario.imageUrl && !subiendoFoto && (
                <img
                  src={formulario.imageUrl}
                  alt=""
                  style={{ width: 120, height: 90, objectFit: "cover", display: "block" }}
                />
              )}
              <label
                htmlFor="an-foto"
                className="btn btn-secundario"
                style={{
                  cursor: subiendoFoto ? "wait" : "pointer",
                  opacity: subiendoFoto ? 0.6 : 1,
                }}
              >
                {subiendoFoto
                  ? "Subiendo la foto…"
                  : formulario.imageUrl
                    ? "Cambiar foto"
                    : "Elegir foto"}
              </label>
              <input
                id="an-foto"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onFoto}
                disabled={subiendoFoto}
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  opacity: 0,
                  overflow: "hidden",
                  pointerEvents: "none",
                }}
              />
              {(() => {
                const foto = productos.find((p) => p.id === formulario.productoId)?.foto;
                if (!foto || foto.url === formulario.imageUrl || subiendoFoto) return null;
                return (
                  <button
                    type="button"
                    className="btn btn-secundario"
                    onClick={() => usarFotoDe(productos.find((p) => p.id === formulario.productoId))}
                  >
                    Usar la foto del producto
                  </button>
                );
              })()}
              <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                JPG, PNG o WebP
              </span>
            </div>
          </div>

          {formulario.imageUrl && (
            <div style={{ marginTop: 16 }}>
              <label style={label} htmlFor="an-alt">
                Texto alternativo de la foto
              </label>
              <input
                id="an-alt"
                value={formulario.imageAlt}
                onChange={(e) => actualizaCampo("imageAlt", e.target.value)}
                placeholder="Qué se ve en la foto"
                maxLength={200}
                style={field}
              />
            </div>
          )}

          <div
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              id="an-publicada"
              type="checkbox"
              checked={formulario.publicada}
              onChange={(e) => actualizaCampo("publicada", e.target.checked)}
            />
            <label htmlFor="an-publicada" style={{ fontSize: 14 }}>
              Publicada
            </label>
          </div>

          {errorServidor && (
            <p
              role="alert"
              style={{
                marginTop: 16,
                padding: "0.75rem 1rem",
                border: "1px solid var(--color-teja)",
                color: "var(--color-teja)",
                fontSize: 13,
              }}
            >
              {errorServidor}
            </p>
          )}

          <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
            <button
              type="submit"
              className="btn btn-primario"
              disabled={guardando || subiendoFoto}
              style={{
                border: "none",
                opacity: guardando || subiendoFoto ? 0.6 : 1,
                cursor: guardando || subiendoFoto ? "not-allowed" : "pointer",
              }}
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={cerrar}
              disabled={guardando}
              style={{
                background: "none",
                border: "1px solid var(--color-avellana)",
                padding: "0.75rem 1.25rem",
                fontSize: 14,
                cursor: guardando ? "not-allowed" : "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
