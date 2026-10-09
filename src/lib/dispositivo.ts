/**
 * Desde qué aparato llega un pedido: móvil, tablet u ordenador, para el
 * Resumen del panel. Lógica pura: la usa `/api/checkout` con las cabeceras
 * de la petición.
 */
export type Dispositivo = "movil" | "tablet" | "ordenador";

export const DISPOSITIVOS: readonly Dispositivo[] = ["movil", "tablet", "ordenador"];

/**
 * A partir del User-Agent. Las tablets van primero: un iPad o una tablet
 * Android dicen «Mobile» o «Android» igual que un móvil. Una tablet Android
 * se distingue porque NO lleva «Mobile».
 *
 * `pista` es lo que avisa el navegador (cabecera `x-dispositivo`): un iPad
 * moderno se presenta como un Mac y solo el navegador sabe que es táctil.
 * Se le hace caso únicamente para pasar de «ordenador» a «tablet».
 */
export function dispositivoDe(userAgent: string | null | undefined, pista?: string | null): Dispositivo {
  const ua = userAgent ?? "";
  if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)))
    return "tablet";
  if (/Mobi|iPhone|iPod|Android|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) return "movil";
  return pista === "tablet" ? "tablet" : "ordenador";
}
