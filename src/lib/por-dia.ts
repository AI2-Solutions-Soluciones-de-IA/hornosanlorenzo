import type { PorDia } from "~/lib/db/estadisticas";
import { diasEntre } from "~/lib/visitas";

/** Por encima de esto (un trimestre) solo salen los días con pedidos. */
export const MAX_DIAS_RELLENOS = 92;

/**
 * Las tablas por día del resumen con todos los días del rango, también los
 * que no tienen pedidos, a cero (26-11-2026): sin ellos, «Próximos 7 días»
 * parecía cortarse antes de tiempo. En rangos largos se dejan solo los días
 * con pedidos, para no llenar la página de ceros.
 */
export function conDiasVacios(filas: readonly PorDia[], desde: string, hasta: string): PorDia[] {
  const dias = diasEntre(desde, hasta);
  if (dias.length > MAX_DIAS_RELLENOS) return [...filas];
  const porDia = new Map(filas.map((f) => [f.dia, f]));
  return dias.map((dia) => porDia.get(dia) ?? { dia, pedidos: 0, productos: 0, importeCents: 0 });
}
