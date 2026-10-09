/**
 * Reglas de entrega.
 *
 *   Envío a domicilio — «Entregamos en 24 horas. Entrega programada al día
 *   siguiente para pedidos realizados antes de las 18:00 del día anterior.»
 *
 *   Recogida en tienda — el mismo día en Alcobendas, a partir de las 17:00,
 *   si se pide antes de las 13:00; en Pozuelo, siempre de un día para otro.
 *   Para el día siguiente hay que pedir antes de las 17:00: a esa hora se
 *   cierra la lista que el obrador prepara al día siguiente.
 *   Alcobendas abre también los domingos; sábados, domingos y festivos
 *   cierra a las 14:30, así que ese día solo hay mañana y no hay mismo día.
 *
 *   Cualquier modalidad — desde 250 € el obrador necesita dos días.
 */

import { stores } from "~/data/stores";

export type DeliveryMode = "domicilio" | "recogida";

/** Hora límite para que el envío salga al día siguiente. */
export const CUTOFF_HOUR = 18;

/** Hora límite para que la recogida del mismo día siga siendo posible. */
export const RECOGIDA_MISMO_DIA_HOUR = 13;

/** Hora límite para recoger al día siguiente: se cierra la lista del obrador. */
export const RECOGIDA_DIA_SIGUIENTE_HOUR = 17;

/** Una recogida del mismo día no está lista hasta esta hora: solo vale la tarde. */
export const RECOGIDA_MISMO_DIA_DESDE = "17:00";

/** Desde este importe el obrador necesita dos días: no vale el día siguiente. */
export const DOS_DIAS_DESDE_CENTS = 25_000;

/** Tiendas que nunca preparan para el mismo día. */
const TIENDAS_SIN_MISMO_DIA: readonly string[] = ["pozuelo"];

export const DOS_DIAS_COPY =
  "Los pedidos desde 250 € necesitan dos días de preparación.";

export const MODE_COPY: Record<DeliveryMode, { label: string; body: string }> =
  {
    domicilio: {
      label: "Envío a domicilio",
      body: "Reparto de lunes a sábado. Entregamos en 24 horas. Entrega programada al día siguiente para pedidos realizados antes de las 18:00 del día anterior. Pedido mínimo 25 € de lunes a jueves y 35 € viernes, sábados y vísperas de festivo. Solo Madrid capital, Alcobendas, San Sebastián de los Reyes, Tres Cantos y Pozuelo de Alarcón.",
    },
    recogida: {
      label: "Recogida en tienda",
      body: "Recogida el mismo día en Alcobendas a partir de las 17h para pedidos antes de las 13h. Para el día siguiente, pide antes de las 17h. Sábados, domingos y festivos, Alcobendas de 09:30 a 14:30. En Pozuelo, siempre de un día para otro.",
    },
  };

/**
 * El envío a domicilio no se elige por franja: el reparto propio sale por la
 * mañana y entrega antes del cierre del mediodía. Solo la recogida en tienda
 * ofrece mañana o tarde.
 */
/**
 * Códigos postales a los que llega el reparto propio.
 *
 * Madrid capital son los CP que existen de verdad (28001–28055), no todo el
 * prefijo 280xx: 28056–28099 son apartados de correos y códigos
 * administrativos, no direcciones a las que se pueda repartir.
 *
 * **Los rangos los tomé de fuentes públicas, no del cliente**, así que hay
 * que validarlos con el obrador antes de cobrar (ver tasks/todo.md).
 */
const CP_RANGOS: readonly {
  desde: number;
  hasta: number;
  municipio: string;
}[] = [
  { desde: 28001, hasta: 28055, municipio: "Madrid capital" },
  { desde: 28100, hasta: 28109, municipio: "Alcobendas" },
  { desde: 28220, hasta: 28224, municipio: "Pozuelo de Alarcón" },
  { desde: 28700, hasta: 28709, municipio: "San Sebastián de los Reyes" },
  { desde: 28760, hasta: 28760, municipio: "Tres Cantos" },
];

/** El CP es de reparto. Espera cinco dígitos; cualquier otra cosa es `false`. */
export const admiteCP = (cp: string): boolean => {
  if (!/^\d{5}$/.test(cp)) return false;
  const n = Number(cp);
  return CP_RANGOS.some((r) => n >= r.desde && n <= r.hasta);
};

/** Municipio de un CP de reparto, para confirmarle al cliente dónde entrega. */
export const municipioDeCP = (cp: string): string | null => {
  if (!/^\d{5}$/.test(cp)) return null;
  const n = Number(cp);
  return CP_RANGOS.find((r) => n >= r.desde && n <= r.hasta)?.municipio ?? null;
};

/**
 * Teléfono de contacto del pedido. Se admite escribirlo con espacios, puntos
 * o guiones, y con prefijo +34: lo que importa es que queden nueve dígitos
 * españoles, que es con lo que el obrador puede llamar.
 */
