import { useState } from "react";
import { esTelefonoValido } from "~/lib/entrega";
import { MAX_NOMBRE, NOMBRE_LARGO } from "~/lib/auth/validacion";

type Props = {
  nombre: string;
  email: string;
  telefono: string;
};

// Mismos tokens y patrón de campo/error que `AccesoForm.tsx`: es el
// formulario que fija cómo se validan campos, cómo se pintan errores en
// teja y qué tokens de marca se usan en esta rama.
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

const fieldDeshabilitado: React.CSSProperties = {
  ...field,
  background: "var(--color-cream)",
  color: "var(--color-ink-muted)",
};

const errorTexto: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "var(--color-teja)",
};

const MENSAJE_GENERICO = "Algo ha fallado. Inténtalo de nuevo.";

// Mismos mensajes que el alta (`~/lib/auth/alta`) y el resto del sitio
// (`AccesoForm.tsx`): sería raro que el mismo dato tuviera dos textos de
// error distintos según dónde se edite.
function valida(nombre: string, telefono: string): Record<string, string> {
  const errores: Record<string, string> = {};
  if (!nombre.trim()) errores.nombre = "Dinos cómo te llamas.";
  else if (nombre.trim().length > MAX_NOMBRE) errores.nombre = NOMBRE_LARGO;
  if (!esTelefonoValido(telefono)) {
    errores.telefono = "Escribe un móvil o fijo español de nueve dígitos.";
  }
  return errores;
}

export default function CuentaDatos({
  nombre: nombreInicial,
  email,
  telefono: telefonoInicial,
}: Props) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [telefono, setTelefono] = useState(telefonoInicial);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (guardando) return;

    setErrorServidor(null);
    setGuardado(false);

    const erroresValidacion = valida(nombre, telefono);
    if (Object.keys(erroresValidacion).length) {
      setErrores(erroresValidacion);
      return;
    }
    setErrores({});
    setGuardando(true);

    try {
      const respuesta = await fetch("/api/cuenta/datos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nombre: nombre.trim(),
          telefono: telefono.trim(),
        }),
      });

      if (!respuesta.ok) {
        const cuerpo = await respuesta.json().catch(() => null);
        setErrorServidor(cuerpo?.error ?? MENSAJE_GENERICO);
        setGuardando(false);
        return;
      }

      setGuardando(false);
      setGuardado(true);
    } catch {
      setErrorServidor("No hemos podido conectar. Comprueba tu conexión.");
      setGuardando(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate style={{ maxWidth: "28rem" }}>
      <div>
        <label style={label} htmlFor="cd-email">
          Correo
        </label>
        <input
          id="cd-email"
          type="email"
          value={email}
          disabled
          readOnly
          style={fieldDeshabilitado}
        />
        <p
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--color-ink-muted)",
          }}
        >
          Es tu acceso a la cuenta: cambiarlo pide verificación y no se hace
          desde aquí.
        </p>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={label} htmlFor="cd-nombre">
          Nombre
        </label>
        <input
          id="cd-nombre"
          value={nombre}
          maxLength={MAX_NOMBRE}
          onChange={(e) => {
            setNombre(e.target.value);
            setGuardado(false);
          }}
          aria-invalid={!!errores.nombre}
          aria-describedby={errores.nombre ? "cd-nombre-error" : undefined}
          style={{
            ...field,
            borderColor: errores.nombre
              ? "var(--color-teja)"
              : "var(--color-avellana)",
          }}
        />
        {errores.nombre && (
          <p id="cd-nombre-error" role="alert" style={errorTexto}>
            {errores.nombre}
          </p>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={label} htmlFor="cd-telefono">
          Teléfono
        </label>
        <input
          id="cd-telefono"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={telefono}
          onChange={(e) => {
            setTelefono(e.target.value);
            setGuardado(false);
          }}
          aria-invalid={!!errores.telefono}
          aria-describedby={errores.telefono ? "cd-telefono-error" : undefined}
          placeholder="600123456"
          style={{
            ...field,
            borderColor: errores.telefono
              ? "var(--color-teja)"
              : "var(--color-avellana)",
          }}
        />
        {errores.telefono && (
          <p id="cd-telefono-error" role="alert" style={errorTexto}>
            {errores.telefono}
          </p>
        )}
      </div>

      {errorServidor && (
        <p
          role="alert"
          style={{
            marginTop: 16,
            padding: "0.75rem 1rem",
            border: "1px solid var(--color-teja)",
            color: "var(--color-teja)",
            fontSize: 13,
          }}
        >
          {errorServidor}
        </p>
      )}

      <button
        type="submit"
        className="btn btn-primario"
        disabled={guardando}
        style={{
          marginTop: 20,
          border: "none",
          opacity: guardando ? 0.6 : 1,
          cursor: guardando ? "not-allowed" : "pointer",
        }}
      >
        {guardando ? "Guardando…" : "Guardar cambios"}
      </button>

      {guardado && (
        <p
          role="status"
          style={{
            marginTop: 12,
            fontSize: 13,
            color: "var(--color-ink-muted)",
          }}
        >
          Guardado.
        </p>
      )}
    </form>
  );
}
