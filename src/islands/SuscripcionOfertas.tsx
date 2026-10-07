import { useState } from "react";

/**
 * Formulario de Este mes para recibir las ofertas por correo. Alta directa
 * (sin correo de confirmación) con casilla de consentimiento obligatoria.
 * El campo `web` es una trampa para bots: va oculto y una persona lo deja
 * vacío.
 */
export default function SuscripcionOfertas() {
  const [email, setEmail] = useState("");
  const [acepto, setAcepto] = useState(false);
  const [web, setWeb] = useState("");
  const [estado, setEstado] = useState<"" | "enviando" | "hecho">("");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (estado === "enviando") return;
    setError(null);
    if (!acepto) {
      setError("Marca la casilla para poder enviarte las ofertas.");
      return;
    }
    setEstado("enviando");
    try {
      const r = await fetch("/api/suscripcion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, acepto, web }),
      });
      const datos = await r.json().catch(() => null);
      if (!r.ok) {
        setError(datos?.error ?? "No hemos podido apuntarte. Inténtalo de nuevo.");
        setEstado("");
        return;
      }
      setMensaje(datos?.mensaje ?? "¡Listo!");
      setEstado("hecho");
    } catch {
      setError("No hemos podido conectar. Comprueba tu conexión.");
      setEstado("");
    }
  }

  if (estado === "hecho")
    return (
      <p role="status" className="text-lg font-[family-name:var(--font-display)]">
        {mensaje}
      </p>
    );

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-2">
      <div className="flex flex-col sm:flex-row gap-3">
        <label htmlFor="susc-email" className="sr-only">
          Tu correo
        </label>
        <input
          id="susc-email"
          type="email"
          required
          autoComplete="email"
          placeholder="tu@correo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 min-h-12 border border-[color:var(--color-avellana)] bg-[color:var(--color-paper)] px-4 text-base"
        />
        <button type="submit" className="btn btn-primario" disabled={estado === "enviando"}>
          {estado === "enviando" ? "Apuntando…" : "Quiero las ofertas"}
        </button>
      </div>
      <input
        type="text"
        name="web"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={web}
        onChange={(e) => setWeb(e.target.value)}
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
      />
      <label className="flex gap-2 items-start text-xs leading-snug text-[color:var(--color-ink-muted)]">
        <input
          type="checkbox"
          checked={acepto}
          onChange={(e) => setAcepto(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <span>
          Quiero recibir por correo las ofertas de Horno San Lorenzo. Puedo darme de baja cuando
          quiera desde cualquier correo. Más información en la{" "}
          <a href="/legal/privacidad" className="underline">
            política de privacidad
          </a>
          .
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-[color:var(--color-teja)]">
          {error}
        </p>
      )}
    </form>
  );
}