export const normalizaTelefono = (tel: string): string => {
  const digitos = tel.replace(/\D/g, "");
  return digitos.startsWith("34") && digitos.length === 11
    ? digitos.slice(2)
    : digitos;
};

export const esTelefonoValido = (tel: string): boolean =>
  /^[6789]\d{8}$/.test(normalizaTelefono(tel));

/** Municipios a los que llega el reparto propio. */
export const ZONA_REPARTO = [
  "Madrid capital",
  "Alcobendas",
  "San Sebastián de los Reyes",
  "Tres Cantos",
  "Pozuelo de Alarcón",
] as const;

export const ZONA_REPARTO_COPY = `Solo enviamos a ${ZONA_REPARTO.slice(0, -1).join(", ")} y ${ZONA_REPARTO.at(-1)}.`;

export const ENTREGA_DOMICILIO_COPY = "Entrega antes de las 14:30h";

/**
 * Día sin servicio. El reparto propio no sale los domingos; la recogida
 * depende de la tienda (Alcobendas abre también el domingo). Sin tienda
 * conocida, el domingo se da por cerrado.
 */
export const isClosed = (
  date: Date,
  { mode, storeId }: { mode?: DeliveryMode | null; storeId?: string } = {},
): boolean => {
  if (mode === "recogida") {
    const tienda = stores.find((s) => s.id === storeId);
    if (tienda) return !tienda.diasRecogida.includes(date.getDay());
  }
  return date.getDay() === 0;
};

export const toISO = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const fromISO = (iso: string): Date => new Date(`${iso}T00:00:00`);

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/** Lo que condiciona el primer día disponible, además de la modalidad. */
export type PlazoOpts = {
  /** Subtotal del pedido: desde 250 € hacen falta dos días. */
  subtotalCents?: number;
  /** Solo en recogida: Pozuelo nunca prepara para el mismo día. */
  storeId?: string;
};

/**
 * Primer día que se puede elegir.
 *
 * Recogida: hoy mismo si aún no son las 13:00, salvo en Pozuelo, que siempre
 * es de un día para otro; mañana si aún no son las 17:00; si no, pasado.
 * Domicilio: mañana si aún no son las 18:00; si no, pasado.
 * En ambas, un pedido de 250 € o más no baja de dos días.
 */
export function earliestDate(
  mode: DeliveryMode,
  now: Date = new Date(),
  { subtotalCents = 0, storeId }: PlazoOpts = {},
): string {
  const hora = now.getHours();
  const sinMismoDia = Boolean(
    storeId && TIENDAS_SIN_MISMO_DIA.includes(storeId),
  );
  let dias =
    mode === "recogida"
      ? // Pozuelo nunca prepara para hoy; en Alcobendas hay hasta las 13:00.
        // Para mañana, hasta las 17:00; después, pasado mañana.
        !sinMismoDia && hora < RECOGIDA_MISMO_DIA_HOUR
        ? 0
        : hora < RECOGIDA_DIA_SIGUIENTE_HOUR
          ? 1
          : 2
      : hora < CUTOFF_HOUR
        ? 1
        : 2;

  if (subtotalCents >= DOS_DIAS_DESDE_CENTS) dias = Math.max(dias, 2);

  // Se salta lo cerrado y, en recogida, los días sin ninguna franja posible
  // (un sábado para el mismo día en Alcobendas, por ejemplo).
  let d = addDays(now, dias);
  while (
    isClosed(d, { mode, storeId }) ||
    (mode === "recogida" &&
      franjasRecogida(storeId, toISO(d), now).length === 0)
  ) {
    d = addDays(d, 1);
  }
  return toISO(d);
}

export type Franja = "morning" | "afternoon";

/** Sábado, domingo o festivo: los días en que la tienda cierra antes. */
export const esDiaReducido = (dateISO: string): boolean => {
  const dia = fromISO(dateISO).getDay();
  return dia === 0 || dia === 6 || FESTIVOS.has(dateISO);
};

/**
 * Franjas en que se puede recoger ese día en esa tienda.
 *
 * Con horario reducido (Alcobendas cierra a las 14:30 en fin de semana y
 * festivo; Pozuelo, a las 15:00 solo en festivo) solo hay mañana. Para hoy mismo el pedido no está listo hasta las
 * 17:00, así que solo hay tarde. Las dos cosas a la vez dejan el día vacío.
 */
export function franjasRecogida(
  storeId: string | undefined,
  dateISO: string,
  now: Date = new Date(),
): Franja[] {
  const tienda = stores.find((s) => s.id === storeId);
  const reducido =
    (tienda?.pickupUntilReducido && esDiaReducido(dateISO)) ||
    (tienda?.cierreFestivo && FESTIVOS.has(dateISO));
  let franjas: Franja[] = reducido ? ["morning"] : ["morning", "afternoon"];
  if (dateISO === toISO(now))
    franjas = franjas.filter((f) => f === "afternoon");
  return franjas;
}

/** El calendario abre con la opción más permisiva: la recogida. */
export function earliestSelectableDate(now: Date = new Date()): string {
  return earliestDate("recogida", now);
}

