import { useEffect, useMemo, useState } from "react";
import type {
  PackAdmin,
  Problema,
  ProductoCarta,
  RespuestaGuardarPack,
} from "~/lib/admin-packs-api";
import {
  aEntrada,
  borradorDesdePack,
  borradorVacio,
  comprobarBorrador,
  dondeDePieza,
  hayErroresDePiezas,
  mover,
  problemasDe,
  textoPersonas,
  type Borrador,
} from "~/lib/admin-packs-borrador";
import {
  ahorroPct,
  precioPorPersonaCents,
  precioSueltoCents,
  type DefinicionPack,
} from "~/data/packs";
import { formatPriceCents } from "~/lib/format";
import { AVISO_DESACTIVAR } from "~/lib/panel-textos";
import EditorPiezas from "./EditorPiezas";
import {
  ayuda,
  Bloque,
  botonLinea,
  campo,
  etiqueta,
  MENSAJE_GENERICO,
  Mover,
  Problemas,
  SIN_CONEXION,
} from "./comunes";

type Props = {
  /** null = pack nuevo. */
  pack: PackAdmin | null;
  carta: readonly ProductoCarta[];
  /** Lo que dijo el último guardado (se enseña arriba). */
  aviso: { mensaje: string; avisos: Problema[] } | null;
  onGuardado: (r: RespuestaGuardarPack, creado: boolean) => void;
  onVolver: () => void;
  /** Vuelve a leer la carta (sin tocar el borrador); null si no se pudo. */
  onRecargarCarta: () => Promise<readonly ProductoCarta[] | null>;
};

const MAX_FRASES = 10;

/** Cada campo del bloque 1 y 2 → su `donde` en `Problema`. */
const DONDE_POR_ID: Record<string, string> = {
  "pk-nombre": "nombre",
  "pk-precio": "precio",
  "pk-orden": "orden",
  "pk-descriptor": "descriptor",
  "pk-alt": "foto",
  "pk-ocasion": "ocasión",
  "pk-min": "personas",
  "pk-max": "personas",
  "pk-personas": "personas",
  "pk-consejo": "consejo",
};

async function guardar(
  slug: string | null,
  cuerpo: unknown,
): Promise<
  | { ok: true; r: RespuestaGuardarPack }
  | { ok: false; errores?: Problema[]; error?: string }
> {
  try {
    const res = await fetch(
      slug
        ? `/api/admin/packs?slug=${encodeURIComponent(slug)}`
        : "/api/admin/packs",
      {
        method: slug ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cuerpo),
      },
    );
    const datos = await res.json().catch(() => null);
    if (res.ok && datos?.slug)
      return { ok: true, r: datos as RespuestaGuardarPack };
    if (Array.isArray(datos?.errores))
      return { ok: false, errores: datos.errores };
    return { ok: false, error: datos?.error ?? MENSAJE_GENERICO };
  } catch {
    return { ok: false, error: SIN_CONEXION };
  }
}

