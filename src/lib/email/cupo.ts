/**
 * Vigilancia del cupo de Resend (11-11-2026). Resend no avisa al acercarse
 * al límite del plan gratuito; lo que sí hace es devolver en cada envío lo
 * gastado: `x-resend-daily-quota` (solo en el plan gratuito) y
 * `x-resend-monthly-quota`. El día es el de UTC y se reinicia a medianoche
 * UTC. El cupo es de la CUENTA de Resend, no de la clave: cuenta todo lo que
 * envíe cualquier proyecto de esa cuenta.
 *
 * Funciones puras: `enviar.ts` las usa y decide si manda el aviso.
 */

/** Límites del plan gratuito de Resend. */
export const CUPO_DIARIO = 100;
export const CUPO_MENSUAL = 3000;
/** A partir de aquí se avisa: margen para que no se corte a media tarde. */
export const UMBRAL_DIARIO = 80;
export const UMBRAL_MENSUAL = 2400;

export type Gastado = { dia: number | null; mes: number | null };

const numero = (v: string | undefined): number | null => {
  const n = Number(v);
  return v !== undefined && v !== "" && Number.isFinite(n) ? n : null;
};

/** Lo gastado según las cabeceras de la respuesta (nombres en minúsculas o no). */
export function gastadoDe(cabeceras: Record<string, string> | null | undefined): Gastado {
  const c = Object.fromEntries(
    Object.entries(cabeceras ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    dia: numero(c["x-resend-daily-quota"]),
    mes: numero(c["x-resend-monthly-quota"]),
  };
}

export type Aviso = { clave: string; asunto: string; texto: string };

/**
 * El aviso que toca, o null. La clave identifica el periodo («dia:…» o
 * «mes:…», en UTC como el cupo) para mandarlo una sola vez. Si se pasan los
 * dos umbrales a la vez, manda el mensual, que es el que no se arregla
 * esperando a mañana.
 */
export function avisoDeCupo(g: Gastado, ahora: Date): Aviso | null {
  const dia = ahora.toISOString().slice(0, 10);
  const mes = dia.slice(0, 7);
  if (g.mes !== null && g.mes >= UMBRAL_MENSUAL) {
    return {
      clave: `mes:${mes}`,
      asunto: `Aviso: el correo de la web lleva ${g.mes} de ${CUPO_MENSUAL} envíos este mes`,
      texto: [
        `La cuenta de Resend que manda los correos de la web lleva ${g.mes} de los ${CUPO_MENSUAL} envíos que permite el plan gratuito este mes.`,
        "",
        "Cuando se llegue al límite, los pedidos se seguirán cobrando y guardando en el panel, pero no saldrá ni el aviso al obrador ni la confirmación al cliente hasta el mes que viene.",
        "",
        "Qué hacer: pasar la cuenta de Resend al plan de pago, o vigilar los pedidos en el panel hasta que empiece el mes.",
      ].join("\n"),
    };
  }
  if (g.dia !== null && g.dia >= UMBRAL_DIARIO) {
    return {
      clave: `dia:${dia}`,
      asunto: `Aviso: el correo de la web lleva ${g.dia} de ${CUPO_DIARIO} envíos hoy`,
      texto: [
        `La cuenta de Resend que manda los correos de la web lleva hoy ${g.dia} de los ${CUPO_DIARIO} envíos diarios que permite el plan gratuito.`,
        "",
        "Si se llega al límite, los pedidos se seguirán cobrando y guardando en el panel, pero no saldrá ni el aviso al obrador ni la confirmación al cliente hasta que el cupo se reinicie (a la 1:00 de la madrugada en invierno, a las 2:00 en verano). Esos avisos se reintentan solos después.",
        "",
        "Mientras tanto, mirad los pedidos nuevos en el panel. Si pasa a menudo, conviene pasar la cuenta de Resend al plan de pago, que no tiene límite diario.",
      ].join("\n"),
    };
  }
  return null;
}
