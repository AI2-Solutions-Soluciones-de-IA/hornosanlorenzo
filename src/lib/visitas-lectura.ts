/**
 * Lectura de las visitas para el panel (18-11-2026). Una sola petición a
 * Redis por carga: un `HGETALL` por día, el `PFCOUNT` de todos los días
 * juntos (visitantes únicos del rango, sin contar dos veces a nadie) y
 * quién hay ahora. `null` si Redis no responde.
 */
import { pipeline } from "~/lib/redis";
import {
  CLAVE_AHORA,
  VENTANA_AHORA_MS,
  claveDia,
  claveUnicos,
  diaDesdeHash,
  diaEnMadrid,
  diasEntre,
  type Dia,
} from "~/lib/visitas";

export type Visitas = { dias: Dia[]; unicos: number; ahora: number };

export async function leerVisitas(
  desde: string,
  hasta: string,
): Promise<Visitas | null> {
  const dias = diasEntre(desde, hasta);
  const ahoraMs = Date.now();
  const r = await pipeline([
    ...dias.map((d) => ["HGETALL", claveDia(d)]),
    ["PFCOUNT", ...dias.map(claveUnicos)],
    ["ZCOUNT", CLAVE_AHORA, ahoraMs - VENTANA_AHORA_MS, "+inf"],
  ]);
  if (!r) return null;
  return {
    dias: dias.map((d, i) => diaDesdeHash(d, r[i])),
    unicos: Number(r[dias.length] ?? 0),
    ahora: Number(r[dias.length + 1] ?? 0),
  };
}

/** Lo que se refresca solo, cada minuto: ahora en la web y lo de hoy. */
export async function leerAhora(): Promise<{
  ahora: number;
  visitasHoy: number;
  paginasHoy: number;
} | null> {
  const ahoraMs = Date.now();
  const hoy = claveDia(diaEnMadrid());
  const r = await pipeline([
    ["ZCOUNT", CLAVE_AHORA, ahoraMs - VENTANA_AHORA_MS, "+inf"],
    ["HGET", hoy, "v"],
    ["HGET", hoy, "t"],
  ]);
  if (!r) return null;
  return {
    ahora: Number(r[0] ?? 0),
    visitasHoy: Number(r[1] ?? 0),
    paginasHoy: Number(r[2] ?? 0),
  };
}