export default function EditorPack({
  pack,
  carta,
  aviso,
  onGuardado,
  onVolver,
  onRecargarCarta,
}: Props) {
  const [borrador, setBorrador] = useState<Borrador>(() =>
    pack ? borradorDesdePack(pack) : borradorVacio(),
  );
  const original = useMemo(
    () =>
      JSON.stringify(
        aEntrada(pack ? borradorDesdePack(pack) : borradorVacio()),
      ),
    [pack],
  );
  const [guardando, setGuardando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [erroresServidor, setErroresServidor] = useState<Problema[]>([]);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  // Un pack nuevo no enseña errores junto a los campos hasta que se toca el
  // campo (al salir de él) o se intenta guardar; uno existente, desde el principio.
  const [intentado, setIntentado] = useState(pack !== null);
  const [tocados, setTocados] = useState<ReadonlySet<string>>(new Set());

  const entrada = useMemo(() => aEntrada(borrador), [borrador]);
  const { errores: erroresCliente, avisos } = useMemo(
    () => comprobarBorrador(borrador, carta),
    [borrador, carta],
  );
  const errores = [...erroresCliente, ...erroresServidor];
  const sinCambios = JSON.stringify(entrada) === original;

  // Cerrar la pestaña, recargar o irse a otra sección del panel con cambios
  // sin guardar: el navegador pregunta antes.
  useEffect(() => {
    if (sinCambios) return;
    const alSalir = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, [sinCambios]);

  /** `donde` de cada pieza → la clave con la que se marca como tocada. */
  const clavePorDonde = new Map<string, string>();
  borrador.piezas.forEach((p, i) => {
    for (const d of dondeDePieza(p, i)) clavePorDonde.set(d, `clave:${p.clave}`);
  });
  const visibles = intentado
    ? errores
    : errores.filter(
        (e) => tocados.has(e.donde) || tocados.has(clavePorDonde.get(e.donde) ?? ""),
      );

  /** Al salir de un campo, se marca como tocado (por su id o por el `data-donde` que lo envuelve). */
  function alSalirDeCampo(e: React.FocusEvent) {
    const el = e.target as HTMLElement;
    const donde =
      DONDE_POR_ID[el.id] ?? el.closest("[data-donde]")?.getAttribute("data-donde");
    if (donde && !tocados.has(donde)) setTocados(new Set([...tocados, donde]));
  }

  const resumen = useMemo(() => {
    const def = { slug: "", ...entrada.definicion } as DefinicionPack;
    const suelto =
      entrada.definicion.piezas.length > 0
        ? precioSueltoCents(def, carta)
        : null;
    const precio = entrada.priceCents;
    return {
      precio,
      suelto,
      ahorro: precio > 0 ? ahorroPct(precio, suelto) : null,
      porPersona:
        precio > 0 && entrada.definicion.personas.max > 0
          ? precioPorPersonaCents(precio, def)
          : null,
    };
  }, [entrada, carta]);

  function cambiar(c: Partial<Borrador>) {
    setBorrador((b) => ({ ...b, ...c }));
    // Lo que dijo el servidor era sobre la versión anterior.
    setErroresServidor([]);
    setErrorGeneral(null);
  }

  /** Mín./máx.: si el texto era el propuesto (o estaba vacío), se vuelve a proponer. */
  function cambiarPersonas(c: { personasMin?: string; personasMax?: string }) {
    setBorrador((b) => {
      const nuevo = { ...b, ...c };
      const propuestoAntes = textoPersonas(b.personasMin, b.personasMax);
      if (b.personasTexto === "" || b.personasTexto === propuestoAntes) {
        nuevo.personasTexto = textoPersonas(
          nuevo.personasMin,
          nuevo.personasMax,
        );
      }
      return nuevo;
    });
    setErroresServidor([]);
  }

  async function onFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fichero = e.target.files?.[0];
    e.target.value = "";
    if (!fichero) return;
    setErrorGeneral(null);
    setSubiendoFoto(true);
    const cuerpo = new FormData();
    cuerpo.append("foto", fichero);
    cuerpo.append("carpeta", "productos");
    try {
      const res = await fetch("/api/admin/imagen", {
        method: "POST",
        body: cuerpo,
      });
      const datos = await res.json().catch(() => null);
      if (!res.ok) setErrorGeneral(datos?.error ?? MENSAJE_GENERICO);
      else
        cambiar({
          imageUrl: datos.url,
          imageWidth: datos.ancho,
          imageHeight: datos.alto,
        });
    } catch {
      setErrorGeneral(SIN_CONEXION);
    } finally {
      setSubiendoFoto(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (guardando || subiendoFoto) return;
    setIntentado(true);
    setGuardando(true);
    setErrorGeneral(null);
    let pendientes = erroresCliente;
    // Un error de pieza puede venir de una carta vieja (un producto que se
    // activó o se creó después de abrir el panel): se vuelve a leer antes de
    // bloquear. El borrador no se toca.
    if (hayErroresDePiezas(pendientes)) {
      const nueva = await onRecargarCarta();
      if (nueva) pendientes = comprobarBorrador(borrador, nueva).errores;
    }
    if (pendientes.length > 0) {
      setGuardando(false);
      setErrorGeneral(
        `No se ha guardado: hay ${pendientes.length === 1 ? "una cosa" : `${pendientes.length} cosas`} que corregir. Están marcadas junto a cada campo y en el resumen.`,
      );
      return;
    }
    if (
      pack?.activo &&
      !borrador.activo &&
      !window.confirm(`¿Desactivar «${entrada.name}»?\n\n${AVISO_DESACTIVAR}`)
    ) {
      setGuardando(false);
      return;
    }
    const r = await guardar(pack?.slug ?? null, entrada);
    setGuardando(false);
    if (r.ok) {
      onGuardado(r.r, !pack);
      return;
    }
    if (r.errores) {
      setErroresServidor(r.errores);
      setErrorGeneral("No se ha guardado: revisa lo marcado.");
    } else {
      setErrorGeneral(r.error ?? MENSAJE_GENERICO);
    }
  }

  function volver() {
    if (
      !sinCambios &&
      !window.confirm("Hay cambios sin guardar. ¿Salir sin guardarlos?")
    )
      return;
    onVolver();
  }

  // Los avisos (p. ej. «no ahorra nada») solo salen en el resumen: una vez.
  const de = (donde: string) => ({ errores: problemasDe(visibles, [donde]) });

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button type="button" onClick={volver} style={botonLinea}>
          ← Todos los packs
        </button>
        {pack && (
          <a
            href={`/catalogo/${pack.slug}`}
            target="_blank"
            rel="noopener"
            style={{
              fontSize: 13,
              textDecoration: "underline",
              color: "var(--color-caramelo)",
            }}
          >
            Ver en la web
          </a>
        )}
      </div>

      <h2
        className="font-[family-name:var(--font-display)] text-3xl"
        style={{ marginTop: 16 }}
      >
        {pack ? pack.name : "Pack nuevo"}
      </h2>

      {aviso && (
        <div
          role="status"
          style={{
            marginTop: 16,
            padding: "0.75rem 1rem",
            border: "1px solid var(--color-avellana)",
            background: "var(--color-latte)",
            fontSize: 13,
          }}
        >
          <p>
            {aviso.mensaje}
            {aviso.avisos.length > 0 && " Tiene avisos: los verás en el resumen."}
          </p>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        onBlur={alSalirDeCampo}
        noValidate
        className="lg:grid lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10"
      >
        <div style={{ maxWidth: "44rem" }}>
          <Bloque numero="01" titulo="El pack">
            <div style={{ marginTop: 16 }}>
              <label style={etiqueta} htmlFor="pk-nombre">
                Nombre
              </label>
              <input
                id="pk-nombre"
                value={borrador.name}
                maxLength={120}
                placeholder="Pack Cumpleaños"
                onChange={(e) => cambiar({ name: e.target.value })}
                style={campo}
              />
              <Problemas {...de("nombre")} />
              {pack && (
                <p style={ayuda}>
                  La dirección en la web no cambia aunque cambies el nombre:
                  /catalogo/{pack.slug}
                </p>
              )}
            </div>

            <div
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                marginTop: 16,
              }}
            >
              <div style={{ flex: "1 1 10rem" }}>
                <label style={etiqueta} htmlFor="pk-precio">
                  Precio del pack (€)
                </label>
                <input
                  id="pk-precio"
                  type="text"
                  inputMode="decimal"
                  value={borrador.precioEuros}
                  placeholder="39,50"
                  onChange={(e) => cambiar({ precioEuros: e.target.value })}
                  style={campo}
                />
                <Problemas {...de("precio")} />
              </div>
              <div style={{ flex: "0 1 9rem" }}>
                <label style={etiqueta} htmlFor="pk-orden">
                  Orden
                </label>
                <input
                  id="pk-orden"
                  type="number"
                  min={0}
                  max={9999}
                  value={borrador.orden}
                  onChange={(e) =>
                    cambiar({ orden: Number(e.target.value) || 0 })
                  }
                  style={campo}
                />
                <Problemas {...de("orden")} />
              </div>
            </div>
            <p style={ayuda}>
              Orden: los números más bajos salen antes en la página de packs.
            </p>

            <div style={{ marginTop: 16 }}>
              <label style={etiqueta} htmlFor="pk-descriptor">
                Descriptor ({borrador.shortDescription.length}/200)
              </label>
              <input
                id="pk-descriptor"
                value={borrador.shortDescription}
                maxLength={200}
                placeholder="Todo lo de un cumpleaños en casa, resuelto"
                onChange={(e) => cambiar({ shortDescription: e.target.value })}
                style={campo}
              />
              <p style={ayuda}>
                La frase corta bajo el nombre, en la tarjeta y en la ficha.
              </p>
              <Problemas {...de("descriptor")} />
            </div>

            <div
              style={{
                display: "flex",
                gap: 20,
                flexWrap: "wrap",
                marginTop: 16,
                fontSize: 14,
              }}
            >
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={borrador.activo}
                  onChange={(e) => cambiar({ activo: e.target.checked })}
                />
                Activo (se ve en la web)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={borrador.agotado}
                  onChange={(e) => cambiar({ agotado: e.target.checked })}
                />
                Agotado (se ve, pero no se puede pedir)
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={borrador.destacado}
                  onChange={(e) => cambiar({ destacado: e.target.checked })}
                />
                Destacado (sale en la portada y en Top ventas)
              </label>
            </div>
            <Problemas {...de("estado")} />

            <div style={{ marginTop: 16 }}>
              <p style={etiqueta}>Foto</p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  marginTop: 8,
                  flexWrap: "wrap",
                }}
              >
                {borrador.imageUrl && !subiendoFoto && (
                  <img
                    src={borrador.imageUrl}
                    alt=""
                    style={{
                      width: 120,
                      height: 90,
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                )}
                <label
                  htmlFor="pk-foto"
                  className="btn btn-secundario"
                  style={{
                    cursor: subiendoFoto ? "wait" : "pointer",
                    opacity: subiendoFoto ? 0.6 : 1,
                  }}
                >
                  {subiendoFoto
                    ? "Subiendo la foto…"
                    : borrador.imageUrl
                      ? "Cambiar foto"
                      : "Elegir foto"}
                </label>
                <input
                  id="pk-foto"
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
                {borrador.imageUrl && !subiendoFoto && (
                  <button
                    type="button"
                    style={botonLinea}
                    onClick={() =>
                      cambiar({
                        imageUrl: null,
                        imageWidth: null,
                        imageHeight: null,
                      })
                    }
                  >
                    Quitar foto
                  </button>
                )}
                <span style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                  JPG, PNG o WebP
                </span>
              </div>
              {borrador.imageUrl && (
                <div style={{ marginTop: 12 }}>
                  <label style={etiqueta} htmlFor="pk-alt">
                    Texto alternativo de la foto
                  </label>
                  <input
                    id="pk-alt"
                    value={borrador.imageAlt}
                    maxLength={200}
                    placeholder="Qué se ve en la foto"
                    onChange={(e) => cambiar({ imageAlt: e.target.value })}
                    style={campo}
                  />
                </div>
              )}
              <Problemas {...de("foto")} />
            </div>
          </Bloque>

          <Bloque numero="02" titulo="La ficha">
            <div style={{ marginTop: 16 }}>
              <label style={etiqueta} htmlFor="pk-ocasion">
                Ocasión
              </label>
              <input
                id="pk-ocasion"
                value={borrador.ocasion}
                maxLength={120}
                placeholder="Cumpleaños en casa"
                onChange={(e) => cambiar({ ocasion: e.target.value })}
                style={campo}
              />
              <p style={ayuda}>Va encima del nombre, en pequeño.</p>
              <Problemas {...de("ocasión")} />
            </div>

            <div
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                marginTop: 16,
              }}
            >
              <div style={{ flex: "0 1 8rem" }}>
                <label style={etiqueta} htmlFor="pk-min">
                  Personas, mín.
                </label>
                <input
                  id="pk-min"
                  type="number"
                  min={1}
                  value={borrador.personasMin}
                  onChange={(e) =>
                    cambiarPersonas({ personasMin: e.target.value })
                  }
                  style={campo}
                />
              </div>
              <div style={{ flex: "0 1 8rem" }}>
                <label style={etiqueta} htmlFor="pk-max">
                  Personas, máx.
                </label>
                <input
                  id="pk-max"
                  type="number"
                  min={1}
                  value={borrador.personasMax}
                  onChange={(e) =>
                    cambiarPersonas({ personasMax: e.target.value })
                  }
                  style={campo}
                />
              </div>
              <div style={{ flex: "1 1 12rem" }}>
                <label style={etiqueta} htmlFor="pk-personas">
                  Cómo se lee
                </label>
                <input
                  id="pk-personas"
                  value={borrador.personasTexto}
                  maxLength={80}
                  placeholder="18–20 personas"
                  onChange={(e) => cambiar({ personasTexto: e.target.value })}
                  style={campo}
                />
              </div>
            </div>
            <p style={ayuda}>El precio por persona se calcula con el máximo.</p>
            <Problemas {...de("personas")} />

            <div style={{ marginTop: 20 }} data-donde="para quién">
              <p style={etiqueta}>Para quién es</p>
              <p style={ayuda}>Una frase por línea; se leen en este orden.</p>
              {borrador.paraQuien.map((f, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    marginTop: 8,
                  }}
                >
                  <textarea
                    aria-label={`Frase ${i + 1}`}
                    value={f}
                    maxLength={400}
                    rows={2}
                    onChange={(e) =>
                      cambiar({
                        paraQuien: borrador.paraQuien.map((x, j) =>
                          j === i ? e.target.value : x,
                        ),
                      })
                    }
                    style={{ ...campo, marginTop: 0, resize: "vertical" }}
                  />
                  <Mover
                    i={i}
                    total={borrador.paraQuien.length}
                    que={`la frase ${i + 1}`}
                    onMover={(dir) =>
                      cambiar({ paraQuien: mover(borrador.paraQuien, i, dir) })
                    }
                    onQuitar={() =>
                      cambiar({
                        paraQuien: borrador.paraQuien.filter((_, j) => j !== i),
                      })
                    }
                  />
                </div>
              ))}
              {borrador.paraQuien.length < MAX_FRASES && (
                <button
                  type="button"
                  style={{ ...botonLinea, marginTop: 8 }}
                  onClick={() =>
                    cambiar({ paraQuien: [...borrador.paraQuien, ""] })
                  }
                >
                  Añadir frase
                </button>
              )}
              <Problemas {...de("para quién")} />
            </div>

            <div style={{ marginTop: 20 }}>
              <label style={etiqueta} htmlFor="pk-consejo">
                Consejo del obrador (opcional)
              </label>
              <textarea
                id="pk-consejo"
                value={borrador.consejo}
                maxLength={600}
                rows={3}
                placeholder="Cómo conservarlo o calentarlo"
                onChange={(e) => cambiar({ consejo: e.target.value })}
                style={{ ...campo, resize: "vertical" }}
              />
              <Problemas {...de("consejo")} />
            </div>
          </Bloque>

          <Bloque numero="03" titulo="Qué lleva">
            <EditorPiezas
              piezas={borrador.piezas}
              carta={carta}
              errores={visibles}
              onChange={(piezas) => cambiar({ piezas })}
            />
          </Bloque>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Bloque numero="04" titulo="Resumen">
            <dl style={{ marginTop: 12, fontSize: 14 }}>
              <Fila nombre="Precio del pack">
                {resumen.precio > 0 ? formatPriceCents(resumen.precio) : "—"}
              </Fila>
              <Fila nombre="Comprado suelto">
                {resumen.suelto !== null
                  ? formatPriceCents(resumen.suelto)
                  : "—"}
              </Fila>
              <Fila nombre="Ahorro">
                {resumen.ahorro !== null ? (
                  `${resumen.ahorro} %`
                ) : resumen.precio <= 0 || resumen.suelto === null ? (
                  "—"
                ) : (
                  <span style={{ color: "var(--color-ink)" }}>sin ahorro</span>
                )}
              </Fila>
              <Fila nombre="Por persona">
                {resumen.porPersona !== null
                  ? formatPriceCents(resumen.porPersona)
                  : "—"}
              </Fila>
            </dl>
            <p style={ayuda}>
              «Comprado suelto» suma cada pieza al precio de la carta; en un
              hueco, la opción más barata. Igual que en la web.
            </p>

            {errores.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={etiqueta}>
                  {intentado ? "Antes de guardar, corrige" : "Falta por completar"}
                </p>
                <ul
                  style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}
                >
                  {errores.map((e, i) => (
                    <li
                      key={i}
                      style={{
                        color: intentado ? "var(--color-caramelo)" : "var(--color-ink-muted)",
                        marginTop: 4,
                      }}
                    >
                      <strong>{e.donde.charAt(0).toUpperCase() + e.donde.slice(1)}:</strong> {e.mensaje}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {avisos.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <p style={etiqueta}>Avisos (se puede guardar igual)</p>
                <ul
                  style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 13 }}
                >
                  {avisos.map((a, i) => (
                    <li
                      key={i}
                      style={{ color: "var(--color-ink-muted)", marginTop: 4 }}
                    >
                      {a.mensaje}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {errores.length === 0 && avisos.length === 0 && (
              <p style={{ ...ayuda, marginTop: 16 }}>
                Todo en orden para guardar.
              </p>
            )}

            {errorGeneral && (
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
                {errorGeneral}
              </p>
            )}

            <div
              style={{
                marginTop: 20,
                display: "flex",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
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
                {guardando
                  ? "Guardando…"
                  : pack
                    ? "Guardar cambios"
                    : "Crear el pack"}
              </button>
              <button
                type="button"
                onClick={volver}
                disabled={guardando}
                style={botonLinea}
              >
                Cancelar
              </button>
            </div>
          </Bloque>
        </aside>
      </form>
    </div>
  );
}

function Fila({
  nombre,
  children,
}: {
  nombre: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "0.4rem 0",
        borderBottom: "1px solid var(--color-avellana)",
      }}
    >
      <dt style={{ color: "var(--color-ink-muted)" }}>{nombre}</dt>
      <dd style={{ fontWeight: 600, margin: 0 }}>{children}</dd>
    </div>
  );
}
