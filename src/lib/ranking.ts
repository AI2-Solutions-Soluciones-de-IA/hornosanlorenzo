import type { ProductoEnRanking } from "~/lib/db/estadisticas";

/**
 * Las dos listas del Resumen a partir del ranking que da la base (de más a
 * menos vendido, «Fuera de carta» al final). Sin `pg` a propósito: así se
 * prueba sin levantar nada.
 *
 * - Los que más: solo los que han vendido algo; un top 10 con ceros dentro
 *   diría «el décimo más vendido» de algo que no se ha vendido.
 * - Los que menos: desde el final, empezando por los que no venden nada,
 *   que son justo los que interesa ver.
 * - «Fuera de carta» no es un producto: va aparte.
 */
export function partesDelRanking(ranking: ProductoEnRanking[], n: number) {
  const carta = ranking.filter((p) => p.slug !== null);
  return {
    masVendidos: carta.filter((p) => p.unidades > 0).slice(0, n),
    menosVendidos: carta.slice(-n).reverse(),
    fueraDeCarta: ranking.find((p) => p.slug === null) ?? null,
  };
}
