import { useEffect, useState } from "react";
import { authClient } from "~/lib/auth/cliente";
import { rutaDeVuelta } from "~/lib/reanudar-checkout";
import {
  MAX_NOMBRE,
  MIN_PASSWORD,
  validaEntrada,
  validaRegistro,
} from "~/lib/auth/validacion";

type Modo = "entrar" | "registro";

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

const errorTexto: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "var(--color-teja)",
};

const enlaceComoBoton: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  fontWeight: 600,
  color: "var(--color-caramelo)",
  textDecoration: "underline",
  cursor: "pointer",
};

const MENSAJE_GENERICO = "Algo ha fallado. Inténtalo de nuevo.";

/**
 * Traducciones fijas para los códigos de error que puede devolver el
 * servidor. Es una lista cerrada a propósito: el texto de Better Auth viene
 * en inglés, y cualquier código que no esté aquí cae en el mensaje genérico
 * en vez de volcarse tal cual — nunca debe llegarle a alguien un mensaje en
 * inglés de la librería.
 *
 * Cuando las credenciales no valen, el mensaje es siempre el mismo tanto si
 * el correo no existe como si la contraseña es incorrecta: decir cuál de los
 * dos ha fallado le regala a cualquiera una forma de averiguar qué correos
 * están dados de alta en la tienda.
 */
const MENSAJES_ERROR: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  USER_ALREADY_EXISTS: "Ya hay una cuenta con este correo.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya hay una cuenta con este correo.",
  // El formulario ya valida esto antes de enviar; el servidor lo repite por
  // si alguien llama al endpoint sin pasar por aquí.
  INVALID_NAME: "Dinos cómo te llamas.",
  INVALID_PHONE: "Escribe un móvil o fijo español de nueve dígitos.",
};

function mensajeDeError(error: { code?: string } | null): string {
  if (!error?.code) return MENSAJE_GENERICO;
  return MENSAJES_ERROR[error.code] ?? MENSAJE_GENERICO;
}

export type { Modo as ModoAcceso };

/**
 * El formulario de entrar o darse de alta. Si la página le pasa `modo` y
 * `onCambiarModo`, el modo lo lleva la página (en `/acceso`, «Entrar» y
 * «Regístrate» enseñan cosas distintas alrededor del formulario); si no, lo
 * lleva el propio formulario, como antes.
 */
