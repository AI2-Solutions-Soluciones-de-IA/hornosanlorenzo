import { useEffect, useMemo, useRef, useState } from "react";
import type { ProductoTpv } from "~/lib/tpv";
import { shippingCents } from "~/lib/entrega";

/**
 * TPV de las oficinas (13-11-2026): apuntar un pedido mientras se atiende
 * la llamada. Tres pasos:
 *   1. Productos: la carta con sus fotos, como la tienda online. Tocar una
 *      tarjeta añade una unidad; si tiene tamaños o es un pack, se abre una
 *      ventana para elegir.
 *   2. Cliente y entrega.
 *   3. Revisar (se pueden cambiar las unidades) y cobrar.
 * Abajo, siempre a la vista, cuántos productos lleva, el total y el botón
 * para seguir. Lo que se va escribiendo se guarda en este navegador, para no
 * perderlo si se recarga a media llamada.
 *
 * Los precios que se ven aquí son orientativos: el servidor vuelve a poner
 * precio al registrar, como en la web. Si el pedido se salta algún límite
 * de la web (plazo, cupo, máximos…), el servidor lo dice y se puede
 * registrar igual.
 */

type Props = { carta: ProductoTpv[]; tiendaInicial: "alcobendas" | "pozuelo" };

type Linea = {
  key: string;
  slug?: string;
  nombre: string;
  /** Tamaño, o lo elegido en un pack, para leerlo debajo del nombre. */
  detalle?: string;
  variantId?: string;
  opciones?: Record<string, string>;
  precioCents: number;
  qty: number;
};

type Destino = "alcobendas" | "pozuelo" | "domicilio";
type Paso = 1 | 2 | 3;

type Borrador = {
  paso: Paso;
  lineas: Linea[];
  telefono: string;
  nombre: string;
  email: string;
  destino: Destino;
  fecha: string;
  franja: "morning" | "afternoon";
  direccion: string;
  cp: string;
  notas: string;
  pagado: boolean;
};

type Hecho = {
  id: string;
  nombre: string;
  totalCents: number;
  correos: { cliente: boolean | null; oficina: boolean | null };
};

const CLAVE = "hsl-tpv-borrador";

const euros = (c: number) => `${(c / 100).toFixed(2).replace(".", ",")} €`;

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const manana = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoLocal(d);
};

/** «sábado 14 de noviembre» */
const diaLegible = (iso: string) => {
  const [a, m, d] = iso.split("-").map(Number);
  if (!a || !m || !d) return iso;
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(a, m - 1, d));
};

const vacio = (tienda: Destino): Borrador => ({
  paso: 1,
  lineas: [],
  telefono: "",
  nombre: "",
  email: "",
  destino: tienda,
  fecha: manana(),
  franja: "morning",
  direccion: "",
  cp: "",
  notas: "",
  pagado: false,
});

/** «12,50» o «12.5» → 1250; null si no es un precio. */
function aCentimos(texto: string): number | null {
  const t = texto.trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  return Math.round(Number(t) * 100);
}

const sinAcentos = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const desde = (p: ProductoTpv) =>
  p.variantes.length > 0
    ? Math.min(...p.variantes.map((v) => v.precioCents))
    : (p.precioCents ?? 0);

const DESTINOS: [Destino, string][] = [
  ["alcobendas", "Recoge en Alcobendas"],
  ["pozuelo", "Recoge en Pozuelo"],
  ["domicilio", "A domicilio"],
];

// Estilos de siempre del panel, con los colores de la casa.
const caja = "border border-[color:var(--color-avellana)] bg-white p-4 sm:p-5";
const titulo = "numeracion mb-3";
const campo =
  "w-full border border-[color:var(--color-avellana)] bg-white px-3 py-2.5 text-base focus:outline-2 focus:outline-[color:var(--color-teja)]";
const etiqueta = "block text-sm font-semibold mb-1";
const boton =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold border transition-colors disabled:opacity-50";
const principal = `${boton} bg-[color:var(--color-teja)] border-[color:var(--color-teja)] text-[color:var(--color-leche)] hover:opacity-90`;
const secundario = `${boton} bg-white border-[color:var(--color-avellana)] hover:bg-[color:var(--color-latte)]`;
const pastilla = (activa: boolean) =>
  `px-3 py-2 text-sm font-semibold border transition-colors ${
    activa
      ? "bg-[color:var(--color-moka)] border-[color:var(--color-moka)] text-[color:var(--color-leche)]"
      : "bg-white border-[color:var(--color-avellana)] hover:bg-[color:var(--color-latte)]"
  }`;

