import { useEffect, useState } from "react";

const KEY = "hsl-cookie-consent";
const CONSENT_EVENT = "hsl-cookie-consent-change";

type Consent = "accepted" | "rejected" | null;

export function getConsent(): Consent {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return v === "accepted" || v === "rejected" ? v : null;
}

export default function CookieBanner() {
  const [consent, setConsent] = useState<Consent>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setConsent(getConsent());
    setMounted(true);
  }, []);

  function decide(value: "accepted" | "rejected") {
    window.localStorage.setItem(KEY, value);
    setConsent(value);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
  }

  if (!mounted || consent !== null) return null;

  return (
    <div
      role="region"
      aria-label="Aviso de cookies"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "var(--color-ink)",
        color: "var(--color-cream)",
        padding: "1rem",
        zIndex: 70,
        boxShadow: "0 -8px 24px rgba(0,0,0,.15)",
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 14,
        }}
      >
        <p style={{ margin: 0, maxWidth: "60ch" }}>
          Usamos cookies técnicas (carrito) y, si lo aceptas, mapas de Google.
          Las analíticas son anónimas.{" "}
          <a href="/legal/cookies" style={{ textDecoration: "underline" }}>
            Más info
          </a>
          .
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => decide("rejected")}
            style={{
              border: "1px solid var(--color-cream)",
              background: "transparent",
              color: "var(--color-cream)",
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-boton)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Rechazar
          </button>
          <button
            onClick={() => decide("accepted")}
            style={{
              border: "none",
              background: "var(--color-cream)",
              color: "var(--color-hot)",
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-boton)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}

export const COOKIE_CONSENT_EVENT = CONSENT_EVENT;
