import { pool } from "~/lib/db/pool";
import { patronBusqueda } from "~/lib/db/busqueda";
import type { PricedOrder } from "~/lib/pedido";
import type { PiezaResuelta } from "~/data/packs";

/**
 * Pedidos. Único sitio del proyecto con SQL de pedidos: hacia fuera todo va
 * en camelCase y nadie ve un nombre de columna.
 */

export type LineaPedido = {
  slug: string | null;
  nombre: string;
  varianteLabel: string | null;
  qty: number;
  unitPriceCents: number;
  /** Qué lleva un pack, ya resuelto al pedirlo; nulo en una línea normal. */
  detalle: PiezaResuelta[] | null;
  /** Foto que subió el cliente (tarta con foto); nulo si no hay. */
  fotoUrl: string | null;
};

export type PedidoConLineas = {
  id: string;
  /** Número correlativo (migración 023); se asigna al entrar en la lista. */
  numero: number | null;
  userId: string | null;
  stripeSessionId: string | null;
  /**
   * Nulos SOLO en un pedido reconstruido al que Stripe no le dio el dato
   * (migración 008). Un pedido normal los lleva siempre. El panel tiene que
   * enseñarlos como «sin datos», nunca rellenarlos con un valor por defecto.
   */
  mode: "domicilio" | "recogida" | null;
  fechaEntrega: string | null;
  slot: "morning" | "afternoon" | null;
  storeId: string | null;
  address: string | null;
  postalCode: string | null;
  email: string;
  telefono: string;
  nombre: string | null;
  notas: string | null;
  subtotalCents: number;
  envioCents: number;
  totalCents: number;
  /** El panel solo lista `pagado` y `sin_pago`; `iniciado` es un carrito abandonado. */
  estado: "pagado" | "sin_pago";
  reconstruido: boolean;
  createdAt: Date;
  lineas: LineaPedido[];
};

/** Lo mínimo que necesita saber quien confirma un cobro. */
export type PedidoAnotado = { id: string; notificadoEn: Date | null; numero?: number | null };

export type PedidoReconstruido = {
  stripeSessionId: string;
  /**
   * Lo que se sepa de la entrega, o null. Nada de valores por defecto: un
   * pedido reconstruido que dice «Recogida en tienda, hoy» cuando era un
   * reparto a domicilio para el 24 de diciembre es peor que uno que admite
   * no saberlo, porque nadie va a ir a comprobarlo. Quien llama lo saca de
   * los metadatos de Stripe y valida cada campo antes de pasarlo.
   */
  mode: "domicilio" | "recogida" | null;
  fechaEntrega: string | null;
  slot: "morning" | "afternoon" | null;
  storeId: string | null;
  address: string | null;
  postalCode: string | null;
  email: string;
  telefono: string;
  nombre: string | null;
  notas: string | null;
  totalCents: number;
  lineas: { nombre: string; qty: number; unitPriceCents: number }[];
};

/**
 * Anota el pedido antes de mandar a nadie a pagar. Nace 'iniciado': si el
 * cobro no llega a completarse, se queda así y no ensucia el panel.
 *
 * Va en una transacción porque un pedido sin sus líneas no es un pedido: es
 * un importe sin explicación.
 */
