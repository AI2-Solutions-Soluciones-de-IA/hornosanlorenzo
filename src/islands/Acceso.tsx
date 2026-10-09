import { useEffect, useState } from "react";
import AccesoForm, { type ModoAcceso } from "~/islands/AccesoForm";
import AccesoClientes from "~/islands/AccesoClientes";

/**
 * `/acceso`. Dos caras según de dónde se llegue (petición de Oscar,
 * 30-9-2026):
 * - «Entrar» (sin parámetro): solo «Entra.» y el formulario de entrar.
 * - «Regístrate» (`?modo=registro`): la página del alta como estaba,
 *   con «¿Cómo nos compras?» y Particulares / Empresas.
 * El modo se lee en cliente (el sitio público no lee parámetros en servidor)
 * y se guarda en la URL al cambiarlo, para que recargar no lo pierda.
 */
export default function Acceso() {
  const [modo, setModo] = useState<ModoAcceso>("entrar");

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("modo") === "registro") setModo("registro");
  }, []);

  function cambiarModo(m: ModoAcceso) {
    setModo(m);
    const url = new URL(window.location.href);
    if (m === "registro") url.searchParams.set("modo", "registro");
    else {
      url.searchParams.delete("modo");
      url.searchParams.delete("perfil");
    }
    window.history.replaceState({}, "", url.toString());
    window.scrollTo({ top: 0 });
  }

  if (modo === "entrar") {
    return (
      <div className="text-center">
        <h1 className="text-4xl sm:text-5xl">Entra.</h1>
        <p className="text-[color:var(--color-ink-muted)] mt-3 max-w-xl mx-auto">
          Entra con tu correo y tu contraseña. No hace falta cuenta para
          comprar: en la tienda online puedes pagar directamente, sin
          registrarte.
        </p>
        <div className="mt-8 text-left">
          <AccesoForm modo="entrar" onCambiarModo={cambiarModo} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="numeracion">Acceso clientes</p>
      <h1 className="text-4xl sm:text-5xl mt-2">¿Cómo nos compras?</h1>
      <p className="text-[color:var(--color-ink-muted)] mt-3 max-w-xl">
        El alta no es la misma para una casa que para una cocina que pide cada
        semana. Dinos cuál eres.
      </p>
      <div className="mt-8">
        <AccesoClientes onCambiarModo={cambiarModo} />
      </div>
    </div>
  );
}
