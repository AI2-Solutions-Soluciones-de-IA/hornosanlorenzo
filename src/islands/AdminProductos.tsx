import { useMemo, useState } from "react";
import { categories, categoryIds, type CategoryId } from "~/data/categories";
import { secciones, type SeccionId } from "~/data/secciones";
import { formatPriceCents } from "~/lib/format";
import { eurosACentimos } from "~/lib/euros";
import { AVISO_DESACTIVAR } from "~/lib/panel-textos";
import { paginar } from "~/lib/paginacion";
import Paginacion from "~/islands/Paginacion";

/** Fichas por página: con más, la lista ya obliga a un scroll muy largo. */
const POR_PAGINA = 20;

/**
 * Misma forma que `Producto`/`Variante` de `~/lib/db/productos`, redefinida
 * aquí en vez de importada: ese módulo arrastra `~/lib/db/pool` (Postgres),
 * que no tiene sentido meter en el bundle de una isla de cliente. Mismo
 * patrón que `AdminNoticias.tsx` con `Noticia`.
 */
export type Variante = {
  variantId: string;
  label: string;
  priceCents: number;
  orden: number;
};

export type Producto = {
  id: string;
  slug: string;
  name: string;
  category: string;
  seccion: string | null;
  priceCents: number | null;
  consultar: boolean;
  unit: string | null;
  shortDescription: string;
  cuerpo: string;
  allergens: string[];
  destacado: boolean;
  temporada: boolean;
  orden: number;
  imageUrl: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  activo: boolean;
  agotado: boolean;
  especialidad: string | null;
  variantes: Variante[];
};

type Props = {
  productosIniciales: Producto[];
};

// Mismas 7 opciones que valida `src/pages/api/admin/productos.ts`: si se
// desincroniza esta lista con la del servidor, el peor caso es una casilla
// que el servidor rechaza, no una que se guarde sin que el servidor la
// conozca.
const ALERGENOS: { id: string; label: string }[] = [
  { id: "gluten", label: "Gluten" },
  { id: "huevo", label: "Huevo" },
  { id: "leche", label: "Leche" },
  { id: "frutos-secos", label: "Frutos secos" },
  { id: "soja", label: "Soja" },
  { id: "sesamo", label: "Sésamo" },
  { id: "sulfitos", label: "Sulfitos" },
];

// Mismo criterio de búsqueda que `CategoryFilter.tsx`: sin acentos, para que
// «roscon» encuentre «Roscón».
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

// Mismos tokens y patrón de campo/error que `AdminNoticias.tsx`. El manual de
// marca prohíbe esquinas redondeadas y sombras en el panel, de ahí el
// `borderRadius: 0` explícito.
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

const badge: React.CSSProperties = {
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
  padding: "0.2rem 0.5rem",
  border: "1px solid var(--color-caramelo)",
  color: "var(--color-caramelo)",
  whiteSpace: "nowrap",
};

const MENSAJE_GENERICO = "Algo ha fallado. Inténtalo de nuevo.";

