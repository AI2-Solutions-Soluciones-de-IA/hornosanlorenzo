import { useEffect, useRef, useState } from "react";

const CADA_MS = 20_000;
const CLAVE_SONIDO = "hsl-pedidos-sonido";
/** Cuántos pedidos había la última vez que se abrió Pedidos en este navegador. */
const CLAVE_VISTOS = "hsl-pedidos-vistos";

/** Un «ding» corto con el propio navegador, sin fichero de audio. */
function ding() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.65);
  } catch {
    // Sin audio (navegador antiguo o bloqueado): el aviso escrito basta.
  }
}

/**
 * Aviso de pedidos nuevos en el panel (9-10-2026). Dos avisos:
 * - Al abrir Pedidos: los que han entrado desde la última visita en este
 *   navegador, con la marca «Nuevo» en la lista (solo sin filtros y en la
 *   primera página, donde salen los más recientes arriba).
 * - Con la página abierta: cada 20 s, con la pestaña visible, pregunta
 *   cuántos hay; si son más, «Han entrado N pedidos nuevos · Ver», el número
 *   en el título de la pestaña y, si se ha activado, un sonido. No mueve la
 *   lista: se ve al pulsar «Ver».
 */
export default function PedidosNuevos({ inicial, marcables }: { inicial: number; marcables: boolean }) {
  const [nuevos, setNuevos] = useState(0);
  const [desdeVisita, setDesdeVisita] = useState(0);
  const [sonido, setSonido] = useState(false);
  const avisados = useRef(0);
  const tituloBase = useRef("");

  useEffect(() => {
    tituloBase.current = document.title;
    try {
      setSonido(localStorage.getItem(CLAVE_SONIDO) === "1");
      const vistos = Number(localStorage.getItem(CLAVE_VISTOS) ?? NaN);
      // La primera vez en este navegador no hay con qué comparar.
      if (Number.isFinite(vistos) && inicial > vistos) {
        const n = inicial - vistos;
        setDesdeVisita(n);
        if (marcables) {
          document.querySelectorAll<HTMLElement>("[data-pedido]").forEach((li, i) => {
            if (i >= n || li.querySelector("[data-marca-nuevo]")) return;
            const marca = document.createElement("span");
            marca.dataset.marcaNuevo = "";
            marca.textContent = "Nuevo";
            marca.className =
              "inline-block mb-2 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] bg-[color:var(--color-teja)] text-[color:var(--color-leche)]";
            li.prepend(marca);
          });
        }
      }
      localStorage.setItem(CLAVE_VISTOS, String(Math.max(inicial, Number.isFinite(vistos) ? vistos : 0)));
    } catch {}
  }, [inicial, marcables]);

  useEffect(() => {
    let parado = false;
    async function mira() {
      if (document.hidden) return;
      try {
        const r = await fetch("/api/admin/pedidos/nuevos", { cache: "no-store" });
        if (!r.ok) return;
        const { total } = (await r.json()) as { total: number };
        if (parado) return;
        setNuevos(Math.max(0, total - inicial));
        // No se apunta como visto: lo será al pulsar «Ver», que recarga.
      } catch {
        // Sin conexión un rato: se vuelve a mirar en el siguiente minuto.
      }
    }
    const t = window.setInterval(mira, CADA_MS);
    // Al volver a la pestaña, se mira en el momento.
    const alVolver = () => !document.hidden && mira();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      parado = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [inicial]);

  useEffect(() => {
    document.title = nuevos > 0 ? `(${nuevos}) ${tituloBase.current}` : tituloBase.current;
    if (nuevos > avisados.current && sonido) ding();
    avisados.current = nuevos;
  }, [nuevos, sonido]);

  function cambiaSonido(v: boolean) {
    setSonido(v);
    try {
      localStorage.setItem(CLAVE_SONIDO, v ? "1" : "0");
    } catch {}
    // Un primer sonido al activarlo: los navegadores solo dejan sonar tras un clic.
    if (v) ding();
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      {nuevos > 0 ? (
        <p
          role="status"
          className="flex-1 border border-[color:var(--color-teja)] bg-[color:var(--color-latte)] px-4 py-3 text-sm font-semibold"
        >
          {nuevos === 1 ? "Ha entrado 1 pedido nuevo." : `Han entrado ${nuevos} pedidos nuevos.`}{" "}
          <a href="/admin/pedidos" className="underline underline-offset-4 text-[color:var(--color-teja)]">
            Ver
          </a>
        </p>
      ) : desdeVisita > 0 ? (
        <p
          role="status"
          className="flex-1 border border-[color:var(--color-teja)] bg-[color:var(--color-latte)] px-4 py-3 text-sm font-semibold"
        >
          {desdeVisita === 1
            ? "Ha entrado 1 pedido desde tu última visita"
            : `Han entrado ${desdeVisita} pedidos desde tu última visita`}
          {marcables ? ": van marcados como «Nuevo»." : "."}
        </p>
      ) : (
        <p className="text-xs text-[color:var(--color-ink-muted)]">
          La lista mira cada 20 segundos si han entrado pedidos nuevos.
        </p>
      )}
      <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-muted)]">
        <input type="checkbox" checked={sonido} onChange={(e) => cambiaSonido(e.target.checked)} />
        Avisar con sonido
      </label>
    </div>
  );
}
