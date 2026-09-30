import { useEffect, useState } from "react";
import type {
  PackAdmin,
  Problema,
  RespuestaGetPacks,
  RespuestaGuardarPack,
} from "~/lib/admin-packs-api";
import { formatPriceCents } from "~/lib/format";
import EditorPack from "./admin-packs/EditorPack";
import {
  botonLinea,
  insignia,
  MENSAJE_GENERICO,
  SIN_CONEXION,
} from "./admin-packs/comunes";

/**
 * La sección Packs del panel: la lista y, al pulsar «Editar» o «Nuevo pack»,
 * el editor (`admin-packs/EditorPack`). Lee y guarda por `/api/admin/packs`.
 */
type Vista = { tipo: "lista" } | { tipo: "editor"; slug: string | null };

export default function AdminPacks() {
  const [datos, setDatos] = useState<RespuestaGetPacks | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>({ tipo: "lista" });
  const [aviso, setAviso] = useState<{
    mensaje: string;
    avisos: Problema[];
  } | null>(null);
  // Cambia tras cada guardado para que el editor arranque de lo que quedó guardado.
  const [version, setVersion] = useState(0);

  async function cargar(): Promise<RespuestaGetPacks | null> {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/packs");
      const cuerpo = await res.json().catch(() => null);
      if (!res.ok || !cuerpo?.packs) {
        setError(cuerpo?.error ?? MENSAJE_GENERICO);
        return null;
      }
      setDatos(cuerpo as RespuestaGetPacks);
      return cuerpo as RespuestaGetPacks;
    } catch {
      setError(SIN_CONEXION);
      return null;
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargar();
  }, []);

  async function onGuardado(r: RespuestaGuardarPack, creado: boolean) {
    await cargar();
    setAviso({
      mensaje: creado
        ? "Pack creado. En la web se ve en unos segundos."
        : "Guardado. En la web se ve en unos segundos.",
      avisos: r.avisos,
    });
    setVersion((v) => v + 1);
    // Al crear, se sigue editando el pack recién creado.
    setVista({ tipo: "editor", slug: r.slug });
    window.scrollTo({ top: 0 });
  }

  function abrir(slug: string | null) {
    setAviso(null);
    setVista({ tipo: "editor", slug });
    window.scrollTo({ top: 0 });
  }

  if (!datos) {
    return (
      <div>
        {cargando ? (
          <p style={{ color: "var(--color-ink-muted)" }}>Cargando los packs…</p>
        ) : (
          <>
            <p role="alert" style={{ color: "var(--color-caramelo)" }}>
              {error ?? MENSAJE_GENERICO}
            </p>
            <button
              type="button"
              style={{ ...botonLinea, marginTop: 8 }}
              onClick={() => cargar()}
            >
              Reintentar
            </button>
          </>
        )}
      </div>
    );
  }

  if (vista.tipo === "editor") {
    const pack = vista.slug
      ? (datos.packs.find((p) => p.slug === vista.slug) ?? null)
      : null;
    if (vista.slug && !pack) {
      return (
        <div>
          <p role="alert">Ese pack ya no está en la lista.</p>
          <button
            type="button"
            style={{ ...botonLinea, marginTop: 8 }}
            onClick={() => setVista({ tipo: "lista" })}
          >
            ← Todos los packs
          </button>
        </div>
      );
    }
    return (
      <EditorPack
        key={`${vista.slug ?? "nuevo"}-${version}`}
        pack={pack}
        carta={datos.carta}
        aviso={aviso}
        onGuardado={onGuardado}
        onVolver={() => {
          setAviso(null);
          setVista({ tipo: "lista" });
        }}
      />
    );
  }

  const packs = [...datos.packs].sort(
    (a, b) => a.orden - b.orden || a.name.localeCompare(b.name, "es"),
  );

  return (
    <div>
      {error && (
        <p
          role="alert"
          style={{
            marginBottom: 16,
            color: "var(--color-caramelo)",
            fontSize: 13,
          }}
        >
          {error}
        </p>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="btn btn-primario"
          style={{ border: "none" }}
          onClick={() => abrir(null)}
        >
          Nuevo pack
        </button>
        <p className="numeracion" style={{ color: "var(--color-ink-muted)" }}>
          {packs.length} {packs.length === 1 ? "pack" : "packs"}
        </p>
      </div>

      {packs.length === 0 && (
        <p style={{ marginTop: 16, color: "var(--color-ink-muted)" }}>
          Todavía no hay ningún pack.
        </p>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
        {packs.map((p) => (
          <FilaPack key={p.slug} p={p} onEditar={() => abrir(p.slug)} />
        ))}
      </ul>
    </div>
  );
}

function Dato({
  nombre,
  children,
}: {
  nombre: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ minWidth: 76 }}>
      <p
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          color: "var(--color-ink-muted)",
        }}
      >
        {nombre}
      </p>
      <p style={{ marginTop: 2, fontWeight: 600, fontSize: 14 }}>{children}</p>
    </div>
  );
}

function FilaPack({ p, onEditar }: { p: PackAdmin; onEditar: () => void }) {
  return (
    <li
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
      <div style={{ flex: "1 1 220px" }}>
        <p className="numeracion">{p.definicion.ocasion || "Pack"}</p>
        <p style={{ marginTop: 4, fontWeight: 600 }}>{p.name}</p>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Dato nombre="Precio">{formatPriceCents(p.priceCents)}</Dato>
        <Dato nombre="Suelto">
          {p.sueltoCents !== null ? formatPriceCents(p.sueltoCents) : "—"}
        </Dato>
        <Dato nombre="Ahorro">
          {p.ahorroPct !== null ? (
            `${p.ahorroPct} %`
          ) : (
            <span style={{ color: "var(--color-ink)", fontWeight: 400 }}>
              sin ahorro
            </span>
          )}
        </Dato>
        <Dato nombre="Personas">
          {p.definicion.personas.texto ||
            `${p.definicion.personas.min}–${p.definicion.personas.max}`}
        </Dato>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        {p.activo ? (
          <span
            style={{
              ...insignia,
              borderColor: "var(--color-avellana)",
              color: "var(--color-ink-muted)",
            }}
          >
            Activo
          </span>
        ) : (
          <span style={insignia}>Desactivado</span>
        )}
        {p.agotado && <span style={insignia}>Agotado</span>}
      </div>

      <button
        type="button"
        onClick={onEditar}
        style={botonLinea}
        aria-label={`Editar ${p.name}`}
      >
        Editar
      </button>
    </li>
  );
}