/** La conversión de `~/lib/euros`, al revés, para precargar el formulario. */
function centimosAEuros(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

type FormularioVariante = {
  variantId: string;
  label: string;
  priceEuros: string;
};

type FormularioProducto = {
  name: string;
  category: CategoryId;
  seccion: SeccionId | "";
  priceEuros: string;
  consultar: boolean;
  unit: string;
  shortDescription: string;
  cuerpo: string;
  allergens: string[];
  destacado: boolean;
  temporada: boolean;
  orden: number;
  imageUrl: string | null;
  imageAlt: string;
  imageWidth: number | null;
  imageHeight: number | null;
  activo: boolean;
  agotado: boolean;
  especialidad: string;
  variantes: FormularioVariante[];
};

const FORMULARIO_VACIO: FormularioProducto = {
  name: "",
  category: categoryIds[0],
  seccion: "",
  priceEuros: "",
  consultar: false,
  unit: "",
  shortDescription: "",
  cuerpo: "",
  allergens: [],
  destacado: false,
  temporada: false,
  orden: 100,
  imageUrl: null,
  imageAlt: "",
  imageWidth: null,
  imageHeight: null,
  activo: true,
  agotado: false,
  especialidad: "",
  variantes: [],
};

function formularioDesdeProducto(p: Producto): FormularioProducto {
  return {
    name: p.name,
    category: p.category as CategoryId,
    seccion: (p.seccion as SeccionId | null) ?? "",
    priceEuros: centimosAEuros(p.priceCents),
    consultar: p.consultar,
    unit: p.unit ?? "",
    shortDescription: p.shortDescription,
    cuerpo: p.cuerpo,
    allergens: [...p.allergens],
    destacado: p.destacado,
    temporada: p.temporada,
    orden: p.orden,
    imageUrl: p.imageUrl,
    imageAlt: p.imageAlt ?? "",
    imageWidth: p.imageWidth,
    imageHeight: p.imageHeight,
    activo: p.activo,
    agotado: p.agotado,
    especialidad: p.especialidad ?? "",
    variantes: p.variantes.map((v) => ({
      variantId: v.variantId,
      label: v.label,
      priceEuros: centimosAEuros(v.priceCents),
    })),
  };
}

function seccionLabel(id: string | null): string {
  if (!id) return "Sin sección";
  return secciones.find((s) => s.id === id)?.label ?? id;
}

function categoryLabel(id: string): string {
  return categories.find((c) => c.id === id)?.label ?? id;
}

function precioFila(p: Producto): string {
  if (p.consultar) return "Consultar";
  if (p.priceCents !== null) return formatPriceCents(p.priceCents);
  return "—";
}

async function llamarProductos(
  method: "POST" | "PUT",
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; producto?: Producto }> {
  try {
    const respuesta = await fetch("/api/admin/productos", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const cuerpo = await respuesta.json().catch(() => null);
    if (!respuesta.ok) {
      return { ok: false, error: cuerpo?.error ?? MENSAJE_GENERICO };
    }
    return { ok: true, producto: cuerpo?.producto };
  } catch {
    return {
      ok: false,
      error: "No hemos podido conectar. Comprueba tu conexión.",
    };
  }
}

export default function AdminProductos({ productosIniciales }: Props) {
  const [productos, setProductos] = useState(productosIniciales);
  const [cargando, setCargando] = useState(false);
  const [query, setQuery] = useState("");
  const [seccionFiltro, setSeccionFiltro] = useState("");
  const [pagina, setPagina] = useState(1);
  const [abierto, setAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [formulario, setFormulario] =
    useState<FormularioProducto>(FORMULARIO_VACIO);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  // Clave `id` de la ficha cuyo interruptor de fila está en curso; mientras
  // tanto, todos los interruptores se bloquean para no lanzar dos PUT sobre
  // la misma ficha a la vez.
  const [ocupada, setOcupada] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const needle = normalize(query.trim());
    return productos.filter((p) => {
      if (seccionFiltro && p.seccion !== seccionFiltro) return false;
      if (needle && !normalize(p.name).includes(needle)) return false;
      return true;
    });
  }, [productos, query, seccionFiltro]);

  // `paginar` acota: si al desactivar o filtrar se quedan menos páginas, se
  // enseña la última que queda en vez de una vacía.
  const pag = paginar(filtrados.length, POR_PAGINA, pagina);
  const visibles = filtrados.slice((pag.pagina - 1) * POR_PAGINA, pag.pagina * POR_PAGINA);

  function irAPagina(n: number) {
    setPagina(n);
    document.getElementById("ap-lista")?.scrollIntoView({ block: "start" });
  }

  async function recargar() {
    setCargando(true);
    setErrorServidor(null);
    try {
      const respuesta = await fetch("/api/admin/productos");
      const cuerpo = await respuesta.json().catch(() => null);
      if (!respuesta.ok) {
        setErrorServidor(cuerpo?.error ?? MENSAJE_GENERICO);
      } else {
        setProductos(
          ((cuerpo?.productos ?? []) as Producto[]).filter(
            (p) => p.category !== "packs",
          ),
        );
      }
    } catch {
      setErrorServidor("No hemos podido conectar. Comprueba tu conexión.");
    } finally {
      setCargando(false);
    }
  }

  function abrirNueva() {
    setFormulario(FORMULARIO_VACIO);
    setEditandoId(null);
    setErrorServidor(null);
    setMensaje(null);
    setAbierto(true);
  }

  function abrirEditar(p: Producto) {
    setFormulario(formularioDesdeProducto(p));
    setEditandoId(p.id);
    setErrorServidor(null);
    setMensaje(null);
    setAbierto(true);
  }

  function cerrar() {
    setAbierto(false);
    setEditandoId(null);
  }

  function actualizaCampo<K extends keyof FormularioProducto>(
    campo: K,
    valor: FormularioProducto[K],
  ) {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  }

  function alternarAlergeno(id: string) {
    setFormulario((actual) => ({
      ...actual,
      allergens: actual.allergens.includes(id)
        ? actual.allergens.filter((a) => a !== id)
        : [...actual.allergens, id],
    }));
  }

  function agregarVariante() {
    setFormulario((actual) => ({
      ...actual,
      variantes: [
        ...actual.variantes,
        { variantId: "", label: "", priceEuros: "" },
      ],
    }));
  }

  function quitarVariante(idx: number) {
    setFormulario((actual) => ({
      ...actual,
      variantes: actual.variantes.filter((_, i) => i !== idx),
    }));
  }

  function moverVariante(idx: number, direccion: -1 | 1) {
    setFormulario((actual) => {
      const destino = idx + direccion;
      if (destino < 0 || destino >= actual.variantes.length) return actual;
      const copia = [...actual.variantes];
      [copia[idx], copia[destino]] = [copia[destino], copia[idx]];
      return { ...actual, variantes: copia };
    });
  }

  function actualizaVariante(
    idx: number,
    campo: keyof FormularioVariante,
    valor: string,
  ) {
    setFormulario((actual) => ({
      ...actual,
      variantes: actual.variantes.map((v, i) =>
        i === idx ? { ...v, [campo]: valor } : v,
      ),
    }));
  }

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichero = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo fichero
    if (!fichero) return;

    setErrorServidor(null);
    setSubiendoFoto(true);

    const cuerpo = new FormData();
    cuerpo.append("foto", fichero);
    cuerpo.append("carpeta", "productos");

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
    // Mientras la foto sube, guardar dejaría la ficha sin ella: la subida
    // manda la URL final al estado, y hasta que no llega no hay nada que
    // enviar todavía.
    if (guardando || subiendoFoto) return;

    // Mismo aviso que el interruptor de la fila, para quien desactiva desde
    // el formulario completo en vez de con el interruptor rápido.
    if (editandoId && !formulario.activo) {
      const original = productos.find((p) => p.id === editandoId);
      if (
        original?.activo &&
        !window.confirm(
          `¿Desactivar «${formulario.name}»?\n\n${AVISO_DESACTIVAR}`,
        )
      ) {
        return;
      }
    }

    setErrorServidor(null);
    setMensaje(null);
    setGuardando(true);

    const datos = {
      name: formulario.name.trim(),
      category: formulario.category,
      seccion: formulario.seccion || null,
      priceCents: formulario.consultar
        ? null
        : eurosACentimos(formulario.priceEuros),
      consultar: formulario.consultar,
      unit: formulario.unit.trim() || null,
      shortDescription: formulario.shortDescription.trim(),
      cuerpo: formulario.cuerpo,
      allergens: formulario.allergens,
      destacado: formulario.destacado,
      temporada: formulario.temporada,
      orden: formulario.orden,
      imageUrl: formulario.imageUrl,
      imageAlt: formulario.imageAlt.trim() || null,
      imageWidth: formulario.imageWidth,
      imageHeight: formulario.imageHeight,
      activo: formulario.activo,
      agotado: formulario.agotado,
      especialidad: formulario.especialidad.trim() || null,
      variantes: formulario.variantes.map((v, i) => ({
        variantId: v.variantId.trim(),
        label: v.label.trim(),
        priceCents: eurosACentimos(v.priceEuros) ?? 0,
        orden: i,
      })),
    };

    const resultado = editandoId
      ? await llamarProductos("PUT", { id: editandoId, ...datos })
      : await llamarProductos("POST", datos);

    setGuardando(false);
    if (!resultado.ok || !resultado.producto) {
      setErrorServidor(resultado.error ?? MENSAJE_GENERICO);
      return;
    }

    // Se refresca la lista con lo que ha devuelto el servidor —el `slug` y
    // el `id` los decide él— y no con lo que tenía el formulario.
    const guardado = resultado.producto;
    setProductos((actuales) =>
      actuales.some((p) => p.id === guardado.id)
        ? actuales.map((p) => (p.id === guardado.id ? guardado : p))
        : [guardado, ...actuales],
    );
    setMensaje("Guardado. En la web se ve en unos segundos.");
    cerrar();
  }

  async function alternarCampo(p: Producto, campo: "agotado" | "activo") {
    if (ocupada) return;

    // Al desactivar, el aviso; al reactivar o marcar/desmarcar agotado, no
    // hace falta: son reversibles con el mismo interruptor.
    if (campo === "activo" && p.activo) {
      if (!window.confirm(`¿Desactivar «${p.name}»?\n\n${AVISO_DESACTIVAR}`)) {
        return;
      }
    }

    setErrorServidor(null);
    setMensaje(null);
    setOcupada(p.id);

    const cuerpo = {
      id: p.id,
      name: p.name,
      category: p.category,
      seccion: p.seccion,
      priceCents: p.priceCents,
      consultar: p.consultar,
      unit: p.unit,
      shortDescription: p.shortDescription,
      cuerpo: p.cuerpo,
      allergens: p.allergens,
      destacado: p.destacado,
      temporada: p.temporada,
      orden: p.orden,
      imageUrl: p.imageUrl,
      imageAlt: p.imageAlt,
      imageWidth: p.imageWidth,
      imageHeight: p.imageHeight,
      activo: p.activo,
      agotado: p.agotado,
      // Se reenvía tal cual: si faltara, el servidor la daría por vacía y
      // marcar «agotado» borraría la etiqueta.
      especialidad: p.especialidad,
      variantes: p.variantes,
      [campo]: !p[campo],
    };

    const resultado = await llamarProductos("PUT", cuerpo);
    setOcupada(null);
    if (!resultado.ok || !resultado.producto) {
      setErrorServidor(resultado.error ?? MENSAJE_GENERICO);
      return;
    }
    const guardado = resultado.producto;
    setProductos((actuales) =>
      actuales.map((x) => (x.id === guardado.id ? guardado : x)),
    );
  }

  return (
    <div>
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

      {errorServidor && !abierto && (
        <p
          role="alert"
          style={{
            marginBottom: 16,
            padding: "0.75rem 1rem",
            border: "1px solid var(--color-caramelo)",
            color: "var(--color-caramelo)",
            fontSize: 13,
          }}
        >
          {errorServidor}
        </p>
      )}

      {!abierto && (
        <div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "flex-end",
              justifyContent: "space-between",
            }}
          >
            <button
              type="button"
              className="btn btn-primario"
              onClick={abrirNueva}
              style={{ border: "none" }}
            >
              Ficha nueva
            </button>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <div>
                <label style={label} htmlFor="ap-buscar">
                  Buscar
                </label>
                <input
                  id="ap-buscar"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPagina(1);
                  }}
                  placeholder="Nombre de la ficha"
                  style={{ ...field, width: "16rem" }}
                />
              </div>
              <div>
                <label style={label} htmlFor="ap-seccion">
                  Sección
                </label>
                <select
                  id="ap-seccion"
                  value={seccionFiltro}
                  onChange={(e) => {
                    setSeccionFiltro(e.target.value);
                    setPagina(1);
                  }}
                  style={{ ...field, width: "14rem" }}
                >
                  <option value="">Todas</option>
                  {secciones.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <p
            className="numeracion"
            style={{ marginTop: 16, color: "var(--color-ink-muted)" }}
          >
            {filtrados.length} de {productos.length} fichas
            {pag.paginas > 1 && ` · viendo ${pag.desde}–${pag.hasta}`}
          </p>

          {productos.length === 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ color: "var(--color-ink-muted)" }}>
                No se ha podido cargar el catálogo.
              </p>
              <button
                type="button"
                onClick={recargar}
                disabled={cargando}
                style={{
                  marginTop: 8,
                  background: "none",
                  border: "1px solid var(--color-avellana)",
                  padding: "0.5rem 1rem",
                  fontSize: 13,
                  cursor: cargando ? "not-allowed" : "pointer",
                }}
              >
                {cargando ? "Cargando…" : "Reintentar"}
              </button>
            </div>
          )}

          {filtrados.length > 0 && (
            <ul id="ap-lista" style={{ listStyle: "none", padding: 0, margin: "12px 0 0", scrollMarginTop: 16 }}>
              {visibles.map((p) => (
                <li
                  key={p.id}
                  style={{
                    border: "1px solid var(--color-avellana)",
                    padding: "0.75rem 1rem",
                    marginTop: 12,
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 16,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => abrirEditar(p)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: 0,
                      textAlign: "left",
                      cursor: "pointer",
                      flex: "1 1 220px",
                    }}
                  >
                    <p className="numeracion">
                      {seccionLabel(p.seccion)} · {categoryLabel(p.category)}
                    </p>
                    <p style={{ marginTop: 4, fontWeight: 600 }}>{p.name}</p>
                  </button>

                  <span style={{ minWidth: 84, fontWeight: 600 }}>
                    {precioFila(p)}
                  </span>

                  <div style={{ display: "flex", gap: 8 }}>
                    {p.especialidad && <span style={badge}>{p.especialidad}</span>}
                    {p.agotado && <span style={badge}>Agotado</span>}
                    {!p.activo && <span style={badge}>Desactivado</span>}
                  </div>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={p.agotado}
                      disabled={ocupada !== null}
                      onChange={() => alternarCampo(p, "agotado")}
                    />
                    Agotado
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={p.activo}
                      disabled={ocupada !== null}
                      onChange={() => alternarCampo(p, "activo")}
                    />
                    Activo
                  </label>
                </li>
              ))}
            </ul>
          )}

          <Paginacion
            pagina={pag.pagina}
            paginas={pag.paginas}
            etiqueta="Páginas de productos"
            onCambiar={irAPagina}
          />

          {productos.length > 0 && filtrados.length === 0 && (
            <p style={{ marginTop: 16, color: "var(--color-ink-muted)" }}>
              Ninguna ficha coincide con la búsqueda.
            </p>
          )}
        </div>
      )}

      {abierto && (
        <form onSubmit={onSubmit} noValidate style={{ maxWidth: "40rem" }}>
          <div>
            <label style={label} htmlFor="ap-name">
              Nombre
            </label>
            <input
              id="ap-name"
              value={formulario.name}
              onChange={(e) => actualizaCampo("name", e.target.value)}
              required
              minLength={2}
              maxLength={140}
              style={field}
            />
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <div style={{ flex: "1 1 14rem" }}>
              <label style={label} htmlFor="ap-categoria">
                Categoría
              </label>
              <select
                id="ap-categoria"
                value={formulario.category}
                onChange={(e) =>
                  actualizaCampo("category", e.target.value as CategoryId)
                }
                style={field}
              >
                {categories.filter((c) => c.id !== "packs").map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ flex: "1 1 14rem" }}>
              <label style={label} htmlFor="ap-seccion-form">
                Sección de la carta
              </label>
              <select
                id="ap-seccion-form"
                value={formulario.seccion}
                onChange={(e) =>
                  actualizaCampo("seccion", e.target.value as SeccionId | "")
                }
                style={field}
              >
                <option value="">— Ninguna —</option>
                {secciones.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
              alignItems: "flex-end",
            }}
          >
            <div style={{ flex: "1 1 10rem" }}>
              <label style={label} htmlFor="ap-precio">
                Precio (€)
              </label>
              <input
                id="ap-precio"
                type="text"
                inputMode="decimal"
                value={formulario.priceEuros}
                onChange={(e) => actualizaCampo("priceEuros", e.target.value)}
                disabled={formulario.consultar}
                placeholder="19.99"
                style={{
                  ...field,
                  opacity: formulario.consultar ? 0.5 : 1,
                }}
              />
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginTop: 8,
              }}
            >
              <input
                type="checkbox"
                checked={formulario.consultar}
                onChange={(e) => actualizaCampo("consultar", e.target.checked)}
              />
              <span style={{ fontSize: 14 }}>Precio a consultar</span>
            </label>

            <div style={{ flex: "1 1 10rem" }}>
              <label style={label} htmlFor="ap-unidad">
                Unidad
              </label>
              <input
                id="ap-unidad"
                value={formulario.unit}
                onChange={(e) => actualizaCampo("unit", e.target.value)}
                placeholder="ración, kg, unidad…"
                maxLength={60}
                style={field}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor="ap-especialidad">
              Etiqueta de especialidad
            </label>
            <input
              id="ap-especialidad"
              list="ap-especialidades"
              value={formulario.especialidad}
              onChange={(e) => actualizaCampo("especialidad", e.target.value)}
              placeholder="Vacía = sin etiqueta"
              maxLength={60}
              style={field}
            />
            <datalist id="ap-especialidades">
              <option value="Especialidad desde 1986" />
              <option value="Especialidad" />
              <option value="Especialidad niños" />
            </datalist>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor="ap-descripcion">
              Descripción corta ({formulario.shortDescription.length}/180)
            </label>
            <textarea
              id="ap-descripcion"
              value={formulario.shortDescription}
              onChange={(e) =>
                actualizaCampo("shortDescription", e.target.value.slice(0, 180))
              }
              required
              minLength={3}
              maxLength={180}
              rows={2}
              style={{ ...field, resize: "vertical" }}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor="ap-cuerpo">
              Cuerpo (Markdown)
            </label>
            <textarea
              id="ap-cuerpo"
              value={formulario.cuerpo}
              onChange={(e) => actualizaCampo("cuerpo", e.target.value)}
              rows={8}
              style={{ ...field, resize: "vertical", fontFamily: "monospace" }}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <p style={label}>Alérgenos</p>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px 16px",
                marginTop: 8,
              }}
            >
              {ALERGENOS.map((a) => (
                <label
                  key={a.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 14,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formulario.allergens.includes(a.id)}
                    onChange={() => alternarAlergeno(a.id)}
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor="ap-orden">
              Orden dentro de la sección
            </label>
            <input
              id="ap-orden"
              type="number"
              min={0}
              max={9999}
              value={formulario.orden}
              onChange={(e) =>
                actualizaCampo("orden", Number(e.target.value) || 0)
              }
              style={{ ...field, width: "8rem" }}
            />
          </div>

          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={formulario.destacado}
                onChange={(e) => actualizaCampo("destacado", e.target.checked)}
              />
              <span style={{ fontSize: 14 }}>Destacado</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={formulario.temporada}
                onChange={(e) => actualizaCampo("temporada", e.target.checked)}
              />
              <span style={{ fontSize: 14 }}>De temporada</span>
            </label>
          </div>

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
                htmlFor="ap-foto"
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
                id="ap-foto"
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
              <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                JPG, PNG o WebP
              </span>
            </div>
          </div>

          {formulario.imageUrl && (
            <div style={{ marginTop: 16 }}>
              <label style={label} htmlFor="ap-alt">
                Texto alternativo de la foto
              </label>
              <input
                id="ap-alt"
                value={formulario.imageAlt}
                onChange={(e) => actualizaCampo("imageAlt", e.target.value)}
                placeholder="Qué se ve en la foto"
                maxLength={200}
                style={field}
              />
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <p style={label}>Variantes (tamaños)</p>
            {formulario.variantes.length === 0 && (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 13,
                  color: "var(--color-ink-muted)",
                }}
              >
                Sin variantes: la ficha se vende a un único precio.
              </p>
            )}
            {formulario.variantes.map((v, idx) => (
              <div
                key={idx}
                style={{
                  marginTop: 8,
                  padding: "0.75rem",
                  border: "1px solid var(--color-avellana)",
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "flex-end",
                }}
              >
                <div style={{ flex: "1 1 8rem" }}>
                  <label style={label} htmlFor={`ap-variante-${idx}-id`}>
                    Identificador
                  </label>
                  <input
                    id={`ap-variante-${idx}-id`}
                    value={v.variantId}
                    onChange={(e) =>
                      actualizaVariante(idx, "variantId", e.target.value)
                    }
                    placeholder="pequena"
                    maxLength={60}
                    style={field}
                  />
                </div>
                <div style={{ flex: "1 1 10rem" }}>
                  <label style={label} htmlFor={`ap-variante-${idx}-label`}>
                    Etiqueta
                  </label>
                  <input
                    id={`ap-variante-${idx}-label`}
                    value={v.label}
                    onChange={(e) =>
                      actualizaVariante(idx, "label", e.target.value)
                    }
                    placeholder="Pequeña (6-8 rac.)"
                    maxLength={80}
                    style={field}
                  />
                </div>
                <div style={{ flex: "0 1 7rem" }}>
                  <label style={label} htmlFor={`ap-variante-${idx}-precio`}>
                    Precio (€)
                  </label>
                  <input
                    id={`ap-variante-${idx}-precio`}
                    type="text"
                    inputMode="decimal"
                    value={v.priceEuros}
                    onChange={(e) =>
                      actualizaVariante(idx, "priceEuros", e.target.value)
                    }
                    placeholder="14.50"
                    style={field}
                  />
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    onClick={() => moverVariante(idx, -1)}
                    disabled={idx === 0}
                    aria-label="Subir variante"
                    style={{
                      border: "1px solid var(--color-avellana)",
                      background: "none",
                      padding: "0.5rem 0.6rem",
                      cursor: idx === 0 ? "not-allowed" : "pointer",
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moverVariante(idx, 1)}
                    disabled={idx === formulario.variantes.length - 1}
                    aria-label="Bajar variante"
                    style={{
                      border: "1px solid var(--color-avellana)",
                      background: "none",
                      padding: "0.5rem 0.6rem",
                      cursor:
                        idx === formulario.variantes.length - 1
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => quitarVariante(idx)}
                    style={{
                      border: "1px solid var(--color-avellana)",
                      background: "none",
                      padding: "0.5rem 0.75rem",
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={agregarVariante}
              style={{
                marginTop: 8,
                background: "none",
                border: "1px solid var(--color-avellana)",
                padding: "0.5rem 1rem",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Añadir variante
            </button>
          </div>

          <div
            style={{
              marginTop: 20,
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={formulario.agotado}
                onChange={(e) => actualizaCampo("agotado", e.target.checked)}
              />
              <span style={{ fontSize: 14 }}>Agotado</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={formulario.activo}
                onChange={(e) => actualizaCampo("activo", e.target.checked)}
              />
              <span style={{ fontSize: 14 }}>Activo</span>
            </label>
          </div>
          <p
            style={{
              marginTop: 8,
              fontSize: 12,
              color: "var(--color-ink-muted)",
            }}
          >
            Al desactivar: {AVISO_DESACTIVAR}
          </p>

          {errorServidor && (
            <p
              role="alert"
              style={{
                marginTop: 16,
                padding: "0.75rem 1rem",
                border: "1px solid var(--color-caramelo)",
                color: "var(--color-caramelo)",
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
