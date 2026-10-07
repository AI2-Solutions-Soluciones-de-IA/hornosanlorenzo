import { useMemo, useState } from "react";
import { formatPriceCents } from "~/lib/format";
import { eurosACentimos } from "~/lib/euros";
import type { ProductoOpcion } from "~/islands/AdminNoticias.tsx";

/**
 * Secciones de Este mes («Productos nuevos sin gluten»…): título, frase,
 * orden, publicada y productos de la carta. Misma forma que
 * `SeccionEsteMes` de `~/lib/db/seccionesEsteMes`, redefinida aquí para no
 * arrastrar Postgres al navegador (mismo patrón que `AdminNoticias.tsx`).
 */
export type Seccion = {
  id: string;
  titulo: string;
  descripcion: string;
  orden: number;
  publicada: boolean;
  productoIds: string[];
  /** Precio de oferta por id de producto, como en una noticia. */
  ofertas: Record<string, { ofertaCents: number | null; ofertaVariantes: Record<string, number> }>;
  ofertaHasta: string | null;
};

type Props = { seccionesIniciales: Seccion[]; productos: ProductoOpcion[] };

/** Lo que se escribe en el formulario: euros como texto, `""` = sin oferta. */
type OfertaEuros = { euros: string; variantes: Record<string, string> };
type Formulario = Omit<Seccion, "id" | "ofertas" | "ofertaHasta"> & {
  ofertas: Record<string, OfertaEuros>;
  /** `""` = mientras esté publicada. */
  ofertaHasta: string;
};

const aEuros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

function formularioDesde(s: Seccion): Formulario {
  return {
    titulo: s.titulo,
    descripcion: s.descripcion,
    orden: s.orden,
    publicada: s.publicada,
    productoIds: s.productoIds,
    ofertaHasta: s.ofertaHasta ?? "",
    ofertas: Object.fromEntries(
      Object.entries(s.ofertas ?? {}).map(([id, o]) => [
        id,
        {
          euros: o.ofertaCents === null ? "" : aEuros(o.ofertaCents),
          variantes: Object.fromEntries(Object.entries(o.ofertaVariantes).map(([v, c]) => [v, aEuros(c)])),
        },
      ]),
    ),
  };
}

/**
 * Pasa las ofertas del formulario a céntimos, solo las de productos que
 * siguen en la sección. Que rebajen de verdad lo comprueba el servidor.
 */
function ofertasDelFormulario(
  f: Formulario,
  porId: Map<string, ProductoOpcion>,
): { error: string } | { ofertas: Seccion["ofertas"]; ofertaHasta: string | null } {
  const ofertas: Seccion["ofertas"] = {};
  for (const id of f.productoIds) {
    const o = f.ofertas[id];
    const p = porId.get(id);
    if (!o || !p) continue;
    if (p.variantes.length > 0) {
      const ofertaVariantes: Record<string, number> = {};
      for (const v of p.variantes) {
        const texto = o.variantes[v.variantId]?.trim() ?? "";
        if (!texto) continue;
        const c = eurosACentimos(texto);
        if (c === null || c <= 0) return { error: `El precio de oferta de «${p.name}» (${v.label}) no se entiende.` };
        ofertaVariantes[v.variantId] = c;
      }
      if (Object.keys(ofertaVariantes).length > 0) ofertas[id] = { ofertaCents: null, ofertaVariantes };
    } else if (o.euros.trim()) {
      const c = eurosACentimos(o.euros);
      if (c === null || c <= 0) return { error: `El precio de oferta de «${p.name}» no se entiende.` };
      ofertas[id] = { ofertaCents: c, ofertaVariantes: {} };
    }
  }
  const hay = Object.keys(ofertas).length > 0;
  return { ofertas, ofertaHasta: hay ? f.ofertaHasta || null : null };
}

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
const enlace: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  fontSize: 13,
  textDecoration: "underline",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const MENSAJE_GENERICO = "Algo ha fallado. Inténtalo de nuevo.";
// Publicada de serie: una sección nueva casi siempre se crea para verla en
// la web, y desmarcada se quedaba oculta sin que nadie lo notara (7-10-2026).
const VACIA: Formulario = {
  titulo: "",
  descripcion: "",
  orden: 0,
  publicada: true,
  productoIds: [],
  ofertas: {},
  ofertaHasta: "",
};

