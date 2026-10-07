import { Resend } from "resend";

/**
 * Único punto de salida de correo. Cambiar de proveedor es reescribir este
 * fichero; nada más en el proyecto importa `resend`.
 *
 * Sin clave no lanza: devuelve `ok: false`. Un correo que no sale no puede
 * tumbar un pedido que ya está pagado.
 */
export type Correo = {
  para: string;
  asunto: string;
  texto: string;
  /** Cabeceras extra, p. ej. `List-Unsubscribe` en los envíos a suscritos. */
  cabeceras?: Record<string, string>;
};

export async function enviarCorreo({
  para,
  asunto,
  texto,
}: Correo): Promise<{ ok: boolean; error?: string }> {
  const clave = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  const remitente =
    import.meta.env.ORDER_FROM_EMAIL ?? process.env.ORDER_FROM_EMAIL;

  if (!clave || !remitente) {
    console.error("[email] sin RESEND_API_KEY o ORDER_FROM_EMAIL: no se envía");
    return { ok: false, error: "Correo no configurado." };
  }

  const { error } = await new Resend(clave).emails.send({
    from: remitente,
    to: para,
    subject: asunto,
    text: texto,
  });

  if (error) {
    console.error("[email] el proveedor rechazó el envío", error);
    return { ok: false, error: "No se pudo enviar el correo." };
  }

  return { ok: true };
}

/** El proveedor no admite más de 100 correos por llamada en lote. */
const POR_LOTE = 100;

/**
 * Envío a muchos destinatarios (los suscritos a las ofertas), cada uno con
 * su correo (su enlace de baja es distinto). Va en lotes de 100. Si un lote
 * falla se para y dice cuántos salieron: es mejor saberlo que reintentar a
 * ciegas y mandar dos veces el mismo correo a medio listado.
 */
export async function enviarLote(
  correos: Correo[],
): Promise<{ ok: boolean; enviados: number; error?: string }> {
  const clave = import.meta.env.RESEND_API_KEY ?? process.env.RESEND_API_KEY;
  const remitente =
    import.meta.env.ORDER_FROM_EMAIL ?? process.env.ORDER_FROM_EMAIL;

  if (!clave || !remitente) {
    console.error("[email] sin RESEND_API_KEY o ORDER_FROM_EMAIL: no se envía");
    return { ok: false, enviados: 0, error: "Correo no configurado." };
  }

  const resend = new Resend(clave);
  let enviados = 0;
  for (let i = 0; i < correos.length; i += POR_LOTE) {
    const lote = correos.slice(i, i + POR_LOTE).map((c) => ({
      from: remitente,
      to: c.para,
      subject: c.asunto,
      text: c.texto,
      headers: c.cabeceras,
    }));
    const { error } = await resend.batch.send(lote);
    if (error) {
      console.error("[email] el proveedor rechazó un lote", error);
      return { ok: false, enviados, error: "No se pudieron enviar todos los correos." };
    }
    enviados += lote.length;
  }
  return { ok: true, enviados };
}
