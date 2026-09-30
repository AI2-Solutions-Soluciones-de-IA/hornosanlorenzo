/**
 * Único sitio del panel donde se convierte un precio escrito a mano en euros
 * a céntimos enteros (lo usan Productos y Packs).
 *
 * Acepta coma o punto decimal («19,99», «19.99»), el símbolo del euro
 * («12,50 €») y miles con punto cuando hay coma decimal («1.234,50»). Sin
 * coma, un punto es siempre el decimal: «1.234» son 1,23 €, como hasta ahora.
 *
 * `Math.round` porque `19.99 * 100` en coma flotante da `1998.9999999999998`:
 * sin redondear se guardaría un céntimo de menos.
 *
 * Devuelve null si está vacío o no se entiende como precio.
 */
export function eurosACentimos(texto: string): number | null {
  const limpio = texto.replace(/€/g, "").trim();
  if (limpio === "") return null;
  let normal: string;
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(limpio)) {
    normal = limpio.replace(/\./g, "").replace(",", ".");
  } else if (/^-?(\d+([.,]\d*)?|[.,]\d+)$/.test(limpio)) {
    normal = limpio.replace(",", ".");
  } else {
    return null;
  }
  const valor = Number(normal);
  return Number.isFinite(valor) ? Math.round(valor * 100) : null;
}
