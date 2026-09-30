import { readFileSync } from "node:fs";
import type { DefinicionPack } from "~/data/packs";

/**
 * Los siete packs tal y como se volcaron a la base de datos
 * (`scripts/packs-iniciales.json`, Tarea 2). Solo para pruebas: el sitio lee
 * las definiciones de Postgres (`~/lib/db/packs`), y las pruebas que no
 * tocan la base de datos parten de estos datos reales en vez de inventarse
 * una composición.
 */
export const packsIniciales: readonly DefinicionPack[] = JSON.parse(
  readFileSync(new URL("../../scripts/packs-iniciales.json", import.meta.url), "utf8"),
);

export function packInicial(slug: string): DefinicionPack {
  const def = packsIniciales.find((d) => d.slug === slug);
  if (!def) throw new Error(`No hay pack inicial «${slug}»`);
  return def;
}
