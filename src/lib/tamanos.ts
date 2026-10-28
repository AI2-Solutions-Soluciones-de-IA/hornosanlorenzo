/**
 * Secciones en las que el selector de tamaño arranca en el más grande
 * (28-10-2026): empanadas, planchas y tartas del obrador se encargan casi
 * siempre enteras. Las planchas de la Colección especial también, aunque
 * estén en otra sección. En el resto se abre en el primero, el más pequeño.
 */
const SECCIONES_TAMANO_MAYOR = new Set(["empanadas", "planchas", "tartas-obrador"]);

export function empiezaPorElMayor(p: { slug: string; seccion: string | null }): boolean {
  return (p.seccion !== null && SECCIONES_TAMANO_MAYOR.has(p.seccion)) || p.slug.startsWith("plancha-");
}