export async function crearPedidoIniciado(
  order: PricedOrder,
  // `sin_pago`: Stripe sin configurar, el pedido se anota sin cobro para que
  // llegue al panel (migración 010). Por defecto, `iniciado`, camino de Stripe.
  {
    estado = "iniciado",
    dispositivo = null,
  }: {
    estado?: "iniciado" | "sin_pago";
    /** Móvil, tablet u ordenador, para el Resumen (migración 022). */
    dispositivo?: "movil" | "tablet" | "ordenador" | null;
  } = {},
): Promise<string> {
  const p = order.payload;
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const { rows } = await cliente.query<{ id: string }>(
      `insert into pedidos (
         user_id, mode, fecha_entrega, slot, store_id, address, postal_code,
         email, telefono, nombre, notas,
         subtotal_cents, envio_cents, total_cents, estado, dispositivo
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       returning id`,
      [
        order.userId ?? null,
        p.mode,
        p.dateISO,
        p.slot ?? null,
        p.storeId ?? null,
        p.address ?? null,
        p.postalCode ?? null,
        p.email,
        p.phone,
        p.name ?? null,
        p.notes ?? null,
        order.subtotalCents,
        order.shippingCents,
        order.totalCents,
        estado,
        dispositivo,
      ],
    );
    const id = rows[0].id;

    for (const [i, linea] of order.lines.entries()) {
      await cliente.query(
        `insert into lineas_pedido
           (pedido_id, slug, nombre, variante_label, qty, unit_price_cents, orden,
            detalle, foto_url)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          linea.slug,
          linea.name,
          linea.variantLabel ?? null,
          linea.qty,
          linea.unitPriceCents,
          i,
          // jsonb: se serializa a mano, `pg` convertiría un array JS en un
          // array de Postgres y no en JSON.
          linea.detalle ? JSON.stringify(linea.detalle) : null,
          linea.fotoUrl ?? null,
        ],
      );
    }

    await cliente.query("commit");
    return id;
  } catch (err) {
    await cliente.query("rollback");
    throw err;
  } finally {
    cliente.release();
  }
}

/** La referencia de Stripe se conoce después de crear la sesión de pago. */
export async function anotarSesionStripe(
  pedidoId: string,
  sessionId: string,
): Promise<void> {
  await pool.query(`update pedidos set stripe_session_id = $2 where id = $1`, [
    pedidoId,
    sessionId,
  ]);
}

/**
 * Da el pedido por pagado. Idempotente a propósito: Stripe reintenta el
 * mismo aviso si nuestra respuesta falla, y esos reintentos no pueden
 * duplicar el pedido ni volver a poner en marcha nada.
 *
 * Devuelve también `notificadoEn`, que es lo que permite a quien llama saber
 * si el correo al obrador ya salió o si este reintento todavía tiene que
 * mandarlo. Devuelve null si el pago no corresponde a ningún pedido nuestro
 * (por ejemplo, si la base de datos estaba caída al cobrar).
 */
export async function marcarPagado(ref: {
  pedidoId?: string | null;
  sessionId: string;
}): Promise<PedidoAnotado | null> {
  const { rows } = await pool.query<PedidoAnotado>(
    `update pedidos
        set estado = 'pagado',
            stripe_session_id = coalesce(stripe_session_id, $2)
      where (id = $1::uuid or stripe_session_id = $2)
      returning id, notificado_en as "notificadoEn", numero`,
    [ref.pedidoId ?? null, ref.sessionId],
  );
  return rows[0] ?? null;
}

/**
 * Último recurso: el cobro salió bien pero el pedido no llegó a anotarse
 * (Postgres caído en ese momento). Se reconstruye con lo que da Stripe, que
 * es menos —no hay slugs ni desglose de envío— y por eso queda marcado.
 * Es preferible a que el pedido no aparezca en el panel.
 *
 * Lo que no se sabe se escribe como NULL. Antes esta función clavaba
 * `mode = 'recogida'` y `fecha_entrega = current_date` porque las columnas
 * eran `not null`, mientras quien la llamaba tenía delante los metadatos de
 * Stripe con la modalidad y el día de verdad y no los pasaba. El panel
 * enseñaba entonces un envío a domicilio del 24 de diciembre como
 * «10/09/2026 · Recogida en tienda»: no era detalle que faltara, era detalle
 * inventado, y encima contradecía al correo del obrador, que sí llevaba los
 * datos buenos. La migración 008 permite el nulo justo para esto.
 */
export async function crearPedidoReconstruido(
  datos: PedidoReconstruido,
): Promise<PedidoAnotado> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const { rows } = await cliente.query<PedidoAnotado>(
      // `envio_cents` va a 0 y el total entero al subtotal: Stripe no
      // desglosa el reparto, así que no hay forma de separarlos. Eso sí es
      // «falta detalle», y por eso la fila queda marcada `reconstruido`.
      `insert into pedidos (
         stripe_session_id, mode, fecha_entrega, slot, store_id, address,
         postal_code, email, telefono, nombre, notas,
         subtotal_cents, envio_cents, total_cents, estado, reconstruido
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, 0, $12, 'pagado', true)
       on conflict (stripe_session_id) do update set estado = 'pagado'
       returning id, notificado_en as "notificadoEn", numero`,
      [
        datos.stripeSessionId,
        datos.mode,
        datos.fechaEntrega,
        datos.slot,
        datos.storeId,
        datos.address,
        datos.postalCode,
        datos.email,
        datos.telefono,
        datos.nombre,
        datos.notas,
        datos.totalCents,
      ],
    );
    const id = rows[0].id;

    // Idempotencia frente a entregas repetidas del webhook: si dos avisos de
    // Stripe llegan mientras la base seguía caída, el segundo `insert` de
    // arriba entra por la rama `on conflict` y devuelve el mismo `id` que el
    // primero. Sin este borrado previo, cada entrega añadiría su propia
    // copia de las líneas; borrando primero, la segunda transacción sustituye
    // las líneas por un juego idéntico en vez de sumarlas.
    await cliente.query("delete from lineas_pedido where pedido_id = $1", [id]);

    for (const [i, linea] of datos.lineas.entries()) {
      await cliente.query(
        `insert into lineas_pedido (pedido_id, nombre, qty, unit_price_cents, orden)
         values ($1,$2,$3,$4,$5)`,
        [id, linea.nombre, linea.qty, linea.unitPriceCents, i],
      );
    }

    await cliente.query("commit");
    return rows[0];
  } catch (err) {
    await cliente.query("rollback");
    throw err;
  } finally {
    cliente.release();
  }
}

/** El aviso al obrador ya salió: un reintento de Stripe no debe repetirlo. */
export async function marcarAvisado(pedidoId: string): Promise<void> {
  await pool.query(
    `update pedidos set notificado_en = now() where id = $1 and notificado_en is null`,
    [pedidoId],
  );
}

/**
 * Lo que ve el panel: solo pagados, del más reciente al más antiguo, con sus
 * líneas. Una sola consulta con agregación en vez de N+1: son pocos pedidos,
 * pero el patrón importa más que el volumen de hoy.
 */
/**
 * Cambia el estado desde el panel: «cobrado en tienda» (sin_pago → pagado) o
 * deshacerlo (pagado → sin_pago). Devuelve false si el pedido no admite ese
 * cambio: un `iniciado` es un carrito abandonado camino de Stripe, y un
 * pagado CON referencia de Stripe lo cobró Stripe, así que no se puede
 * «des-cobrar» desde aquí. Lo decide el `where`, no una lectura previa:
 * dos admins pulsando a la vez no pueden dejarlo en un estado imposible.
 */
export async function cambiarEstadoAMano(
  pedidoId: string,
  estado: "pagado" | "sin_pago",
): Promise<boolean> {
  const { rowCount } = await pool.query(
    estado === "pagado"
      ? `update pedidos set estado = 'pagado'
          where id = $1 and estado = 'sin_pago'`
      : `update pedidos set estado = 'sin_pago'
          where id = $1 and estado = 'pagado' and stripe_session_id is null`,
    [pedidoId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * La proyección que arma un `PedidoConLineas`: las columnas en camelCase y
 * las líneas agregadas en una subconsulta, en su orden. Va en una constante
 * para que el panel y el historial del cliente devuelvan exactamente lo
 * mismo.
 */
const PROYECCION_PEDIDO = `
  p.id,
  p.numero,
  p.user_id           as "userId",
  p.stripe_session_id as "stripeSessionId",
  p.mode,
  to_char(p.fecha_entrega, 'YYYY-MM-DD') as "fechaEntrega",
  p.slot,
  p.store_id     as "storeId",
  p.address,
  p.postal_code  as "postalCode",
  p.email,
  p.telefono,
  p.nombre,
  p.notas,
  p.subtotal_cents as "subtotalCents",
  p.envio_cents    as "envioCents",
  p.total_cents    as "totalCents",
  p.estado,
  p.reconstruido,
  p.created_at     as "createdAt",
  coalesce(
    (select json_agg(json_build_object(
              'slug', l.slug,
              'nombre', l.nombre,
              'varianteLabel', l.variante_label,
              'qty', l.qty,
              'unitPriceCents', l.unit_price_cents,
              'detalle', l.detalle,
              'fotoUrl', l.foto_url)
            order by l.orden)
       from lineas_pedido l
      where l.pedido_id = p.id),
    '[]'::json
  ) as lineas
`;

export type FiltrosPedidos = {
  /**
   * Días para los que se quiere el pedido (`YYYY-MM-DD`), ambos incluidos.
   * Cualquiera de los dos puede faltar: solo `desde` es «de ahí en
   * adelante». Un solo día es `desde === hasta`.
   */
  entregaDesde?: string;
  entregaHasta?: string;
  /** Días en que entró el pedido, igual que arriba, en hora de Madrid. */
  entradaDesde?: string;
  entradaHasta?: string;
  /**
   * Texto libre: lo que el cliente dice por teléfono. Casa con un trozo del
   * nombre, del correo, del teléfono o de la referencia (el uuid), sin
   * distinguir mayúsculas. Vacío o solo espacios, no filtra.
   */
  texto?: string;
};

/**
 * El `where` de los filtros, compartido por la lista y por la cuenta que
 * pagina: si divergieran, el panel diría «página 3 de 2». Los parámetros
 * van del $1 al $6; quien lo usa pone los suyos detrás.
 */
const WHERE_FILTROS = `
      where p.estado in ('pagado', 'sin_pago')
        and ($1::date is null or p.fecha_entrega >= $1::date)
        and ($2::date is null or p.fecha_entrega <= $2::date)
        and ($3::date is null
             or (p.created_at at time zone 'Europe/Madrid')::date >= $3::date)
        and ($4::date is null
             or (p.created_at at time zone 'Europe/Madrid')::date <= $4::date)
        and ($5::text is null
             or p.nombre ilike $5
             or p.email ilike $5
             or p.telefono ilike $5
             or p.id::text ilike $5
             -- Solo cifras: también el número de pedido, exacto.
             or ($6::text is not null and p.numero::text = $6)
             -- El teléfono se guarda tal como lo escribió el cliente, con o
             -- sin espacios; si lo buscado son solo dígitos se compara sin
             -- separadores por ambos lados.
             or ($6::text is not null
                 and regexp_replace(p.telefono, '\\D', '', 'g') like '%' || $6 || '%'))`;

function argsFiltros(f: FiltrosPedidos): unknown[] {
  const busqueda = patronBusqueda(f.texto);
  return [
    f.entregaDesde ?? null,
    f.entregaHasta ?? null,
    f.entradaDesde ?? null,
    f.entradaHasta ?? null,
    busqueda.patron,
    busqueda.soloDigitos,
  ];
}

export async function listarPedidos(
  limite = 100,
  filtros: FiltrosPedidos = {},
  /** Cuántos saltarse, para paginar. */
  desplazamiento = 0,
): Promise<PedidoConLineas[]> {
  const { rows } = await pool.query<PedidoConLineas>(
    `select ${PROYECCION_PEDIDO}
       from pedidos p
     ${WHERE_FILTROS}
      -- Buscando un número, el pedido con ese número va primero (luego los
      -- que solo lo llevan en el teléfono).
      order by (p.numero::text = $6) desc nulls last, p.created_at desc, p.id
      limit $7 offset $8`,
    [...argsFiltros(filtros), limite, desplazamiento],
  );
  return rows;
}

/** Cuántos pedidos casan con los filtros, para saber cuántas páginas hay. */
export async function contarPedidos(filtros: FiltrosPedidos = {}): Promise<number> {
  const { rows } = await pool.query<{ total: string }>(
    `select count(*) as total from pedidos p ${WHERE_FILTROS}`,
    argsFiltros(filtros),
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Lo que ve el cliente en /cuenta: SUS pedidos, del más reciente al más
 * antiguo, con sus líneas. Mismo criterio de estado que el panel: un
 * `iniciado` es un carrito abandonado camino de Stripe, no un pedido, y
 * enseñárselo como tal solo confundiría. Los pedidos de invitado con su
 * mismo correo no salen: sin sesión no hay forma de saber que eran suyos.
 */
export async function listarPedidosDeCliente(
  userId: string,
  limite = 20,
): Promise<PedidoConLineas[]> {
  const { rows } = await pool.query<PedidoConLineas>(
    `select ${PROYECCION_PEDIDO}
       from pedidos p
      where p.user_id = $1
        and p.estado in ('pagado', 'sin_pago')
      order by p.created_at desc
      limit $2`,
    [userId, limite],
  );
  return rows;
}
