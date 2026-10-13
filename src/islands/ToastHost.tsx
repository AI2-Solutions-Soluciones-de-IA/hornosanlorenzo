import { useEffect, useState } from "react";

const TOAST_EVENT = "hsl-toast";

/** `aviso`: algo no se ha hecho del todo (un límite); dura más para leerlo. */
type Toast = { id: number; message: string; aviso?: boolean };

export function emitToast(message: string, { aviso = false } = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<{ message: string; aviso: boolean }>(TOAST_EVENT, {
      detail: { message, aviso },
    }),
  );
}

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ message: string; aviso?: boolean }>;
      const id = Date.now() + Math.random();
      const { message, aviso } = ce.detail;
      setToasts((prev) => [...prev, { id, message, aviso }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, aviso ? 7000 : 2800);
    };
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "fixed",
        bottom: "1rem",
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.5rem",
        pointerEvents: "none",
        zIndex: 60,
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            background: "var(--color-ink)",
            color: "var(--color-cream)",
            padding: "0.75rem 1.25rem",
            borderRadius: 0,
            boxShadow: "var(--shadow-toast)",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.625rem",
            fontSize: 14,
            maxWidth: "min(36rem, calc(100vw - 2rem))",
            animation: "hsl-toast-in .25s ease-out both",
          }}
        >
          <span
            style={{
              flexShrink: 0,
              background: t.aviso ? "var(--color-caramelo)" : "var(--color-wa)",
              color: "white",
              width: 22,
              height: 22,
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontWeight: 900,
            }}
          >
            {t.aviso ? "!" : "✓"}
          </span>
          {t.message}
        </div>
      ))}
      <style>{`
        @keyframes hsl-toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
