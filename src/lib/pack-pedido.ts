/**
 * Lo que la isla `PackPedido` necesita calcular en el navegador: el desglose
 * que se guarda en el carrito y si ya se puede añadir. Sin imports a
 * propósito: va en el paquete del navegador, y arrastrar `~/data/packs` (o
 * algo de servidor) solo para esto lo engordaría sin motivo.
 *
 * El carrito solo enseña este desglose; el pedido guarda el suyo, que sale
 * de `resolverPack` en el servidor.
 */

export type OpcionHueco = { slug: string; name: string };

/** Una pieza del pack tal y como llega a la isla, en el orden de la ficha. */
export type PiezaPedido =
  | { tipo: "fija"; texto: string }
  | {
      tipo: "eleccion";
      id: string;
      titulo: string;
      /** Etiqueta del desplegable: «Sabor de la empanada». */
      etiqueta: string;
      opciones: OpcionHueco[];
    };

/**
 * El desglose de la línea del carrito: cada pieza en orden, la fija tal cual
 * y la elegida como «<etiqueta del hueco>: <nombre elegido>» («Sabor de la
 * empanada: Empanada de carne»; el título entero, con sus raciones, se hacía
 * largo en el carrito). null si falta alguna elección o no corresponde a una
 * opción del hueco.
 */
export function detallePack(
  piezas: readonly PiezaPedido[],
  elegidos: Readonly<Record<string, string>>,
): string[] | null {
  const res: string[] = [];
  for (const p of piezas) {
    if (p.tipo === "fija") {
      res.push(p.texto);
      continue;
    }
    const opcion = p.opciones.find((o) => o.slug === elegidos[p.id]);
    if (!opcion) return null;
    res.push(`${p.etiqueta}: ${opcion.name}`);
  }
  return res;
}

/**
 * Qué falta para poder añadir, en el orden en que se ve en la ficha, o null
 * si está todo. Sirve para deshabilitar el botón y para decir por qué.
 */
export function faltaParaAnadir(
  piezas: readonly PiezaPedido[],
  elegidos: Readonly<Record<string, string>>,
  foto: { exigida: boolean; url: string | null },
): string | null {
  for (const p of piezas) {
    if (
      p.tipo === "eleccion" &&
      !p.opciones.some((o) => o.slug === elegidos[p.id])
    ) {
      return `Elige ${p.etiqueta.toLowerCase()}.`;
    }
  }
  if (foto.exigida && !foto.url) return "Sube tu foto para la plancha.";
  return null;
}
