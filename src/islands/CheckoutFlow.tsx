import { useEffect, useMemo, useRef, useState } from "react";
import { stores, type StoreId } from "~/data/stores";
import { formatPriceCents, formatDateISO } from "~/lib/format";
import {
  MODE_COPY,
  DOS_DIAS_DESDE_CENTS,
  DOS_DIAS_COPY,
  earliestDate,
  earliestSelectableDate,
  fromISO,
  isClosed,
  toISO,
  type DeliveryMode,
  ENTREGA_DOMICILIO_COPY,
  ZONA_REPARTO_COPY,
  admiteCP,
  municipioDeCP,
  esTelefonoValido,
  minimoPedidoCents,
  MIN_ORDER_COPY,
  franjasRecogida,
  type Franja,
  RECOGIDA_MISMO_DIA_DESDE,
  isDateAllowed,
  meetsMinimum,
} from "~/lib/entrega";
import {
  aparcarCheckout,
  VOLVER_AL_CARRITO,
  type CheckoutAparcado,
} from "~/lib/reanudar-checkout";
import type { Cart } from "~/lib/cart";

type Step = "dia" | "opcion" | "direccion" | "tienda" | "resumen";

/**
 * Misma forma que `Direccion` de `~/lib/db/direcciones`, redefinida aquí en
 * vez de importada: ese módulo arrastra `~/lib/db/pool` (Postgres), que no
 * tiene sentido meter en el bundle de una isla de cliente. Es el mismo
 * patrón que ya usa `CuentaDirecciones.tsx`.
 */
export type Direccion = {
  id: string;
  alias: string;
  calle: string;
  postalCode: string;
  predeterminada: boolean;
};

/** Lo que trae quien tiene sesión, calculado en `carrito.astro`. */
export type Prefill = {
  nombre: string;
  email: string;
  telefono: string;
  direcciones: Direccion[];
};

type Props = {
  cart: Cart;
  totalCents: number;
  onClose: () => void;
  /** Sin sesión llega `undefined`: el checkout de invitado no cambia. */
  prefill?: Prefill;
  /** Lo elegido antes de ir a entrar con «Ya soy cliente», para seguir ahí. */
  reanudar?: CheckoutAparcado | null;
};

/** Valor del selector de direcciones cuando toca escribir una a mano. */
const OTRA_DIRECCION = "otra";

const WEEKDAYS = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

/** Lunes de la semana en la que cae el día 1 del mes. */
function monthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // 0 = lunes
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

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