/** Sin acentos ni mayúsculas, para buscar «gluten» y encontrar «Glutén». */
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function AdminSeccionesEsteMes({ seccionesIniciales, productos }: Props) {
  const [secciones, setSecciones] = useState(seccionesIniciales);
  const [editando, setEditando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Formulario>(VACIA);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const porId = useMemo(() => new Map(productos.map((p) => [p.id, p])), [productos]);
  const resultados = useMemo(() => {
    const q = normal(busqueda.trim());
    if (q.length < 2) return [];
    return productos
      .filter((p) => !form.productoIds.includes(p.id) && normal(p.name).includes(q))
      .slice(0, 8);
  }, [busqueda, productos, form.productoIds]);

  function abrir(s?: Seccion) {
    // Una nueva, la última; luego se mueve arrastrando en la lista.
    setForm(s ? formularioDesde(s) : { ...VACIA, orden: Math.max(0, ...secciones.map((x) => x.orden)) + 1 });
    setEditando(s?.id ?? null);
    setBusqueda("");
    setError(null);
    setMensaje(null);
    setAbierto(true);
  }

  /** La que se está arrastrando para cambiarla de sitio. */
  const [arrastrando, setArrastrando] = useState<string | null>(null);

  /** Guarda el orden nuevo; si el servidor falla, vuelve al de antes con el aviso. */
  async function reordenar(nuevas: Seccion[]) {
    const antes = secciones;
    // `orden` = posición, igual que lo guarda el servidor (empieza en 1).
    setSecciones(nuevas.map((x, i) => ({ ...x, orden: i + 1 })));
    setError(null);
    setMensaje(null);
    const r = await llamar("PATCH", { orden: nuevas.map((x) => x.id) });
    if (!r.ok) {
      setSecciones(antes);
      return setError(r.error);
    }
    setMensaje("Orden guardado. En la web se ve en unos segundos.");
  }

  /** Mueve la sección `id` al sitio de `destino` (arrastrando o con las flechas). */
  function moverSeccion(id: string, destino: number) {
    const desde = secciones.findIndex((x) => x.id === id);
    if (desde < 0 || destino < 0 || destino >= secciones.length || destino === desde) return;
    const nuevas = [...secciones];
    const [x] = nuevas.splice(desde, 1);
    nuevas.splice(destino, 0, x);
    reordenar(nuevas);
  }

  const mueve = (i: number, d: -1 | 1) =>
    setForm((f) => {
      const ids = [...f.productoIds];
      const j = i + d;
      if (j < 0 || j >= ids.length) return f;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...f, productoIds: ids };
    });

  async function llamar(method: "POST" | "PUT" | "DELETE" | "PATCH", body: Record<string, unknown>) {
    try {
      const r = await fetch("/api/admin/secciones-este-mes", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const datos = await r.json().catch(() => null);
      return r.ok ? { ok: true as const, datos } : { ok: false as const, error: datos?.error ?? MENSAJE_GENERICO };
    } catch {
      return { ok: false as const, error: "No hemos podido conectar. Comprueba tu conexión." };
    }
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;
    setError(null);
    const oferta = ofertasDelFormulario(form, porId);
    if ("error" in oferta) return setError(oferta.error);
    setGuardando(true);
    const datos = { ...form, ...oferta };
    const r = editando
      ? await llamar("PUT", { id: editando, ...datos })
      : await llamar("POST", datos);
    setGuardando(false);
    if (!r.ok) return setError(r.error);
    const s: Seccion = r.datos.seccion;
    setSecciones((xs) =>
      (xs.some((x) => x.id === s.id) ? xs.map((x) => (x.id === s.id ? s : x)) : [...xs, s]).sort(
        (a, b) => a.orden - b.orden,
      ),
    );
    setAbierto(false);
    setMensaje("Guardado. En la web se ve en unos segundos.");
  }

  async function borrar(s: Seccion) {
    if (!window.confirm(`¿Borrar la sección «${s.titulo}»? Los productos no se tocan.`)) return;
    setError(null);
    const r = await llamar("DELETE", { id: s.id });
    if (!r.ok) return setError(r.error);
    setSecciones((xs) => xs.filter((x) => x.id !== s.id));
  }

  return (
    <section style={{ maxWidth: "40rem", marginTop: 48, borderTop: "1px solid var(--color-avellana)", paddingTop: 32 }}>
      <h2 className="font-[family-name:var(--font-display)]" style={{ fontSize: 24 }}>
        Secciones con productos
      </h2>
      <p style={{ marginTop: 6, fontSize: 14, color: "var(--color-ink-muted)" }}>
        Aparecen en Este mes debajo de las ofertas, en el orden que pongas. Por ejemplo, «Productos nuevos sin gluten». A cada producto le puedes poner precio de oferta.
      </p>

      {mensaje && (
        <p role="status" style={{ marginTop: 16, padding: "0.75rem 1rem", border: "1px solid var(--color-avellana)", background: "var(--color-latte)", fontSize: 13 }}>
          {mensaje}
        </p>
      )}
      {error && !abierto && (
        <p role="alert" style={{ marginTop: 16, padding: "0.75rem 1rem", border: "1px solid var(--color-teja)", color: "var(--color-teja)", fontSize: 13 }}>
          {error}
        </p>
      )}

      {!abierto && (
        <>
          <button type="button" className="btn btn-secundario" style={{ marginTop: 20 }} onClick={() => abrir()}>
            Nueva sección
          </button>
          {secciones.length > 1 && (
            <p style={{ marginTop: 16, fontSize: 13, color: "var(--color-ink-muted)" }}>
              En la web salen en este orden. Arrástralas por ⠿ o usa las flechas para cambiarlo.
            </p>
          )}
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
            {secciones.map((s, i) => (
              <li
                key={s.id}
                draggable
                onDragStart={(e) => {
                  setArrastrando(s.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  if (arrastrando && arrastrando !== s.id) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (arrastrando) moverSeccion(arrastrando, i);
                  setArrastrando(null);
                }}
                onDragEnd={() => setArrastrando(null)}
                style={{
                  border: "1px solid var(--color-avellana)",
                  padding: "0.75rem 1rem",
                  marginTop: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  background: arrastrando === s.id ? "var(--color-latte)" : undefined,
                  opacity: arrastrando === s.id ? 0.6 : 1,
                }}
              >
                <span aria-hidden="true" title="Arrastra para cambiar el orden" style={{ cursor: "grab", color: "var(--color-ink-muted)", fontSize: 18, userSelect: "none" }}>
                  ⠿
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <button type="button" aria-label={`Subir «${s.titulo}»`} onClick={() => moverSeccion(s.id, i - 1)} disabled={i === 0} style={{ ...enlace, textDecoration: "none", opacity: i === 0 ? 0.3 : 1 }}>
                    ↑
                  </button>
                  <button type="button" aria-label={`Bajar «${s.titulo}»`} onClick={() => moverSeccion(s.id, i + 1)} disabled={i === secciones.length - 1} style={{ ...enlace, textDecoration: "none", opacity: i === secciones.length - 1 ? 0.3 : 1 }}>
                    ↓
                  </button>
                </span>
                <button type="button" onClick={() => abrir(s)} style={{ background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", flex: 1 }}>
                  <p className="numeracion">
                    {s.publicada ? (
                      "Publicada"
                    ) : (
                      <span style={{ color: "var(--color-teja)" }}>Oculta · no se ve en la web</span>
                    )}{" "}
                    · {s.productoIds.length} producto{s.productoIds.length === 1 ? "" : "s"}
                  </p>
                  <p style={{ marginTop: 4, fontWeight: 600 }}>{s.titulo}</p>
                </button>
                <button type="button" onClick={() => borrar(s)} style={{ ...enlace, color: "var(--color-teja)" }}>
                  Borrar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {abierto && (
        <form onSubmit={guardar} style={{ marginTop: 20, border: "1px solid var(--color-avellana)", padding: 20 }}>
          <label style={label} htmlFor="sm-titulo">Título</label>
          <input id="sm-titulo" required minLength={3} maxLength={120} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Productos nuevos sin gluten" style={field} />

          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor="sm-desc">Frase (opcional)</label>
            <input id="sm-desc" maxLength={300} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Recién salidos del obrador, para todos." style={field} />
          </div>

          {/* Sin casilla de orden: se ordena arrastrando en la lista. */}
          <div style={{ marginTop: 16, display: "flex", gap: 24, alignItems: "flex-end" }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
              <input type="checkbox" checked={form.publicada} onChange={(e) => setForm({ ...form, publicada: e.target.checked })} />
              Publicada
            </label>
          </div>

          <div style={{ marginTop: 20 }}>
            <p style={label}>Productos</p>
            {form.productoIds.length === 0 && (
              <p style={{ marginTop: 8, fontSize: 13, color: "var(--color-ink-muted)" }}>
                Busca abajo y añade los productos de la carta.
              </p>
            )}
            <ol style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
              {form.productoIds.map((id, i) => {
                const p = porId.get(id);
                const o = form.ofertas[id] ?? { euros: "", variantes: {} };
                const ponOferta = (cambio: Partial<OfertaEuros>) =>
                  setForm((f) => ({ ...f, ofertas: { ...f.ofertas, [id]: { ...o, ...cambio } } }));
                return (
                  <li key={id} style={{ padding: "8px 0", borderBottom: "1px solid var(--color-line)", fontSize: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ flex: 1 }}>{p?.name ?? "(producto desactivado)"}</span>
                      <button type="button" aria-label="Subir" onClick={() => mueve(i, -1)} disabled={i === 0} style={enlace}>↑</button>
                      <button type="button" aria-label="Bajar" onClick={() => mueve(i, 1)} disabled={i === form.productoIds.length - 1} style={enlace}>↓</button>
                      <button type="button" onClick={() => setForm({ ...form, productoIds: form.productoIds.filter((x) => x !== id) })} style={{ ...enlace, color: "var(--color-teja)" }}>
                        Quitar
                      </button>
                    </div>
                    {/* Precio de oferta, como en «Escribir una noticia»: al lado,
                        el de siempre; vacío = se vende al precio normal. */}
                    {p && (p.consultar || p.priceCents === null ? (
                      <p style={{ marginTop: 4, fontSize: 12, color: "var(--color-ink-muted)" }}>
                        A consultar: no admite precio de oferta.
                      </p>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
                        {(p.variantes.length > 0
                          ? p.variantes.map((v) => ({ clave: v.variantId, texto: v.label, de: v.priceCents }))
                          : [{ clave: "", texto: "Oferta", de: p.priceCents }]
                        ).map((c) => (
                          <label key={c.clave} style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                            {c.texto} · de siempre {formatPriceCents(c.de)}
                            <input
                              inputMode="decimal"
                              placeholder="Sin oferta"
                              value={c.clave ? (o.variantes[c.clave] ?? "") : o.euros}
                              onChange={(e) =>
                                c.clave
                                  ? ponOferta({ variantes: { ...o.variantes, [c.clave]: e.target.value } })
                                  : ponOferta({ euros: e.target.value })
                              }
                              style={{ ...field, marginTop: 4, padding: "0.4rem 0.6rem", width: 130 }}
                            />
                          </label>
                        ))}
                      </div>
                    ))}
                  </li>
                );
              })}
            </ol>
            <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en la carta: «gluten», «tarta»…" aria-label="Buscar productos para añadir" style={{ ...field, marginTop: 12 }} />
            {resultados.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: 0, border: "1px solid var(--color-avellana)", borderTop: "none" }}>
                {resultados.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setForm({ ...form, productoIds: [...form.productoIds, p.id] });
                        setBusqueda("");
                      }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "var(--color-leche)", border: "none", borderTop: "1px solid var(--color-line)", cursor: "pointer", fontSize: 14 }}
                    >
                      + {p.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {form.productoIds.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <label style={label} htmlFor="sm-oferta-hasta">
                Ofertas válidas hasta (incluido; vacío = mientras esté publicada)
              </label>
              <input
                id="sm-oferta-hasta"
                type="date"
                value={form.ofertaHasta}
                onChange={(e) => setForm({ ...form, ofertaHasta: e.target.value })}
                style={{ ...field, maxWidth: 200 }}
              />
              <p style={{ marginTop: 6, fontSize: 12, color: "var(--color-ink-muted)" }}>
                Los precios de oferta valen en toda la web mientras la sección esté publicada. En la carta se
                ve el precio de siempre tachado.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" style={{ marginTop: 16, padding: "0.75rem 1rem", border: "1px solid var(--color-teja)", color: "var(--color-teja)", fontSize: 13 }}>
              {error}
            </p>
          )}

          <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
            <button type="submit" className="btn btn-primario" style={{ border: "none" }} disabled={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            <button type="button" className="btn btn-secundario" onClick={() => setAbierto(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