export default function Tpv({ carta, tiendaInicial }: Props) {
  const [b, setB] = useState<Borrador>(() => vacio(tiendaInicial));
  const [cargado, setCargado] = useState(false);
  const [busca, setBusca] = useState("");
  const [grupo, setGrupo] = useState<string | null>(null);
  /** La ventana de elegir: un producto con tamaños o un pack, o «otro producto». */
  const [ventana, setVentana] = useState<ProductoTpv | "libre" | null>(null);
  const [eleccion, setEleccion] = useState<Record<string, string>>({});
  const [libre, setLibre] = useState({ nombre: "", precio: "", qty: "1" });
  const [libreError, setLibreError] = useState<string | null>(null);
  /** «+1» en la tarjeta recién tocada, para que se note que ha entrado. */
  const [destello, setDestello] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  const arriba = useRef<HTMLDivElement>(null);

  // El borrador de este navegador, si lo hay.
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE);
      if (guardado)
        setB({
          ...vacio(tiendaInicial),
          ...(JSON.parse(guardado) as Partial<Borrador>),
        });
    } catch {}
    setCargado(true);
  }, [tiendaInicial]);
  useEffect(() => {
    if (!cargado) return;
    try {
      localStorage.setItem(CLAVE, JSON.stringify(b));
    } catch {}
  }, [b, cargado]);

  // Escape cierra la ventana de elegir.
  useEffect(() => {
    if (!ventana) return;
    const cierra = (e: KeyboardEvent) => e.key === "Escape" && setVentana(null);
    window.addEventListener("keydown", cierra);
    return () => window.removeEventListener("keydown", cierra);
  }, [ventana]);

  const pon = <K extends keyof Borrador>(k: K, v: Borrador[K]) => {
    setB((x) => ({ ...x, [k]: v }));
    setAvisos(null);
    setError(null);
  };

  const irA = (paso: Paso) => {
    pon("paso", paso);
    arriba.current?.scrollIntoView({ block: "start" });
  };

  // En el orden de la carta de la web; lo que no esté en la lista, al final.
  const grupos = useMemo(() => {
    const orden = [
      "Dulce",
      "Salado",
      "Packs",
      "Sin alérgenos",
      "Pan",
      "Complementos",
    ];
    const pos = (g: string) =>
      orden.includes(g) ? orden.indexOf(g) : orden.length;
    return [...new Set(carta.map((p) => p.grupo))].sort(
      (a, c) => pos(a) - pos(c),
    );
  }, [carta]);

  const lista = useMemo(() => {
    const q = sinAcentos(busca.trim());
    return carta.filter(
      (p) =>
        (!grupo || p.grupo === grupo) &&
        (!q || q.split(/\s+/).every((w) => sinAcentos(p.nombre).includes(w))),
    );
  }, [carta, busca, grupo]);

  /** Unidades de cada producto en el pedido, para el número de la tarjeta. */
  const enPedido = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of b.lineas)
      if (l.slug) m.set(l.slug, (m.get(l.slug) ?? 0) + l.qty);
    return m;
  }, [b.lineas]);

  function anade(l: Omit<Linea, "key" | "qty">, qty = 1) {
    setB((x) => {
      // La misma cosa (mismo producto, tamaño y elecciones) suma unidades.
      const igual = x.lineas.find(
        (y) =>
          y.slug &&
          y.slug === l.slug &&
          y.variantId === l.variantId &&
          JSON.stringify(y.opciones ?? {}) === JSON.stringify(l.opciones ?? {}),
      );
      if (igual)
        return {
          ...x,
          lineas: x.lineas.map((y) =>
            y === igual ? { ...y, qty: Math.min(999, y.qty + qty) } : y,
          ),
        };
      return {
        ...x,
        lineas: [
          ...x.lineas,
          { ...l, qty, key: `${Date.now()}-${Math.random()}` },
        ],
      };
    });
    setAvisos(null);
    setError(null);
    if (l.slug) {
      setDestello(l.slug);
      window.setTimeout(
        () => setDestello((d) => (d === l.slug ? null : d)),
        700,
      );
    }
  }

  function tocaProducto(p: ProductoTpv) {
    if (p.variantes.length === 0 && !p.pack) {
      anade({
        slug: p.slug,
        nombre: p.nombre,
        precioCents: p.precioCents ?? 0,
      });
      return;
    }
    setEleccion({});
    setVentana(p);
  }

  function anadePack(p: ProductoTpv) {
    const huecos = p.pack?.huecos ?? [];
    if (huecos.some((h) => !eleccion[h.id])) return;
    const detalle = huecos
      .map(
        (h) => h.opciones.find((o) => o.slug === eleccion[h.id])?.nombre ?? "",
      )
      .join(" · ");
    anade({
      slug: p.slug,
      nombre: p.nombre,
      precioCents: p.precioCents ?? 0,
      opciones: huecos.length ? { ...eleccion } : undefined,
      detalle: detalle || undefined,
    });
    setVentana(null);
    setEleccion({});
  }

  function anadeLibre() {
    const precio = aCentimos(libre.precio);
    const qty = Number(libre.qty);
    if (libre.nombre.trim().length < 2) return setLibreError("Escribe qué es.");
    if (precio === null) return setLibreError("El precio, en euros: 12,50");
    if (!Number.isInteger(qty) || qty < 1)
      return setLibreError("Las unidades, un número.");
    anade(
      {
        nombre: libre.nombre.trim(),
        precioCents: precio,
        detalle: "Fuera de carta",
      },
      qty,
    );
    setLibre({ nombre: "", precio: "", qty: "1" });
    setLibreError(null);
    setVentana(null);
  }

  const cambiaQty = (key: string, qty: number) => {
    setB((x) => ({
      ...x,
      lineas:
        qty <= 0
          ? x.lineas.filter((l) => l.key !== key)
          : x.lineas.map((l) =>
              l.key === key ? { ...l, qty: Math.min(999, qty) } : l,
            ),
    }));
    setAvisos(null);
  };

  const unidades = b.lineas.reduce((s, l) => s + l.qty, 0);
  const subtotal = b.lineas.reduce((s, l) => s + l.precioCents * l.qty, 0);
  const reparto =
    b.destino === "domicilio" && b.lineas.length > 0
      ? shippingCents("domicilio", subtotal)
      : 0;
  const total = subtotal + reparto;
  const conFoto = b.lineas.some(
    (l) => carta.find((p) => p.slug === l.slug)?.pack?.conFoto,
  );
  const domicilio = b.destino === "domicilio";

  /** Lo que falta de los datos del cliente y la entrega, en una línea. */
  const faltaDatos = (() => {
    if (b.nombre.trim().length < 2) return "Falta el nombre del cliente.";
    if (b.telefono.replace(/\D/g, "").length < 9) return "Falta el teléfono.";
    if (b.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email.trim()))
      return "El correo no parece válido (o déjalo vacío).";
    if (!b.fecha) return "Falta el día.";
    if (domicilio && b.direccion.trim().length < 6)
      return "Falta la dirección.";
    if (domicilio && !/^\d{5}$/.test(b.cp)) return "Falta el código postal.";
    return null;
  })();
  const faltaProductos = b.lineas.length === 0 ? "Añade algún producto." : null;

  async function registra(confirmar = false) {
    if (enviando || faltaProductos || faltaDatos) return;
    setEnviando(true);
    setError(null);
    const pedido = {
      items: b.lineas
        .filter((l) => l.slug)
        .map((l) => ({
          slug: l.slug!,
          qty: l.qty,
          variantId: l.variantId,
          opciones: l.opciones,
        })),
      libres: b.lineas
        .filter((l) => !l.slug)
        .map((l) => ({
          nombre: l.nombre,
          precioCents: l.precioCents,
          qty: l.qty,
        })),
      mode: domicilio ? "domicilio" : "recogida",
      dateISO: b.fecha,
      slot: domicilio ? undefined : b.franja,
      storeId: domicilio ? undefined : b.destino,
      address: domicilio ? b.direccion : undefined,
      postalCode: domicilio ? b.cp.trim() : undefined,
      name: b.nombre,
      phone: b.telefono,
      email: b.email.trim(),
      notes: b.notas,
      pagado: b.pagado,
    };
    try {
      const r = await fetch("/api/tpv/pedido", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pedido, confirmar }),
      });
      const datos = (await r.json().catch(() => ({}))) as Partial<Hecho> & {
        error?: string;
        avisos?: string[];
      };
      if (r.status === 409 && datos.avisos) {
        setAvisos(datos.avisos);
        return;
      }
      if (!r.ok || !datos.id) {
        setError(
          datos.error ?? "No se ha podido registrar. Inténtalo otra vez.",
        );
        return;
      }
      setHecho(datos as Hecho);
      setAvisos(null);
      setB(vacio(tiendaInicial));
      try {
        localStorage.removeItem(CLAVE);
      } catch {}
      arriba.current?.scrollIntoView({ block: "start" });
    } catch {
      setError(
        "Sin conexión. El pedido no se ha registrado: inténtalo otra vez.",
      );
    } finally {
      setEnviando(false);
    }
  }

  if (hecho) {
    return (
      <div ref={arriba} className={`${caja} max-w-xl`}>
        <p className="numeracion">Registrado</p>
        <p className="mt-1 font-[family-name:var(--font-display)] text-2xl">
          Pedido de {hecho.nombre}
        </p>
        <p className="mt-1 text-lg">Total {euros(hecho.totalCents)}</p>
        <ul className="mt-3 text-sm text-[color:var(--color-ink-muted)] space-y-1">
          <li>Ya está en Pedidos (Ref. {hecho.id.slice(0, 8)}).</li>
          {hecho.correos.cliente === true && (
            <li>Al cliente le ha llegado la confirmación por correo.</li>
          )}
          {hecho.correos.cliente === false && (
            <li>No se ha podido mandar el correo al cliente.</li>
          )}
          {hecho.correos.oficina === true && (
            <li>Se ha avisado por correo a la tienda que lo prepara.</li>
          )}
          {hecho.correos.oficina === false && (
            <li>
              No se ha podido avisar por correo a la tienda que lo prepara.
            </li>
          )}
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className={principal}
            onClick={() => setHecho(null)}
          >
            Nuevo pedido
          </button>
          <a
            className={secundario}
            href={`/admin/pedidos/imprimir?id=${hecho.id}`}
            target="_blank"
            rel="noopener"
          >
            Imprimir comanda
          </a>
          <a className={secundario} href="/admin/pedidos">
            Ver en Pedidos
          </a>
        </div>
      </div>
    );
  }

  const pasos: [Paso, string][] = [
    [1, "Productos"],
    [2, "Cliente y entrega"],
    [3, "Revisar y cobrar"],
  ];

  return (
    <div ref={arriba} className="scroll-mt-4 pb-28">
      {/* Los pasos: se puede volver a cualquiera tocándolo. */}
      <ol className="mb-5 grid grid-cols-3 gap-2 text-center text-xs sm:text-sm">
        {pasos.map(([n, t]) => (
          <li key={n}>
            <button
              type="button"
              onClick={() => irA(n)}
              aria-current={b.paso === n ? "step" : undefined}
              className={`w-full border-b-4 pb-2 font-semibold ${
                b.paso === n
                  ? "border-[color:var(--color-teja)] text-[color:var(--color-moka)]"
                  : "border-[color:var(--color-avellana)] text-[color:var(--color-ink-muted)]"
              }`}
            >
              {n} · {t}
            </button>
          </li>
        ))}
      </ol>

      {/* ---------- 1 · Productos ---------- */}
      {b.paso === 1 && (
        <section aria-label="Productos">
          <input
            type="search"
            className={campo}
            placeholder="Buscar: bonito, sacher, barra…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            aria-label="Buscar producto"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={pastilla(grupo === null)}
              onClick={() => setGrupo(null)}
            >
              Todo
            </button>
            {grupos.map((g) => (
              <button
                key={g}
                type="button"
                className={pastilla(grupo === g)}
                onClick={() => setGrupo(grupo === g ? null : g)}
              >
                {g}
              </button>
            ))}
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {lista.map((p) => {
              const n = enPedido.get(p.slug) ?? 0;
              const elegir = p.variantes.length > 0 || p.pack;
              return (
                <li key={p.slug}>
                  <button
                    type="button"
                    onClick={() => tocaProducto(p)}
                    className={`relative flex h-full w-full flex-col overflow-hidden border bg-white text-left transition-colors hover:border-[color:var(--color-moka)] ${
                      n > 0
                        ? "border-[color:var(--color-teja)] border-2"
                        : "border-[color:var(--color-avellana)]"
                    }`}
                  >
                    <span className="block aspect-[4/3] w-full bg-[color:var(--color-latte)]">
                      {p.foto && (
                        <img
                          src={p.foto.url}
                          alt=""
                          width={p.foto.ancho}
                          height={p.foto.alto}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </span>
                    {n > 0 && (
                      <span
                        className={`absolute right-2 top-2 inline-flex min-w-7 h-7 px-2 items-center justify-center rounded-full bg-[color:var(--color-teja)] text-[color:var(--color-leche)] text-sm font-bold transition-transform ${
                          destello === p.slug ? "scale-125" : ""
                        }`}
                        aria-label={`${n} en el pedido`}
                      >
                        {n}
                      </span>
                    )}
                    <span className="flex flex-1 flex-col gap-1 p-3">
                      <span className="text-sm font-semibold leading-snug">
                        {p.nombre}
                      </span>
                      {p.agotado && (
                        <span className="text-xs text-[color:var(--color-teja)]">
                          Agotado en la web
                        </span>
                      )}
                      <span className="mt-auto flex items-end justify-between gap-2 pt-1 text-sm">
                        <span className="tabular-nums">
                          {p.variantes.length > 0
                            ? `desde ${euros(desde(p))}`
                            : euros(p.precioCents ?? 0)}
                        </span>
                        <span className="text-xs font-semibold text-[color:var(--color-teja)]">
                          {p.pack ? "Elegir" : elegir ? "Tamaño" : "+ Añadir"}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}

            {/* Lo que no está en la carta online: encargos, «a consultar»… */}
            <li>
              <button
                type="button"
                onClick={() => setVentana("libre")}
                className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-1 border border-dashed border-[color:var(--color-moka)] bg-[color:var(--color-leche)] p-3 text-center hover:bg-[color:var(--color-latte)]"
              >
                <span className="text-2xl leading-none">+</span>
                <span className="text-sm font-semibold">Otro producto</span>
                <span className="text-xs text-[color:var(--color-ink-muted)]">
                  Fuera de carta, con precio a mano
                </span>
              </button>
            </li>
          </ul>
          {lista.length === 0 && (
            <p className="mt-3 text-sm text-[color:var(--color-ink-muted)]">
              Nada con ese nombre. Si no está en la carta, apúntalo como «Otro
              producto».
            </p>
          )}
        </section>
      )}

      {/* ---------- 2 · Cliente y entrega ---------- */}
      {b.paso === 2 && (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <section className={caja} aria-label="Cliente">
            <p className={titulo}>Cliente</p>
            <div className="grid gap-3">
              <label>
                <span className={etiqueta}>Teléfono</span>
                <input
                  className={campo}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={b.telefono}
                  onChange={(e) => pon("telefono", e.target.value)}
                />
              </label>
              <label>
                <span className={etiqueta}>Nombre y apellidos</span>
                <input
                  className={campo}
                  autoComplete="off"
                  value={b.nombre}
                  onChange={(e) => pon("nombre", e.target.value)}
                />
              </label>
              <label>
                <span className={etiqueta}>
                  Correo{" "}
                  <span className="font-normal text-[color:var(--color-ink-muted)]">
                    (opcional: le llega la confirmación)
                  </span>
                </span>
                <input
                  className={campo}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={b.email}
                  onChange={(e) => pon("email", e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className={caja} aria-label="Entrega">
            <p className={titulo}>Entrega</p>
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-label="Dónde"
            >
              {DESTINOS.map(([v, t]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={b.destino === v}
                  className={pastilla(b.destino === v)}
                  onClick={() => pon("destino", v)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label>
                <span className={etiqueta}>Día</span>
                <input
                  className={campo}
                  type="date"
                  value={b.fecha}
                  onChange={(e) => pon("fecha", e.target.value)}
                />
              </label>
              {!domicilio && (
                <div>
                  <span className={etiqueta}>Franja</span>
                  <div
                    className="grid grid-cols-2 gap-2"
                    role="radiogroup"
                    aria-label="Franja"
                  >
                    {(
                      [
                        ["morning", "Mañana"],
                        ["afternoon", "Tarde"],
                      ] as const
                    ).map(([v, t]) => (
                      <button
                        key={v}
                        type="button"
                        role="radio"
                        aria-checked={b.franja === v}
                        className={pastilla(b.franja === v)}
                        onClick={() => pon("franja", v)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {domicilio && (
              <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem]">
                <label>
                  <span className={etiqueta}>Dirección</span>
                  <input
                    className={campo}
                    autoComplete="off"
                    value={b.direccion}
                    onChange={(e) => pon("direccion", e.target.value)}
                    placeholder="Calle, número, piso"
                  />
                </label>
                <label>
                  <span className={etiqueta}>C. P.</span>
                  <input
                    className={campo}
                    inputMode="numeric"
                    maxLength={5}
                    value={b.cp}
                    onChange={(e) =>
                      pon("cp", e.target.value.replace(/\D/g, ""))
                    }
                  />
                </label>
              </div>
            )}
            <label className="mt-3 block">
              <span className={etiqueta}>Notas</span>
              <textarea
                className={`${campo} min-h-20`}
                value={b.notas}
                onChange={(e) => pon("notas", e.target.value)}
                placeholder={
                  conFoto
                    ? "Cómo nos manda la foto, texto de la plancha…"
                    : "Texto de la tarta, alergias, a qué hora pasa…"
                }
              />
            </label>
          </section>
        </div>
      )}

      {/* ---------- 3 · Revisar y cobrar ---------- */}
      {b.paso === 3 && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start">
          <section className={caja} aria-label="Pedido">
            <div className="flex items-baseline justify-between gap-3">
              <p className={titulo}>Productos</p>
              <button
                type="button"
                className="text-xs underline"
                onClick={() => irA(1)}
              >
                Añadir más
              </button>
            </div>
            {b.lineas.length === 0 ? (
              <p className="text-sm text-[color:var(--color-ink-muted)]">
                Todavía no hay productos.
              </p>
            ) : (
              <ul className="divide-y divide-[color:var(--color-line)]">
                {b.lineas.map((l) => {
                  const foto = carta.find((p) => p.slug === l.slug)?.foto;
                  return (
                    <li key={l.key} className="py-2 flex items-center gap-3">
                      <span className="h-12 w-12 shrink-0 overflow-hidden bg-[color:var(--color-latte)]">
                        {foto && (
                          <img
                            src={foto.url}
                            alt=""
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        )}
                      </span>
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-semibold">{l.nombre}</p>
                        {l.detalle && (
                          <p className="text-xs text-[color:var(--color-ink-muted)]">
                            {l.detalle}
                          </p>
                        )}
                        <div className="mt-1 inline-flex items-center border border-[color:var(--color-avellana)]">
                          <button
                            type="button"
                            className="w-8 h-8 text-lg"
                            onClick={() => cambiaQty(l.key, l.qty - 1)}
                            aria-label={`Quitar una unidad de ${l.nombre}`}
                          >
                            −
                          </button>
                          <input
                            className="w-10 h-8 text-center tabular-nums border-x border-[color:var(--color-avellana)]"
                            inputMode="numeric"
                            value={l.qty}
                            onChange={(e) => {
                              const n = Number(
                                e.target.value.replace(/\D/g, ""),
                              );
                              if (Number.isFinite(n) && n > 0)
                                cambiaQty(l.key, n);
                            }}
                            aria-label={`Unidades de ${l.nombre}`}
                          />
                          <button
                            type="button"
                            className="w-8 h-8 text-lg"
                            onClick={() => cambiaQty(l.key, l.qty + 1)}
                            aria-label={`Añadir una unidad de ${l.nombre}`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="text-right text-sm tabular-nums whitespace-nowrap">
                        {euros(l.precioCents * l.qty)}
                        <button
                          type="button"
                          className="block ml-auto mt-1 text-xs underline text-[color:var(--color-ink-muted)]"
                          onClick={() => cambiaQty(l.key, 0)}
                        >
                          Quitar
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="flex flex-col gap-6">
            <section className={caja} aria-label="Datos">
              <div className="flex items-baseline justify-between gap-3">
                <p className={titulo}>Cliente y entrega</p>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => irA(2)}
                >
                  Cambiar
                </button>
              </div>
              <dl className="text-sm space-y-1">
                <div>
                  <dt className="sr-only">Cliente</dt>
                  <dd className="font-semibold">{b.nombre || "Sin nombre"}</dd>
                  <dd>
                    {[b.telefono, b.email].filter(Boolean).join(" · ") ||
                      "Sin teléfono"}
                  </dd>
                </div>
                <div className="pt-2">
                  <dt className="sr-only">Entrega</dt>
                  <dd>{DESTINOS.find(([v]) => v === b.destino)?.[1]}</dd>
                  <dd className="first-letter:uppercase">
                    {diaLegible(b.fecha)}
                    {!domicilio &&
                      ` · ${b.franja === "morning" ? "mañana" : "tarde"}`}
                  </dd>
                  {domicilio && (
                    <dd>{[b.direccion, b.cp].filter(Boolean).join(" · ")}</dd>
                  )}
                </div>
                {b.notas.trim() && (
                  <div className="pt-2">
                    <dt className="sr-only">Notas</dt>
                    <dd className="italic">«{b.notas.trim()}»</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className={caja} aria-label="Cobro">
              <p className={titulo}>Cobro</p>
              <div
                className="grid grid-cols-2 gap-2"
                role="radiogroup"
                aria-label="Cobro"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={!b.pagado}
                  className={pastilla(!b.pagado)}
                  onClick={() => pon("pagado", false)}
                >
                  {domicilio ? "Paga al recibirlo" : "Paga al recoger"}
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={b.pagado}
                  className={pastilla(b.pagado)}
                  onClick={() => pon("pagado", true)}
                >
                  Ya cobrado
                </button>
              </div>

              <dl className="mt-4 text-sm space-y-1">
                {reparto > 0 && (
                  <>
                    <div className="flex justify-between gap-8">
                      <dt>Productos</dt>
                      <dd className="tabular-nums">{euros(subtotal)}</dd>
                    </div>
                    <div className="flex justify-between gap-8">
                      <dt>Reparto</dt>
                      <dd className="tabular-nums">{euros(reparto)}</dd>
                    </div>
                  </>
                )}
                <div className="flex justify-between gap-8 text-lg font-semibold">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{euros(total)}</dd>
                </div>
              </dl>

              {avisos && (
                <div
                  className="mt-4 border-l-4 border-[color:var(--color-caramelo)] bg-[color:var(--color-latte)] p-3 text-sm"
                  role="alert"
                >
                  <p className="font-semibold">
                    Ojo: en la web este pedido no se podría hacer.
                  </p>
                  <ul className="mt-1 list-disc pl-5 space-y-1">
                    {avisos.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                  <p className="mt-2">
                    Si lo has hablado con el cliente y el obrador puede,
                    regístralo igual.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={principal}
                      disabled={enviando}
                      onClick={() => registra(true)}
                    >
                      {enviando ? "Registrando…" : "Registrar igualmente"}
                    </button>
                    <button
                      type="button"
                      className={secundario}
                      onClick={() => setAvisos(null)}
                    >
                      Revisar
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p
                  className="mt-4 text-sm text-[color:var(--color-teja)]"
                  role="alert"
                >
                  {error}
                </p>
              )}

              {!avisos && (
                <>
                  <button
                    type="button"
                    className={`${principal} mt-4 w-full py-3 text-base`}
                    disabled={
                      enviando || faltaProductos !== null || faltaDatos !== null
                    }
                    onClick={() => registra(false)}
                  >
                    {enviando ? "Registrando…" : "Registrar pedido"}
                  </button>
                  {(faltaProductos ?? faltaDatos) && (
                    <p className="mt-2 text-xs text-center text-[color:var(--color-teja)]">
                      {faltaProductos ?? faltaDatos}
                    </p>
                  )}
                </>
              )}
            </section>

            <button
              type="button"
              className="self-start text-xs underline text-[color:var(--color-ink-muted)]"
              onClick={() => {
                setB(vacio(tiendaInicial));
                setAvisos(null);
                setError(null);
              }}
            >
              Empezar de cero
            </button>
          </div>
        </div>
      )}

      {/* ---------- Barra de abajo: el pedido de un vistazo y el paso siguiente ---------- */}
      {b.paso < 3 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--color-avellana)] bg-[color:var(--color-leche)] shadow-[0_-4px_16px_rgba(50,40,32,0.08)]">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="text-sm">
              {b.paso > 1 && (
                <button
                  type="button"
                  className="mr-3 underline"
                  onClick={() => irA((b.paso - 1) as Paso)}
                >
                  ← Atrás
                </button>
              )}
              <span className="font-semibold tabular-nums">
                {unidades} {unidades === 1 ? "producto" : "productos"} ·{" "}
                {euros(total)}
              </span>
              {b.paso === 2 && faltaDatos && (
                <span className="block text-xs text-[color:var(--color-teja)]">
                  {faltaDatos}
                </span>
              )}
            </div>
            <button
              type="button"
              className={principal}
              disabled={
                b.paso === 1 ? b.lineas.length === 0 : faltaDatos !== null
              }
              onClick={() => irA((b.paso + 1) as Paso)}
            >
              {b.paso === 1 ? "Cliente y entrega →" : "Revisar →"}
            </button>
          </div>
        </div>
      )}

      {/* ---------- Ventana de elegir: tamaño, pack u otro producto ---------- */}
      {ventana && (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center sm:p-6"
          onClick={(e) => e.target === e.currentTarget && setVentana(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={ventana === "libre" ? "Otro producto" : ventana.nombre}
            className="max-h-[90vh] w-full overflow-y-auto bg-white sm:max-w-md"
          >
            {ventana === "libre" ? (
              <div className="p-5">
                <p className="font-[family-name:var(--font-display)] text-xl">
                  Otro producto
                </p>
                <p className="text-sm text-[color:var(--color-ink-muted)]">
                  Lo que no está en la carta online, con el precio que digáis.
                </p>
                <div className="mt-4 grid gap-3">
                  <label>
                    <span className={etiqueta}>Qué es</span>
                    <input
                      autoFocus
                      className={campo}
                      value={libre.nombre}
                      onChange={(e) =>
                        setLibre({ ...libre, nombre: e.target.value })
                      }
                      placeholder="Tarta de 30 raciones"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label>
                      <span className={etiqueta}>Precio por unidad (€)</span>
                      <input
                        className={campo}
                        inputMode="decimal"
                        value={libre.precio}
                        onChange={(e) =>
                          setLibre({ ...libre, precio: e.target.value })
                        }
                        placeholder="45,00"
                      />
                    </label>
                    <label>
                      <span className={etiqueta}>Unidades</span>
                      <input
                        className={campo}
                        inputMode="numeric"
                        value={libre.qty}
                        onChange={(e) =>
                          setLibre({ ...libre, qty: e.target.value })
                        }
                      />
                    </label>
                  </div>
                </div>
                {libreError && (
                  <p className="mt-2 text-sm text-[color:var(--color-teja)]">
                    {libreError}
                  </p>
                )}
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    className={`${principal} flex-1`}
                    onClick={anadeLibre}
                  >
                    Añadir
                  </button>
                  <button
                    type="button"
                    className={secundario}
                    onClick={() => setVentana(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                {ventana.foto && (
                  <img
                    src={ventana.foto.url}
                    alt=""
                    width={ventana.foto.ancho}
                    height={ventana.foto.alto}
                    className="aspect-[16/9] w-full object-cover"
                  />
                )}
                <div className="p-5">
                  <p className="font-[family-name:var(--font-display)] text-xl">
                    {ventana.nombre}
                  </p>

                  {ventana.variantes.length > 0 && (
                    <>
                      <p className="mt-1 text-sm text-[color:var(--color-ink-muted)]">
                        Elige el tamaño: se añade al tocarlo.
                      </p>
                      <div className="mt-4 grid gap-2">
                        {ventana.variantes.map((v) => (
                          <button
                            key={v.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-4 border border-[color:var(--color-avellana)] bg-white px-4 py-3 text-base font-semibold hover:bg-[color:var(--color-latte)]"
                            onClick={() => {
                              anade({
                                slug: ventana.slug,
                                nombre: ventana.nombre,
                                variantId: v.id,
                                detalle: v.label,
                                precioCents: v.precioCents,
                              });
                              setVentana(null);
                            }}
                          >
                            <span>{v.label}</span>
                            <span className="tabular-nums">
                              {euros(v.precioCents)}
                            </span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}

                  {ventana.pack && (
                    <div className="mt-3 space-y-3">
                      {ventana.pack.lleva.length > 0 && (
                        <p className="text-sm text-[color:var(--color-ink-muted)]">
                          Lleva: {ventana.pack.lleva.join(" · ")}
                        </p>
                      )}
                      {ventana.pack.huecos.map((h) => (
                        <label key={h.id} className="block">
                          <span className={etiqueta}>{h.etiqueta}</span>
                          <select
                            className={campo}
                            value={eleccion[h.id] ?? ""}
                            onChange={(e) =>
                              setEleccion((x) => ({
                                ...x,
                                [h.id]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Elige…</option>
                            {h.opciones.map((o) => (
                              <option key={o.slug} value={o.slug}>
                                {o.nombre}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                      {ventana.pack.conFoto && (
                        <p className="text-sm text-[color:var(--color-teja)]">
                          Lleva foto en la plancha: pídesela al cliente y
                          apúntalo en las notas.
                        </p>
                      )}
                      <button
                        type="button"
                        className={`${principal} w-full py-3`}
                        disabled={ventana.pack.huecos.some(
                          (h) => !eleccion[h.id],
                        )}
                        onClick={() => anadePack(ventana)}
                      >
                        Añadir · {euros(ventana.precioCents ?? 0)}
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    className={`${secundario} mt-3 w-full`}
                    onClick={() => setVentana(null)}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