export default function CheckoutFlow({
  cart,
  totalCents,
  onClose,
  prefill,
  reanudar,
}: Props) {
  // De vuelta del login se sigue en la dirección, con el día ya elegido. Si
  // ese día ha dejado de valer mientras tanto, se vuelve a pedir.
  const [inicio] = useState(() => {
    if (reanudar?.mode !== "domicilio") {
      return {
        step: "opcion" as Step,
        history: [] as Step[],
        mode: null,
        dateISO: "",
      };
    }
    const sigueValiendo =
      isDateAllowed("domicilio", reanudar.dateISO, new Date(), {
        subtotalCents: totalCents,
      }) && meetsMinimum("domicilio", totalCents, reanudar.dateISO);
    return sigueValiendo
      ? {
          step: "direccion" as Step,
          history: ["opcion", "dia"] as Step[],
          mode: "domicilio" as const,
          dateISO: reanudar.dateISO,
        }
      : {
          step: "dia" as Step,
          history: ["opcion"] as Step[],
          mode: "domicilio" as const,
          dateISO: "",
        };
  });
  const [step, setStep] = useState<Step>(inicio.step);
  const [history, setHistory] = useState<Step[]>(inicio.history);

  // La predeterminada, si la hay, es lo único de `prefill` que rellena
  // campos por sí sola. El resto de direcciones solo entran al elegirlas en
  // el selector de más abajo.
  const direccionPredeterminada = prefill?.direcciones.find(
    (d) => d.predeterminada,
  );

  const [dateISO, setDateISO] = useState(inicio.dateISO);
  const [mode, setMode] = useState<DeliveryMode | null>(inicio.mode);
  const [address, setAddress] = useState(direccionPredeterminada?.calle ?? "");
  const [postalCode, setPostalCode] = useState(
    direccionPredeterminada?.postalCode ?? "",
  );
  // Qué opción muestra el selector de direcciones guardadas: el id de una
  // guardada, o `OTRA_DIRECCION` para escribir a mano.
  const [direccionSeleccionada, setDireccionSeleccionada] = useState(
    direccionPredeterminada?.id ?? OTRA_DIRECCION,
  );
  const [guardarDireccion, setGuardarDireccion] = useState(true);
  const [storeId, setStoreId] = useState<StoreId>("alcobendas");
  const [slot, setSlot] = useState<"morning" | "afternoon">("morning");
  const [name, setName] = useState(prefill?.nombre ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState(prefill?.telefono ?? "");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => new Date(), []);
  /**
   * Modalidad e importe se conocen antes que el día, y en recogida la tienda
   * también: el calendario ya puede abrir con el mínimo definitivo.
   */
  const plazoOpts = useMemo(
    () => ({
      subtotalCents: totalCents,
      storeId: mode === "recogida" ? storeId : undefined,
    }),
    [totalCents, mode, storeId],
  );
  const minISO = useMemo(
    () =>
      mode
        ? earliestDate(mode, today, plazoOpts)
        : earliestSelectableDate(today),
    [mode, today, plazoOpts],
  );
  const [cursor, setCursor] = useState(() => {
    const d = fromISO(earliestSelectableDate(today));
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  /** Si el mínimo se va al mes siguiente, el calendario lo sigue. */
  useEffect(() => {
    const d = fromISO(minISO);
    setCursor((c) =>
      c.year < d.getFullYear() ||
      (c.year === d.getFullYear() && c.month < d.getMonth())
        ? { year: d.getFullYear(), month: d.getMonth() }
        : c,
    );
  }, [minISO]);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const go = (next: Step) => {
    setHistory((h) => [...h, step]);
    setStep(next);
  };

  const back = () => {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (prev) setStep(prev);
      return h.slice(0, -1);
    });
  };

  /** La modalidad manda: si la fecha ya elegida deja de valer, se descarta. */
  function chooseMode(next: DeliveryMode) {
    setMode(next);
    if (
      dateISO &&
      !isDateAllowed(next, dateISO, today, { subtotalCents: totalCents })
    ) {
      setDateISO("");
    }
    // En recogida la tienda va antes que el día: Pozuelo no prepara para hoy,
    // así que el calendario necesita saberla para no ofrecer una fecha falsa.
    go(next === "recogida" ? "tienda" : "dia");
  }

  const emailOk = /.+@.+\..+/.test(email.trim());
  const telefonoOk = esTelefonoValido(phone);
  /**
   * Franjas de recogida del día elegido: para hoy solo tarde, y en Alcobendas
   * los sábados, domingos y festivos solo mañana. Si la elegida deja de
   * valer, se pasa a la que queda.
   */
  const franjas: Franja[] =
    mode === "recogida" && dateISO
      ? franjasRecogida(storeId, dateISO, today)
      : ["morning", "afternoon"];
  const tiendaElegida = stores.find((s) => s.id === storeId);
  const mismoDia = mode === "recogida" && dateISO === toISO(today);
  useEffect(() => {
    if (franjas.length > 0 && !franjas.includes(slot)) setSlot(franjas[0]);
  }, [franjas.join(), slot]);

  /** El mínimo del reparto depende del día elegido: 0 hasta que lo hay. */
  const minimoCents = mode && dateISO ? minimoPedidoCents(mode, dateISO) : 0;
  const llegaAlMinimo = totalCents >= minimoCents;
  const canPay =
    Boolean(mode && dateISO) &&
    llegaAlMinimo &&
    emailOk &&
    telefonoOk &&
    !sending;

  /**
   * Guarda la dirección nueva en la cuenta, si toca. Deliberadamente no
   * lanza ni informa de un fallo: guardar una dirección es una comodidad, y
   * el pedido no puede depender de ella. Quien está pagando no puede
   * perder la venta porque esta llamada haya fallado.
   *
   * Tampoco puede depender de su *lentitud*: `pay()` no espera a que esta
   * promesa termine, así que la petición de cobro sale sin retraso aunque
   * esta tarde. Con `keepalive` la petición sigue en marcha aunque el
   * `window.location.href` de `pay()` nos lleve a Stripe antes de que
   * termine — sin `keepalive`, el navegador la cancelaría a mitad y la
   * dirección no se guardaría nunca. El cuerpo (unas decenas de bytes) está
   * muy por debajo del límite de 64 KiB que `keepalive` impone al conjunto
   * de peticiones en vuelo.
   */
  async function guardarDireccionSiToca() {
    if (
      mode !== "domicilio" ||
      !prefill ||
      !guardarDireccion ||
      !esDireccionNueva
    ) {
      return;
    }
    try {
      await fetch("/api/cuenta/direcciones", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          alias: "Guardada en un pedido",
          calle: address.trim(),
          postalCode,
          predeterminada: prefill.direcciones.length === 0,
        }),
      });
    } catch {
      // Silencioso a propósito: ver el comentario de arriba.
    }
  }

  /** Solo se mandan referencias y cantidades: el precio lo pone el servidor. */
  async function pay() {
    if (!mode || !dateISO || !emailOk || !telefonoOk || sending) return;
    setSending(true);
    setError(null);
    // Sin `await`: guardar la dirección es una comodidad y no puede retrasar
    // el arranque del pago. Ver el comentario de `guardarDireccionSiToca`.
    void guardarDireccionSiToca();
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: cart.items.map((i) => ({
            slug: i.slug,
            variantId: i.variantId,
            opciones: i.opciones,
            fotoUrl: i.fotoUrl,
            qty: i.qty,
          })),
          mode,
          dateISO,
          slot: mode === "recogida" ? slot : undefined,
          storeId: mode === "recogida" ? storeId : undefined,
          address: mode === "domicilio" ? address.trim() : undefined,
          postalCode: mode === "domicilio" ? postalCode : undefined,
          name: name.trim() || undefined,
          notes: notes.trim() || undefined,
          email: email.trim(),
          phone: phone.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error ?? "No hemos podido abrir el pago.");
        setSending(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("No hemos podido conectar. Comprueba tu conexión.");
      setSending(false);
    }
  }

  const cpCompleto = postalCode.length === 5;
  const cpValido = admiteCP(postalCode);
  const direccionLista = address.trim().length >= 6 && cpValido;

  // Si lo escrito coincide con una dirección ya guardada no hay nada nuevo
  // que ofrecer guardar: solo cuenta como «nueva» cuando además es válida
  // y difiere de todas las de la lista.
  const esDireccionGuardada = Boolean(
    prefill?.direcciones.some(
      (d) => d.calle === address.trim() && d.postalCode === postalCode,
    ),
  );
  const esDireccionNueva =
    Boolean(prefill) && direccionLista && !esDireccionGuardada;

  const TITLES: Record<Step, string> = {
    dia: "Selecciona qué día quieres el pedido",
    opcion: "Selecciona una opción",
    direccion: "Introduce tu dirección",
    tienda: "¿En qué tienda lo recoges?",
    resumen: "Revisa tu pedido",
  };

  const cells = monthGrid(cursor.year, cursor.month);
  const monthName = new Intl.DateTimeFormat("es-ES", {
    month: "long",
    year: "numeric",
  }).format(new Date(cursor.year, cursor.month, 1));
  const monthLabel = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  const canGoPrevMonth =
    new Date(cursor.year, cursor.month, 1) >
    new Date(fromISO(minISO).getFullYear(), fromISO(minISO).getMonth(), 1);

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(50, 40, 32, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={TITLES[step]}
        tabIndex={-1}
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--color-leche)",
          border: "1px solid var(--color-avellana)",
          outline: "none",
        }}
      >
        <header
          style={{
            background: "var(--color-moka)",
            color: "var(--color-leche)",
            padding: "1rem 1.25rem",
            fontFamily: "var(--font-display)",
            fontSize: 18,
            textAlign: "center",
          }}
        >
          {TITLES[step]}
        </header>

        <div style={{ padding: "1.25rem" }}>
          {step === "dia" && (
            <>
              {mode && (
                <p
                  style={{
                    marginBottom: 16,
                    padding: "0.75rem 1rem",
                    border: "1px solid var(--color-avellana)",
                    background: "var(--color-latte)",
                    fontSize: 13,
                    lineHeight: 1.5,
                    color: "var(--color-ink-muted)",
                  }}
                >
                  <strong style={{ color: "var(--color-moka)" }}>
                    {MODE_COPY[mode].label}.
                  </strong>{" "}
                  {MODE_COPY[mode].body}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setCursor((c) =>
                      c.month === 0
                        ? { year: c.year - 1, month: 11 }
                        : { ...c, month: c.month - 1 },
                    )
                  }
                  disabled={!canGoPrevMonth}
                  aria-label="Mes anterior"
                  style={{
                    width: 40,
                    height: 40,
                    border: "1px solid var(--color-avellana)",
                    background: "transparent",
                    cursor: canGoPrevMonth ? "pointer" : "not-allowed",
                    opacity: canGoPrevMonth ? 1 : 0.35,
                  }}
                >
                  ‹
                </button>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 17,
                  }}
                >
                  {monthLabel}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCursor((c) =>
                      c.month === 11
                        ? { year: c.year + 1, month: 0 }
                        : { ...c, month: c.month + 1 },
                    )
                  }
                  aria-label="Mes siguiente"
                  style={{
                    width: 40,
                    height: 40,
                    border: "1px solid var(--color-avellana)",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  ›
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 2,
                }}
              >
                {WEEKDAYS.map((w) => (
                  <span
                    key={w}
                    style={{ ...label, textAlign: "center", padding: "6px 0" }}
                  >
                    {w}
                  </span>
                ))}
                {cells.map((date, i) => {
                  if (!date) return <span key={`empty-${i}`} />;
                  const iso = toISO(date);
                  const disabled = mode
                    ? !isDateAllowed(mode, iso, today, plazoOpts)
                    : iso < minISO || isClosed(date);
                  const selected = iso === dateISO;
                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      onClick={() => setDateISO(iso)}
                      style={{
                        height: 40,
                        border: selected
                          ? "1px solid var(--color-caramelo)"
                          : "1px solid transparent",
                        background: selected
                          ? "var(--color-caramelo)"
                          : "transparent",
                        color: selected
                          ? "var(--color-leche)"
                          : disabled
                            ? "var(--color-avellana)"
                            : "var(--color-moka)",
                        cursor: disabled ? "not-allowed" : "pointer",
                        fontSize: 14,
                        fontWeight: selected ? 600 : 400,
                      }}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>

              <p
                style={{
                  marginTop: 14,
                  fontSize: 12,
                  color: "var(--color-ink-muted)",
                }}
              >
                {mode === "recogida" && tiendaElegida?.pickupUntilReducido
                  ? `En ${tiendaElegida.shortName}, recogida también en domingo. Sábados, domingos y festivos, de 09:30 a ${tiendaElegida.pickupUntilReducido} y sin recogida para el mismo día.`
                  : "Obrador y reparto propio de lunes a sábado. Los domingos no hay servicio."}
              </p>

              {mode === "domicilio" && (
                <p
                  role={dateISO && !llegaAlMinimo ? "alert" : undefined}
                  style={{
                    marginTop: 8,
                    fontSize: 12,
                    color:
                      dateISO && !llegaAlMinimo
                        ? "var(--color-teja)"
                        : "var(--color-ink-muted)",
                  }}
                >
                  {dateISO && !llegaAlMinimo
                    ? `Para ese día el pedido mínimo es de ${formatPriceCents(minimoCents)}: te faltan ${formatPriceCents(minimoCents - totalCents)}. Añade algo más o elige otro día.`
                    : MIN_ORDER_COPY}
                </p>
              )}

              <button
                type="button"
                className="btn btn-primario"
                disabled={!dateISO || !llegaAlMinimo}
                onClick={() =>
                  go(mode === "domicilio" ? "direccion" : "resumen")
                }
                style={{
                  width: "100%",
                  marginTop: 16,
                  opacity: dateISO && llegaAlMinimo ? 1 : 0.5,
                  cursor: dateISO && llegaAlMinimo ? "pointer" : "not-allowed",
                  border: "none",
                }}
              >
                Continuar
              </button>
            </>
          )}

          {step === "opcion" && (
            <div style={{ display: "grid", gap: 12 }}>
              {(["domicilio", "recogida"] as DeliveryMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => chooseMode(m)}
                  style={{
                    textAlign: "left",
                    padding: "1rem 1.25rem",
                    border: "1px solid var(--color-avellana)",
                    background: "var(--color-latte)",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-display)",
                      fontSize: 18,
                    }}
                  >
                    {MODE_COPY[m].label}
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: 6,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "var(--color-ink-muted)",
                    }}
                  >
                    {MODE_COPY[m].body}
                  </span>
                </button>
              ))}
              {totalCents >= DOS_DIAS_DESDE_CENTS && (
                <p style={{ fontSize: 12, color: "var(--color-ink-muted)" }}>
                  {DOS_DIAS_COPY}
                </p>
              )}
            </div>
          )}

          {step === "direccion" && (
            <>
              {prefill && prefill.direcciones.length > 1 && (
                <>
                  <label style={label} htmlFor="cf-direccion-guardada">
                    Elige una dirección guardada
                  </label>
                  <select
                    id="cf-direccion-guardada"
                    value={direccionSeleccionada}
                    onChange={(e) => {
                      const id = e.target.value;
                      setDireccionSeleccionada(id);
                      if (id === OTRA_DIRECCION) {
                        // «Otra dirección» vacía los campos para escribir a
                        // mano: rellenos no bloquean, y aquí tampoco.
                        setAddress("");
                        setPostalCode("");
                        return;
                      }
                      const elegida = prefill.direcciones.find(
                        (d) => d.id === id,
                      );
                      if (elegida) {
                        setAddress(elegida.calle);
                        setPostalCode(elegida.postalCode);
                      }
                    }}
                    style={field}
                  >
                    {prefill.direcciones.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.alias}
                      </option>
                    ))}
                    <option value={OTRA_DIRECCION}>Otra dirección</option>
                  </select>
                </>
              )}

              <label
                style={
                  prefill && prefill.direcciones.length > 1
                    ? { ...label, display: "block", marginTop: 16 }
                    : label
                }
                htmlFor="cf-address"
              >
                Dirección de entrega
              </label>
              <input
                id="cf-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Introduce la dirección"
                style={field}
              />

              <label
                style={{ ...label, display: "block", marginTop: 16 }}
                htmlFor="cf-cp"
              >
                Código postal
              </label>
              <input
                id="cf-cp"
                value={postalCode}
                // Teclado numérico en móvil, pero texto: `type="number"` se
                // come el cero de cabecera y admite signos y decimales.
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                onChange={(e) =>
                  setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 5))
                }
                aria-invalid={cpCompleto && !cpValido}
                aria-describedby="cf-cp-aviso"
                placeholder="28001"
                style={{
                  ...field,
                  borderColor:
                    cpCompleto && !cpValido
                      ? "var(--color-teja)"
                      : "var(--color-avellana)",
                }}
              />

              <p
                id="cf-cp-aviso"
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color:
                    cpCompleto && !cpValido
                      ? "var(--color-teja)"
                      : "var(--color-ink-muted)",
                }}
              >
                {cpCompleto && !cpValido
                  ? `No repartimos en el ${postalCode}. ${ZONA_REPARTO_COPY}`
                  : cpValido
                    ? `Repartimos en ${municipioDeCP(postalCode)}.`
                    : ZONA_REPARTO_COPY}
              </p>

              {esDireccionNueva && (
                <div
                  style={{
                    marginTop: 16,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <input
                    id="cf-guardar-direccion"
                    type="checkbox"
                    checked={guardarDireccion}
                    onChange={(e) => setGuardarDireccion(e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <label
                    htmlFor="cf-guardar-direccion"
                    style={{ fontSize: 13 }}
                  >
                    Guardar esta dirección en mi cuenta
                  </label>
                </div>
              )}

              <button
                type="button"
                className="btn btn-primario"
                disabled={!direccionLista}
                onClick={() => go("resumen")}
                style={{
                  width: "100%",
                  marginTop: 16,
                  border: "none",
                  opacity: direccionLista ? 1 : 0.5,
                  cursor: direccionLista ? "pointer" : "not-allowed",
                }}
              >
                Seleccionar
              </button>
              {/* Con sesión las direcciones guardadas ya están arriba. */}
              {!prefill && (
                <p style={{ marginTop: 14, textAlign: "center", fontSize: 13 }}>
                  <a
                    href={VOLVER_AL_CARRITO}
                    onClick={() => mode && aparcarCheckout({ mode, dateISO })}
                    style={{
                      textDecoration: "underline",
                      color: "var(--color-caramelo)",
                    }}
                  >
                    Ya soy cliente: entrar y usar una dirección guardada
                  </a>
                </p>
              )}
            </>
          )}

          {step === "tienda" && (
            <div style={{ display: "grid", gap: 12 }}>
              {stores.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setStoreId(s.id);
                    if (
                      dateISO &&
                      !isDateAllowed("recogida", dateISO, today, {
                        subtotalCents: totalCents,
                        storeId: s.id,
                      })
                    ) {
                      setDateISO("");
                    }
                    go("dia");
                  }}
                  style={{
                    textAlign: "left",
                    padding: "1rem 1.25rem",
                    border: "1px solid var(--color-avellana)",
                    background: "var(--color-latte)",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      fontFamily: "var(--font-display)",
                      fontSize: 18,
                    }}
                  >
                    {s.shortName}
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: 4,
                      fontSize: 12,
                      color: "var(--color-ink-muted)",
                    }}
                  >
                    Recogida hasta las {s.pickupUntil}
                    {s.pickupUntilReducido &&
                      ` · sáb., dom. y festivos hasta las ${s.pickupUntilReducido}`}
                    {s.id === "pozuelo" && " · siempre de un día para otro"}
                  </span>
                  <span
                    style={{
                      display: "block",
                      marginTop: 4,
                      fontSize: 13,
                      color: "var(--color-ink-muted)",
                    }}
                  >
                    {s.address} · {s.hoursText}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === "resumen" && mode && (
            <>
              <dl
                style={{
                  display: "grid",
                  gap: 10,
                  margin: 0,
                  paddingBottom: 16,
                  borderBottom: "1px solid var(--color-avellana)",
                }}
              >
                <div>
                  <dt style={label}>Modalidad</dt>
                  <dd style={{ margin: 0 }}>{MODE_COPY[mode].label}</dd>
                </div>
                <div>
                  <dt style={label}>Día</dt>
                  <dd style={{ margin: 0 }}>{formatDateISO(dateISO)}</dd>
                </div>
                <div>
                  <dt style={label}>
                    {mode === "domicilio" ? "Dirección" : "Tienda"}
                  </dt>
                  <dd style={{ margin: 0 }}>
                    {mode === "domicilio"
                      ? `${address} · ${postalCode}`
                      : stores.find((s) => s.id === storeId)?.shortName}
                  </dd>
                </div>
                <div>
                  <dt style={label}>Total estimado</dt>
                  <dd
                    style={{
                      margin: 0,
                      fontFamily: "var(--font-display)",
                      fontSize: 22,
                    }}
                  >
                    {formatPriceCents(totalCents)}
                  </dd>
                </div>
              </dl>

              {mode === "domicilio" ? (
                <div style={{ marginTop: 16 }}>
                  <span style={label}>Entrega</span>
                  <p
                    style={{ margin: "8px 0 0", fontSize: 14, fontWeight: 600 }}
                  >
                    {ENTREGA_DOMICILIO_COPY}
                  </p>
                </div>
              ) : (
                <div style={{ marginTop: 16 }}>
                  <span style={label}>Franja</span>
                  <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                    {(
                      [
                        {
                          id: "morning",
                          label: franjas.includes("afternoon")
                            ? "Mañana"
                            : `Mañana · hasta las ${tiendaElegida?.pickupUntilReducido ?? tiendaElegida?.cierreFestivo ?? "14:30"}`,
                        },
                        {
                          id: "afternoon",
                          label: mismoDia
                            ? `Tarde · desde las ${RECOGIDA_MISMO_DIA_DESDE}`
                            : "Tarde",
                        },
                      ] as const
                    )
                      .filter((s) => franjas.includes(s.id))
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSlot(s.id)}
                          aria-pressed={slot === s.id}
                          style={{
                            minHeight: 40,
                            padding: "0 1rem",
                            border: "1px solid var(--color-avellana)",
                            background:
                              slot === s.id
                                ? "var(--color-caramelo)"
                                : "transparent",
                            color:
                              slot === s.id
                                ? "var(--color-leche)"
                                : "var(--color-moka)",
                            cursor: "pointer",
                            fontSize: 14,
                            fontWeight: 600,
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <label style={label} htmlFor="cf-email">
                  Tu email *
                </label>
                <input
                  id="cf-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Para enviarte la confirmación"
                  style={field}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={label} htmlFor="cf-phone">
                  Tu teléfono *
                </label>
                <input
                  id="cf-phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  aria-invalid={phone.trim() !== "" && !telefonoOk}
                  aria-describedby="cf-phone-aviso"
                  placeholder="Por si hay que avisarte del pedido"
                  style={{
                    ...field,
                    borderColor:
                      phone.trim() !== "" && !telefonoOk
                        ? "var(--color-teja)"
                        : "var(--color-avellana)",
                  }}
                />
                {phone.trim() !== "" && !telefonoOk && (
                  <p
                    id="cf-phone-aviso"
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: "var(--color-teja)",
                    }}
                  >
                    Escribe un móvil o fijo español de nueve dígitos.
                  </p>
                )}
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={label} htmlFor="cf-name">
                  Tu nombre (opcional)
                </label>
                <input
                  id="cf-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={field}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <label style={label} htmlFor="cf-notes">
                  Notas (opcional)
                </label>
                <textarea
                  id="cf-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Alergias, indicaciones, lo que necesites"
                  style={field}
                />
              </div>

              {error && (
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
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={pay}
                disabled={!canPay}
                style={{
                  width: "100%",
                  marginTop: 20,
                  minHeight: 48,
                  background: "var(--color-caramelo)",
                  color: "var(--color-leche)",
                  border: "none",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: canPay ? "pointer" : "not-allowed",
                  opacity: canPay ? 1 : 0.55,
                }}
              >
                {sending
                  ? "Abriendo el pago…"
                  : `Pagar ${formatPriceCents(totalCents)}`}
              </button>
              <p
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "var(--color-ink-muted)",
                  textAlign: "center",
                }}
              >
                Pago seguro con tarjeta, Apple Pay o Google Pay. Al pagar
                aceptas las{" "}
                <a
                  href="/legal/condiciones-de-compra"
                  style={{ textDecoration: "underline" }}
                >
                  condiciones de compra
                </a>
                .
              </p>
            </>
          )}
        </div>

        <footer
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 8,
            padding: "0 1.25rem 1.25rem",
          }}
        >
          {history.length > 0 && (
            <button
              type="button"
              onClick={back}
              style={{
                minHeight: 40,
                padding: "0 1rem",
                border: "1px solid var(--color-avellana)",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: "0.12em",
              }}
            >
              ‹ Volver
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            style={{
              minHeight: 40,
              padding: "0 1rem",
              border: "1px solid var(--color-avellana)",
              background: "transparent",
              cursor: "pointer",
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}
          >
            ✕ Cerrar
          </button>
        </footer>
      </div>
    </div>
  );
}
