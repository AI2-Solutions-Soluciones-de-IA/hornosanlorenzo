// Interruptor para cerrar la venta online sin quitar la tienda: el día del
// cambio de dominio la web nueva ya se ve en hornosanlorenzo.com antes de
// tener las claves reales de Stripe, y en ese rato no debe aceptar pedidos.
// Se enciende con `VENTA_ONLINE_PAUSADA=1` en Vercel y se apaga quitándola;
// en los dos casos hace falta desplegar, que además vacía la caché ISR.

export const VENTA_PAUSADA_COPY =
  "La venta online estará disponible en unos instantes.";

export function ventaOnlinePausada(): boolean {
  // `String()` porque Astro sustituye un `1` o un `true` de las variables de
  // entorno por el número o el booleano, no por el texto.
  const valor = String(
    import.meta.env.VENTA_ONLINE_PAUSADA ?? process.env.VENTA_ONLINE_PAUSADA ?? "",
  );
  return valor === "1" || valor === "true";
}
