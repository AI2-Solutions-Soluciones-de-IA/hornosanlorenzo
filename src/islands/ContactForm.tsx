import { useState } from "react";
import { site } from "~/data/site";

type Props = {
  /** "empresa" añade razón social y CIF; "particular" es el alta de cliente. */
  variant?: "general" | "empresa" | "particular";
};

export default function ContactForm({ variant = "general" }: Props) {
  const isEmpresa = variant === "empresa";
  const isParticular = variant === "particular";
  const [company, setCompany] = useState("");
  const [cif, setCif] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [accepted, setAccepted] = useState(false);

  const canSend =
    name.trim() &&
    email.includes("@") &&
    // Las altas (particular y empresa) no piden mensaje: con los datos basta.
    // La de particular pide además el teléfono.
    (isParticular ? phone.trim() !== "" : isEmpresa || message.trim().length >= 10) &&
    accepted &&
    (!isEmpresa || (company.trim() !== "" && cif.trim() !== ""));

  function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSend) return;
    const header = isEmpresa
      ? `Empresa: ${company}\nCIF: ${cif}\n`
      : "";
    const body = `${header}Nombre: ${name}\nEmail: ${email}\nTeléfono: ${phone}\n\n${message}`;
    const subject = isEmpresa
      ? `Alta de empresa — ${company}`
      : isParticular
        ? `Alta de particular — ${name}`
        : `Consulta desde la web — ${name}`;
    window.location.href = `mailto:${site.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  const inputStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "0.75rem 1rem",
    border: "1px solid var(--color-line)",
    borderRadius: 0,
    fontSize: 14,
    fontFamily: "inherit",
    marginTop: 6,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.18em",
    color: "var(--color-ink-muted)",
    fontWeight: 600,
  };

  return (
    <form onSubmit={send} style={{ display: "grid", gap: 16, maxWidth: 540 }}>
      {isEmpresa && (
        <>
          <div>
            <label style={labelStyle} htmlFor="cn-company">
              Razón social *
            </label>
            <input
              id="cn-company"
              required
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="cn-cif">
              CIF *
            </label>
            <input
              id="cn-cif"
              required
              value={cif}
              onChange={(e) => setCif(e.target.value)}
              style={inputStyle}
            />
          </div>
        </>
      )}
      <div>
        <label style={labelStyle} htmlFor="cn-name">
          {isEmpresa ? "Persona de contacto *" : "Nombre *"}
        </label>
        <input
          id="cn-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="cn-email">
          Email *
        </label>
        <input
          id="cn-email"
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={labelStyle} htmlFor="cn-phone">
          Teléfono {isParticular && "*"}
        </label>
        <input
          id="cn-phone"
          type="tel"
          required={isParticular}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={inputStyle}
        />
      </div>
      {!isEmpresa && (
        <div>
          <label style={labelStyle} htmlFor="cn-msg">
            {isParticular ? "Algo que debamos saber (opcional)" : "Mensaje *"}
          </label>
          <textarea
            id="cn-msg"
            required={!isParticular}
            rows={isParticular ? 3 : 5}
            minLength={isParticular ? undefined : 10}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ ...inputStyle, borderRadius: 0 }}
          />
        </div>
      )}
      <label
        style={{
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
          fontSize: 13,
          color: "var(--color-ink-muted)",
        }}
      >
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          required
          style={{ marginTop: 4 }}
        />
        <span>
          He leído la{" "}
          <a href="/legal/privacidad" style={{ textDecoration: "underline" }}>
            política de privacidad
          </a>{" "}
          y acepto el tratamiento de mis datos para responder a mi consulta.
        </span>
      </label>
      <button
        type="submit"
        disabled={!canSend}
        style={{
          background: canSend ? "var(--color-caramelo)" : "var(--color-ink-muted)",
          color: "var(--color-leche)",
          border: "none",
          padding: "0.875rem 1.5rem",
          borderRadius: 0,
          fontSize: 15,
          fontWeight: 700,
          cursor: canSend ? "pointer" : "not-allowed",
        }}
      >
        {isEmpresa || isParticular ? "Solicitar alta" : "Enviar"}
      </button>
      <p
        style={{
          fontSize: 12,
          color: "var(--color-ink-muted)",
          fontStyle: "italic",
        }}
      >
        Al enviar se abrirá tu app de correo con el mensaje preparado. También
        puedes escribir directamente a {site.email}.
      </p>
    </form>
  );
}
