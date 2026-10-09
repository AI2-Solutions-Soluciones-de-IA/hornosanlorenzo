import { useEffect, useState } from "react";
import AccesoForm, { type ModoAcceso } from "~/islands/AccesoForm";

type Perfil = "particular" | "empresa";

const PERFILES: { id: Perfil; label: string; claim: string }[] = [
  {
    id: "particular",
    label: "Particulares",
    claim:
      "Para pedir en casa, con tu contacto guardado y sin repetirlo cada vez.",
  },
  {
    id: "empresa",
    label: "Empresas",
    claim: "Hostelería, oficinas y catering.",
  },
];

/**
 * El alta: Particulares / Empresas. Las dos crean la cuenta en el momento
 * con el mismo formulario; la de empresa añade razón social y CIF (antes
 * abría un correo, 9-10-2026). «¿Ya tienes cuenta? Entra» avisa a la página
 * con `onCambiarModo`.
 */
export default function AccesoClientes({
  onCambiarModo,
}: {
  onCambiarModo: (m: ModoAcceso) => void;
}) {
  // Particulares de serie: es lo que busca casi todo el que entra aquí.
  const [perfil, setPerfil] = useState<Perfil>("particular");

  // El sitio es estático: el parámetro solo se puede leer en cliente.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("perfil");
    if (p === "particular" || p === "empresa") setPerfil(p);
  }, []);

  function elegir(p: Perfil) {
    setPerfil(p);
    const url = new URL(window.location.href);
    url.searchParams.set("perfil", p);
    window.history.replaceState({}, "", url.toString());
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Tipo de cliente"
        style={{ display: "flex", flexWrap: "wrap", gap: 12 }}
      >
        {PERFILES.map((p) => {
          const activo = perfil === p.id;
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={activo}
              onClick={() => elegir(p.id)}
              style={{
                flex: "1 1 15rem",
                textAlign: "left",
                padding: "1.25rem",
                border: activo
                  ? "1px solid var(--color-caramelo)"
                  : "1px solid var(--color-line)",
                background: activo
                  ? "var(--color-caramelo)"
                  : "var(--color-leche)",
                color: activo ? "var(--color-leche)" : "var(--color-ink)",
                borderRadius: 0,
                cursor: "pointer",
                font: "inherit",
              }}
            >
              <span
                style={{
                  display: "block",
                  fontFamily: "var(--font-display)",
                  fontSize: "1.375rem",
                }}
              >
                {p.label}
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 6,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: activo
                    ? "var(--color-latte)"
                    : "var(--color-ink-muted)",
                }}
              >
                {p.claim}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cada alta, centrada: título, texto y formulario (9-10-2026). */}
      {perfil === "particular" && (
        <div style={{ marginTop: 32, textAlign: "center" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.75rem",
              margin: 0,
            }}
          >
            Alta de particular.
          </h2>
          <p
            style={{
              marginTop: 12,
              maxWidth: "34rem",
              marginInline: "auto",
              color: "var(--color-ink-muted)",
            }}
          >
            Déjanos tu contacto y te damos de alta. No hace falta cuenta para
            comprar: en la tienda online puedes pagar directamente, sin
            registrarte.
          </p>
          <div style={{ marginTop: 24, textAlign: "left" }}>
            <AccesoForm modo="registro" onCambiarModo={onCambiarModo} />
          </div>
        </div>
      )}

      {perfil === "empresa" && (
        <div style={{ marginTop: 32, textAlign: "center" }}>
          <h2
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "1.75rem",
              margin: 0,
            }}
          >
            Alta de empresa.
          </h2>
          <p
            style={{
              marginTop: 12,
              maxWidth: "34rem",
              marginInline: "auto",
              color: "var(--color-ink-muted)",
            }}
          >
            Crea la cuenta con los datos de tu empresa, como un particular pero
            con la razón social y el CIF. Después te asignamos tus condiciones
            y facturamos a mes vencido.{" "}
            <a href="/a-quien-servimos" style={{ textDecoration: "underline" }}>
              Ver condiciones para empresas
            </a>
            .
          </p>
          <div style={{ marginTop: 24, textAlign: "left" }}>
            <AccesoForm modo="registro" perfil="empresa" onCambiarModo={onCambiarModo} />
          </div>
        </div>
      )}
    </div>
  );
}