/* -------------------------------------------------------------------------
 * Reglas comerciales del reparto.
 * El envío sigue siendo gratuito. El pedido mínimo del reparto a domicilio
 * depende del día de entrega: 25 € de lunes a jueves; 35 € los viernes, los
 * sábados y las vísperas de festivo.
 * ---------------------------------------------------------------------- */

/** Coste del reparto a domicilio, en céntimos. 0 = gratuito. */
export const SHIPPING_CENTS = 0;

/** Importe a partir del cual el reparto sale gratis. null = tarifa siempre igual. */
export const FREE_SHIPPING_FROM_CENTS: number | null = null;

/** Pedido mínimo del reparto a domicilio de lunes a jueves, en céntimos. */
export const MIN_ORDER_CENTS = 2_500;

/** Pedido mínimo del reparto los viernes, sábados y vísperas de festivo. */
export const MIN_ORDER_ALTO_CENTS = 3_500;

export const MIN_ORDER_COPY =
  "Pedido mínimo a domicilio: 25 € de lunes a jueves; 35 € viernes, sábados y vísperas de festivo.";

/**
 * Festivos de Madrid, en ISO. Solo sirven para saber qué día es víspera.
 *
 * 2026: los doce de la Comunidad (Decreto 75/2025, BOCM 25-9-2025) y los dos
 * locales de Madrid capital (BOCM 12-12-2025), que es donde cae casi todo el
 * reparto. Los locales de Alcobendas, Pozuelo, Sanse y Tres Cantos no están:
 * **falta confirmar con el obrador si también cuentan**.
 * 2027: los doce de la Comunidad (Decreto 82/2026, BOCM 1-10-2026, núm. 234;
 * el 2 de mayo cae en domingo y no se traslada). **Faltan los dos locales de
 * Madrid capital**, que el Ayuntamiento publica hacia diciembre (en 2026
 * fueron San Isidro y La Almudena).
 */
export const FESTIVOS: ReadonlySet<string> = new Set([
  "2026-01-01",
  "2026-01-06",
  "2026-04-02",
  "2026-04-03",
  "2026-05-01",
  "2026-05-02",
  "2026-05-15", // San Isidro, local de Madrid
  "2026-08-15",
  "2026-10-12",
  "2026-11-02",
  "2026-11-09", // La Almudena, local de Madrid
  "2026-12-07",
  "2026-12-08",
  "2026-12-25",
  "2027-01-01",
  "2027-01-06",
  "2027-03-19", // San José
  "2027-03-25", // Jueves Santo
  "2027-03-26", // Viernes Santo
  "2027-05-01",
  "2027-08-16", // traslado de la Asunción (el 15 es domingo)
  "2027-10-12",
  "2027-11-01",
  "2027-12-06",
  "2027-12-08",
  "2027-12-25",
]);

/** El día siguiente es festivo. */
export const esVisperaDeFestivo = (dateISO: string): boolean =>
  FESTIVOS.has(toISO(addDays(fromISO(dateISO), 1)));

/**
 * Pedido mínimo para una modalidad y un día de entrega. La recogida no tiene
 * mínimo; el reparto sube a 35 € los viernes, sábados y vísperas de festivo.
 */
export function minimoPedidoCents(mode: DeliveryMode, dateISO: string): number {
  if (mode === "recogida") return 0;
  const dia = fromISO(dateISO).getDay();
  return dia === 5 || dia === 6 || esVisperaDeFestivo(dateISO)
    ? MIN_ORDER_ALTO_CENTS
    : MIN_ORDER_CENTS;
}

/** Lo que cuesta el reparto para un subtotal dado. La recogida nunca cuesta. */
export function shippingCents(
  mode: DeliveryMode,
  subtotalCents: number,
): number {
  if (mode === "recogida") return 0;
  if (
    FREE_SHIPPING_FROM_CENTS !== null &&
    subtotalCents >= FREE_SHIPPING_FROM_CENTS
  ) {
    return 0;
  }
  return SHIPPING_CENTS;
}

/** ¿Llega el pedido al mínimo exigido para su modalidad y día de entrega? */
export function meetsMinimum(
  mode: DeliveryMode,
  subtotalCents: number,
  dateISO: string,
): boolean {
  return subtotalCents >= minimoPedidoCents(mode, dateISO);
}

/** ¿Es una fecha admisible para esta modalidad, importe y tienda? */
export function isDateAllowed(
  mode: DeliveryMode,
  dateISO: string,
  now: Date = new Date(),
  opts: PlazoOpts = {},
): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return false;
  const date = fromISO(dateISO);
  if (Number.isNaN(date.getTime())) return false;
  if (isClosed(date, { mode, storeId: opts.storeId })) return false;
  if (
    mode === "recogida" &&
    franjasRecogida(opts.storeId, dateISO, now).length === 0
  ) {
    return false;
  }
  return dateISO >= earliestDate(mode, now, opts);
}
