import { useMemo, useState } from "react";

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
};

type Producto = { id: string; name: string };

type Props = { seccionesIniciales: Seccion[]; productos: Producto[] };

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
const VACIA: Omit<Seccion, "id"> = { titulo: "", descripcion: "", orden: 0, publicada: true, productoIds: [] };

/** Sin acentos ni mayúsculas, para buscar «gluten» y encontrar «Glutén». */
const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function AdminSeccionesEsteMes({ seccionesIniciales, productos }: Props) {
  const [secciones, setSecciones] = useState(seccionesIniciales);
  const [editando, setEditando] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Omit<Seccion, "id">>(VACIA);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const nombre = useMemo(() => new Map(productos.map((p) => [p.id, p.name])), [productos]);
  const resultados = useMemo(() => {
    const q = normal(busqueda.trim());
    if (q.length < 2) return [];
    return productos
      .filter((p) => !form.productoIds.includes(p.id) && normal(p.name).includes(q))
      .slice(0, 8);
  }, [busqueda, productos, form.productoIds]);

  function abrir(s?: Seccion) {
    setForm(s ? { ...s } : { ...VACIA, orden: secciones.length });
    setEditando(s?.id ?? null);
    setBusqueda("");
    setError(null);
    setMensaje(null);
    setAbierto(true);
  }

  const mueve = (i: number, d: -1 | 1) =>
    setForm((f) => {
      const ids = [...f.productoIds];
      const j = i + d;
      if (j < 0 || j >= ids.length) return f;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return { ...f, productoIds: ids };
    });

  async function llamar(method: "POST" | "PUT" | "DELETE", body: Record<string, unknown>) {
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
    setGuardando(true);
    const r = editando
      ? await llamar("PUT", { id: editando, ...form })
      : await llamar("POST", form);
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
        Aparecen en Este mes debajo de las ofertas, en el orden que pongas. Por ejemplo, «Productos nuevos sin gluten».
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
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
            {secciones.map((s) => (
              <li key={s.id} style={{ border: "1px solid var(--color-avellana)", padding: "0.75rem 1rem", marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
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

          <div style={{ marginTop: 16, display: "flex", gap: 24, alignItems: "flex-end" }}>
            <div>
              <label style={label} htmlFor="sm-orden">Orden</label>
              <input id="sm-orden" type="number" value={form.orden} onChange={(e) => setForm({ ...form, orden: Number(e.target.value) || 0 })} style={{ ...field, maxWidth: 110 }} />
            </div>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, paddingBottom: 12 }}>
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
              {form.productoIds.map((id, i) => (
                <li key={id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--color-line)", fontSize: 14 }}>
                  <span style={{ flex: 1 }}>{nombre.get(id) ?? "(producto desactivado)"}</span>
                  <button type="button" aria-label="Subir" onClick={() => mueve(i, -1)} disabled={i === 0} style={enlace}>↑</button>
                  <button type="button" aria-label="Bajar" onClick={() => mueve(i, 1)} disabled={i === form.productoIds.length - 1} style={enlace}>↓</button>
                  <button type="button" onClick={() => setForm({ ...form, productoIds: form.productoIds.filter((x) => x !== id) })} style={{ ...enlace, color: "var(--color-teja)" }}>
                    Quitar
                  </button>
                </li>
              ))}
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