export default function AccesoForm({
  modo: modoFuera,
  onCambiarModo,
}: {
  modo?: Modo;
  onCambiarModo?: (m: Modo) => void;
} = {}) {
  const [modoPropio, setModoPropio] = useState<Modo>("entrar");
  const modo = modoFuera ?? modoPropio;
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [password, setPassword] = useState("");
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [contrasenaRecuperada, setContrasenaRecuperada] = useState(false);

  const esRegistro = modo === "registro";

  // El sitio es estático: el parámetro solo se puede leer en cliente. Llega
  // aquí tras cambiar la contraseña en `/acceso/nueva-contrasena`.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("recuperada") === "1") setContrasenaRecuperada(true);
    // El botón «Regístrate» de la cabecera abre directamente el alta
    // (si el modo lo lleva la página, lo lee ella).
    if (!modoFuera && p.get("modo") === "registro") setModoPropio("registro");
  }, []);

  function cambiarModo(m: Modo) {
    if (onCambiarModo) onCambiarModo(m);
    else setModoPropio(m);
    setErrores({});
    setErrorServidor(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;

    setErrorServidor(null);

    const resultado = esRegistro
      ? validaRegistro({ nombre, email, telefono, password })
      : validaEntrada({ email, password });

    if (!resultado.ok) {
      setErrores(resultado.errores);
      return;
    }
    setErrores({});
    setEnviando(true);

    try {
      if (esRegistro) {
        const { error } = await authClient.signUp.email({
          email: email.trim(),
          password,
          name: nombre.trim(),
          telefono: telefono.trim(),
        });
        if (error) {
          setErrorServidor(mensajeDeError(error));
          setEnviando(false);
          return;
        }
      } else {
        const { error } = await authClient.signIn.email({
          email: email.trim(),
          password,
        });
        if (error) {
          setErrorServidor(mensajeDeError(error));
          setEnviando(false);
          return;
        }
      }
      // Desde el checkout llega `?volver=/carrito`: se regresa allí, no a la cuenta.
      window.location.href = rutaDeVuelta(
        new URLSearchParams(window.location.search).get("volver"),
      );
    } catch {
      setErrorServidor("No hemos podido conectar. Comprueba tu conexión.");
      setEnviando(false);
    }
  }

  return (
    <>
      <form onSubmit={onSubmit} noValidate style={{ maxWidth: "28rem" }}>
        {!esRegistro && contrasenaRecuperada && (
          <p
            role="status"
            style={{
              marginBottom: 16,
              padding: "0.75rem 1rem",
              border: "1px solid var(--color-avellana)",
              color: "var(--color-ink-muted)",
              fontSize: 13,
            }}
          >
            Contraseña cambiada. Ya puedes entrar con ella.
          </p>
        )}

        {esRegistro && (
          <div>
            <label style={label} htmlFor="af-nombre">
              Nombre
            </label>
            <input
              id="af-nombre"
              value={nombre}
              maxLength={MAX_NOMBRE}
              onChange={(e) => setNombre(e.target.value)}
              aria-invalid={!!errores.nombre}
              aria-describedby={errores.nombre ? "af-nombre-error" : undefined}
              placeholder="Cómo te llamamos"
              style={{
                ...field,
                borderColor: errores.nombre
                  ? "var(--color-teja)"
                  : "var(--color-avellana)",
              }}
            />
            {errores.nombre && (
              <p id="af-nombre-error" role="alert" style={errorTexto}>
                {errores.nombre}
              </p>
            )}
          </div>
        )}

        <div style={{ marginTop: esRegistro ? 16 : 0 }}>
          <label style={label} htmlFor="af-email">
            Correo
          </label>
          <input
            id="af-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!errores.email}
            aria-describedby={errores.email ? "af-email-error" : undefined}
            placeholder="tu@correo.com"
            style={{
              ...field,
              borderColor: errores.email
                ? "var(--color-teja)"
                : "var(--color-avellana)",
            }}
          />
          {errores.email && (
            <p id="af-email-error" role="alert" style={errorTexto}>
              {errores.email}
            </p>
          )}
        </div>

        {esRegistro && (
          <div style={{ marginTop: 16 }}>
            <label style={label} htmlFor="af-telefono">
              Teléfono
            </label>
            <input
              id="af-telefono"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              aria-invalid={!!errores.telefono}
              aria-describedby={
                errores.telefono ? "af-telefono-error" : undefined
              }
              placeholder="600123456"
              style={{
                ...field,
                borderColor: errores.telefono
                  ? "var(--color-teja)"
                  : "var(--color-avellana)",
              }}
            />
            {errores.telefono && (
              <p id="af-telefono-error" role="alert" style={errorTexto}>
                {errores.telefono}
              </p>
            )}
          </div>
        )}

        <div style={{ marginTop: 16 }}>
          <label style={label} htmlFor="af-password">
            Contraseña
          </label>
          <input
            id="af-password"
            type="password"
            autoComplete={esRegistro ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!errores.password}
            aria-describedby={
              errores.password ? "af-password-error" : undefined
            }
            placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
            style={{
              ...field,
              borderColor: errores.password
                ? "var(--color-teja)"
                : "var(--color-avellana)",
            }}
          />
          {errores.password && (
            <p id="af-password-error" role="alert" style={errorTexto}>
              {errores.password}
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
          disabled={enviando}
          style={{
            width: "100%",
            marginTop: 20,
            border: "none",
            opacity: enviando ? 0.6 : 1,
            cursor: enviando ? "not-allowed" : "pointer",
          }}
        >
          {enviando
            ? esRegistro
              ? "Creando la cuenta…"
              : "Entrando…"
            : esRegistro
              ? "Crear cuenta"
              : "Entrar"}
        </button>

        {!esRegistro && (
          <p style={{ marginTop: 12, fontSize: 13, textAlign: "center" }}>
            <a
              href="/acceso/recuperar"
              style={{
                color: "var(--color-ink-muted)",
                textDecoration: "underline",
              }}
            >
              ¿Has olvidado tu contraseña?
            </a>
          </p>
        )}

        <p
          style={{
            marginTop: esRegistro ? 20 : 8,
            fontSize: 13,
            textAlign: "center",
          }}
        >
          {esRegistro ? (
            <>
              ¿Ya tienes cuenta?{" "}
              <button
                type="button"
                onClick={() => cambiarModo("entrar")}
                style={enlaceComoBoton}
              >
                Entra
              </button>
            </>
          ) : (
            <>
              ¿No tienes cuenta?{" "}
              <button
                type="button"
                onClick={() => cambiarModo("registro")}
                style={enlaceComoBoton}
              >
                Regístrate
              </button>
            </>
          )}
        </p>
      </form>
    </>
  );
}
