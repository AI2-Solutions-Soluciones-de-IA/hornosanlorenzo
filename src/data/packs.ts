/**
 * Los siete packs de la carta (PACKS_SAN_LORENZO_FINALES, 30-9-2026) y sus
 * cuentas. Aquí solo vive la composición y el copy de la ficha. El nombre y el
 * precio de cada pack están en su fila de `productos` (el precio del pack sale
 * de `price_cents` del propio pack, nunca de esta definición), y el de cada
 * pieza, en la carta: un cambio de precio en la carta se refleja solo en el
 * «comprado suelto» y en el ahorro.
 */

/** Lo mínimo que estas cuentas necesitan saber de un producto de la carta. */
export type ProductoPieza = {
  slug: string;
  name: string;
  seccion: string | null;
  priceCents: number | null;
  consultar: boolean;
  activo: boolean;
  agotado: boolean;
  variantes: { variantId: string; label: string; priceCents: number }[];
};

export type PiezaFija = {
  tipo: "fija";
  slug: string;
  variantId?: string;
  /** Lo que se lee en la ficha: «24 bollos preñaos asturianos». */
  titulo: string;
  /** Segunda línea de la ficha, en pequeño. */
  descripcion: string;
  /** Solo la foto comestible del Pack Cumpleaños. */
  requiereFoto?: true;
  /**
   * Nombre con el que la pieza llega al pedido y a la hoja de producción, en
   * lugar de «<producto> · <variante>». Solo para la foto: `tarta-retrato` es
   * el suplemento de foto de las tartas y su variante de 15 € se llama
   * «Pequeña», que en un pack con plancha XL confundiría al obrador.
   */
  rotulo?: string;
};

export type HuecoEleccion = {
  tipo: "eleccion";
  /** Clave en `opciones` del carrito y del pedido. Estable: no se renombra. */
  id: string;
  titulo: string;
  descripcion: string;
  /** Etiqueta del desplegable: «Sabor de la empanada». */
  etiqueta: string;
  variantId?: string;
} & ({ seccion: string } | { slugs: readonly string[] });

export type Pieza = PiezaFija | HuecoEleccion;

export type DefinicionPack = {
  slug: string;
  /** Antetítulo de la ficha: «Cumpleaños en casa». */
  ocasion: string;
  personas: { min: number; max: number; texto: string };
  paraQuien: readonly string[];
  /** Consejo del obrador (conservación, horno). Opcional. */
  consejo?: string;
  piezas: readonly Pieza[];
};

const PRENAOS: PiezaFija = {
  tipo: "fija",
  slug: "los-prenaos-de-la-casa",
  variantId: "u24",
  titulo: "24 bollos preñaos asturianos",
  descripcion: "Bollitos tiernos con su chorizo dentro, para comer de un bocado",
};

export const packs: readonly DefinicionPack[] = [
  {
    slug: "pack-cumpleanos",
    ocasion: "Cumpleaños en casa",
    personas: { min: 18, max: 20, texto: "18–20 personas" },
    paraQuien: [
      "El cumpleaños familiar en casa: el pedido más repetido del obrador convertido en un clic.",
      "Quien organiza no quiere calcular cantidades: aquí van resueltas.",
    ],
    piezas: [
      {
        tipo: "eleccion",
        id: "empanada",
        titulo: "1 empanada entera, sabor a elegir (16–20 rac.)",
        descripcion: "Hojaldre dorado y crujiente, de relleno generoso",
        etiqueta: "Sabor de la empanada",
        seccion: "empanadas",
        variantId: "entera",
      },
      PRENAOS,
      {
        tipo: "eleccion",
        id: "plancha",
        titulo: "1 plancha grande a elegir (24–30 rac.)",
        descripcion: "Bizcocho esponjoso del obrador con la cobertura que elijas",
        etiqueta: "Sabor de la plancha",
        seccion: "planchas",
        variantId: "grande",
      },
      {
        tipo: "fija",
        slug: "tarta-retrato",
        variantId: "pequena",
        titulo: "Foto grande comestible personalizada",
        descripcion: "Impresa en oblea sobre la plancha, con bordeado decorado",
        requiereFoto: true,
        rotulo: "Foto comestible grande, sobre la plancha",
      },
    ],
  },
  {
    slug: "pack-merienda-infantil",
    ocasion: "Merienda infantil",
    personas: { min: 10, max: 12, texto: "10–12 niños" },
    paraQuien: [
      "Cumpleañeros de 4 a 12 años, meriendas de cole y tardes de parque: cantidad justa y cero cocina.",
      "La madre o padre que organiza entre semana y lo resuelve en dos minutos (si el cumpleaños es grande, pueden añadir producto suelto o pedir dos packs).",
    ],
    piezas: [
      {
        tipo: "fija",
        slug: "quiche-salchicha-y-queso",
        titulo: "1 quiche de salchicha y queso (8–10 rac.)",
        descripcion: "Cremosa y suave, la receta pensada para los pequeños",
      },
      {
        tipo: "fija",
        slug: "mini-croissants-york-y-queso",
        variantId: "u12",
        titulo: "12 mini croissants de york y queso",
        descripcion: "De mantequilla, con el queso fundente en su punto",
      },
      {
        tipo: "fija",
        slug: "plancha-oreo",
        variantId: "pequena",
        titulo: "½ plancha de Oreo (12–15 rac.)",
        descripcion: "La favorita infantil: crema de Oreo sobre bizcocho tierno",
      },
    ],
  },
  {
    slug: "pack-futbolero",
    ocasion: "Partido en casa",
    personas: { min: 10, max: 12, texto: "10–12 personas" },
    paraQuien: [
      "Quedadas para el fútbol, tardes de amigos y planes improvisados de fin de semana en casa.",
      "El anfitrión que quiere quedar bien sin cocinar ni perderse el partido.",
    ],
    piezas: [
      {
        tipo: "eleccion",
        id: "empanada",
        titulo: "½ empanada, sabor a elegir (8–10 rac.)",
        descripcion: "Nuestro hojaldre de siempre, en formato para el sofá",
        etiqueta: "Sabor de la empanada",
        seccion: "empanadas",
        variantId: "media",
      },
      {
        tipo: "fija",
        slug: "mini-croissants-surtido-salado",
        variantId: "u24",
        titulo: "24 mini croissants salados variados (4×6 sabores)",
        descripcion: "Rellenos surtidos para que nadie discuta más que del árbitro",
      },
      {
        tipo: "fija",
        slug: "surtido-de-pastelitos",
        variantId: "medio-kg",
        titulo: "½ kg de pasteles variados (≈ 20 ud)",
        descripcion: "Petisús, bocaditos y clásicos de vitrina para el descanso",
      },
    ],
  },
  {
    slug: "pack-brunch-en-casa",
    ocasion: "Mañana de fiesta",
    personas: { min: 10, max: 12, texto: "10–12 personas" },
    paraQuien: [
      "Brunch de fin de semana, visitas de media mañana y celebraciones tranquilas en casa.",
      "Quien busca un plan con nivel — la suprema — sin encargarlo pieza a pieza.",
    ],
    piezas: [
      {
        tipo: "fija",
        slug: "suprema-salmon-cebolla-caramelizada-y-queso-crema",
        titulo: "1 suprema de salmón · especialidad (8–10 rac.)",
        descripcion: "Hojaldre con salmón, cebolla caramelizada y queso crema",
      },
      {
        ...PRENAOS,
        descripcion: "El bocado salado que nunca sobra en una mesa de brunch",
      },
      {
        tipo: "fija",
        slug: "mini-croissants-surtido-dulce",
        titulo: "24 mini croissants dulces variados (4×6 sabores)",
        descripcion: "Caladas, glaseadas, cebra y pico de chocolate",
      },
    ],
  },
  {
    slug: "pack-gran-celebracion",
    ocasion: "Celebración grande",
    personas: { min: 20, max: 24, texto: "20–24 personas" },
    paraQuien: [
      "Comuniones en casa, aniversarios, comidas familiares grandes y celebraciones de empresa.",
      "El pedido que antes exigía una llamada larga: aquí va cerrado y completo.",
    ],
    consejo:
      "Quiches: un golpe de horno de 3–5 minutos antes de servir. Mini canapés: en frío hasta 15–20 minutos antes de servir.",
    piezas: [
      {
        tipo: "eleccion",
        id: "empanada",
        titulo: "1 empanada, sabor a elegir (16–20 rac.)",
        descripcion: "El hojaldre insignia de la casa, entero y a tu gusto",
        etiqueta: "Sabor de la empanada",
        seccion: "empanadas",
        variantId: "entera",
      },
      {
        tipo: "eleccion",
        id: "quiche1",
        titulo: "1 quiche, sabor a elegir (8–10 rac.)",
        descripcion: "Recién horneadas; un golpe de horno de 3–5 min y a la mesa",
        etiqueta: "Primera quiche",
        seccion: "quiches",
      },
      {
        tipo: "eleccion",
        id: "quiche2",
        titulo: "1 quiche, sabor a elegir (8–10 rac.)",
        descripcion: "Recién horneadas; un golpe de horno de 3–5 min y a la mesa",
        etiqueta: "Segunda quiche",
        seccion: "quiches",
      },
      {
        tipo: "fija",
        slug: "hojaldritos-de-coctel",
        variantId: "kg",
        titulo: "1 kg de hojaldritos variados (≈ 60 ud · 5 sabores)",
        descripcion: "Bocados salados crujientes para el picoteo largo",
      },
      {
        ...PRENAOS,
        descripcion: "Tiernos, con su chorizo dentro: vuelan siempre",
      },
      {
        tipo: "fija",
        slug: "bocados-de-coctel",
        titulo: "Bandeja de mini canapés (34 ud · ≈ 11 sabores)",
        descripcion: "Canapé fino y variado, listo para servir en frío",
      },
      {
        tipo: "fija",
        slug: "surtido-de-pastelitos",
        variantId: "kg",
        titulo: "1 kg de pasteles variados",
        descripcion: "La vitrina dulce del obrador servida en bandeja",
      },
      {
        tipo: "fija",
        slug: "mini-croissants-surtido-dulce",
        titulo: "24 mini croissants dulces variados",
        descripcion: "El cierre dulce para acompañar el café",
      },
    ],
  },
  {
    slug: "pack-evento-especial",
    ocasion: "Ocasión señalada",
    personas: { min: 8, max: 10, texto: "8–10 personas" },
    paraQuien: [
      "Aperitivos señalados, visitas que importan y celebraciones íntimas con detalle.",
      "Grupos pequeños que quieren nivel de evento sin el tamaño de uno: Navidad, una merienda con amigos o tu cumpleaños en la oficina con unos pocos.",
    ],
    consejo: "Tarta y mini canapés: en frío hasta 15–20 minutos antes de servir.",
    piezas: [
      {
        tipo: "fija",
        slug: "tarta-salada-salmon-y-gambas",
        titulo: "1 tarta de salmón y gambas (8–10 rac.)",
        descripcion: "La tarta salada premium: fría, fina y elegante",
      },
      {
        tipo: "fija",
        slug: "bocados-de-coctel",
        titulo: "Bandeja de mini canapés (34 ud · ≈ 11 sabores)",
        descripcion: "Once sabores en bocado pequeño, lista para servir",
      },
      {
        tipo: "fija",
        slug: "coleccion-de-petisus",
        variantId: "medio-kg",
        titulo: "½ kg de petisús variados (≈ 20 ud)",
        descripcion: "Rellenos de crema y nata: el clásico que vuela",
      },
    ],
  },
  {
    slug: "pack-reunion-oficina",
    ocasion: "Trabajo",
    personas: { min: 10, max: 12, texto: "10–12 personas" },
    paraQuien: [
      "Desayunos de trabajo, comités y formaciones: el clásico de oficina sin gestor de compras.",
      "Empresas de Alcobendas, Sanse y Tres Cantos con entrega antes de las 10:30.",
    ],
    piezas: [
      {
        tipo: "eleccion",
        id: "empanada",
        titulo: "½ empanada, sabor a elegir (8–10 rac.)",
        descripcion: "Hojaldre del obrador que aguanta la mañana entera",
        etiqueta: "Sabor de la empanada",
        seccion: "empanadas",
        variantId: "media",
      },
      {
        tipo: "fija",
        slug: "mini-croissants-surtido-salado",
        variantId: "u12",
        titulo: "12 mini croissants salados rellenos (2×6 sabores)",
        descripcion: "De mantequilla, rellenos variados para acompañar el café",
      },
      {
        tipo: "eleccion",
        id: "dulce",
        titulo: "Bayonesa o bizcocho a elegir (10–12 rac.)",
        descripcion: "Hojaldre con cabello de ángel, o bizcocho casero",
        etiqueta: "Bayonesa o bizcocho",
        // Lista cerrada y no la sección: `bizcochos` puede crecer con cosas que
        // no son bizcocho.
        slugs: [
          "la-bayonesa",
          "bizcocho-casero-de-chocolate",
          "bizcocho-casero-de-limon",
          "bizcocho-casero-de-zanahoria",
        ],
      },
    ],
  },
];

export const packPorSlug = (slug: string): DefinicionPack | undefined =>
  packs.find((d) => d.slug === slug);

const huecosDe = (def: DefinicionPack): HuecoEleccion[] =>
  def.piezas.filter((x): x is HuecoEleccion => x.tipo === "eleccion");

/** Todos los slugs que una definición puede necesitar leer de la carta, salvo los de sección. */
export function slugsFijos(def: DefinicionPack): string[] {
  const res = new Set<string>();
  for (const x of def.piezas) {
    if (x.tipo === "fija") res.add(x.slug);
    else if ("slugs" in x) x.slugs.forEach((s) => res.add(s));
  }
  return [...res];
}

export function seccionesDeHuecos(def: DefinicionPack): string[] {
  const res = new Set<string>();
  for (const h of huecosDe(def)) if ("seccion" in h) res.add(h.seccion);
  return [...res];
}

const vendible = (x: ProductoPieza | undefined): x is ProductoPieza =>
  !!x && x.activo && !x.agotado && !x.consultar && x.priceCents !== null;

/** Precio y etiqueta de un producto en la variante pedida; null si no la tiene. */
function enVariante(x: ProductoPieza, variantId?: string) {
  if (!variantId) {
    // Un producto con tamaños pedido sin tamaño es ambiguo: no vale.
    if (x.variantes.length > 0) return null;
    return { priceCents: x.priceCents!, label: null as string | null };
  }
  const v = x.variantes.find((v) => v.variantId === variantId);
  return v ? { priceCents: v.priceCents, label: v.label } : null;
}

function admitido(h: HuecoEleccion, x: ProductoPieza): boolean {
  return "slugs" in h ? h.slugs.includes(x.slug) : x.seccion === h.seccion;
}

export type Opcion = { slug: string; name: string; priceCents: number };

/** Productos elegibles para un hueco: activos, no agotados, con precio y con la variante pedida. */
export function opcionesDeHueco(h: HuecoEleccion, productos: readonly ProductoPieza[]): Opcion[] {
  const res: Opcion[] = [];
  for (const x of productos) {
    if (!admitido(h, x) || !vendible(x)) continue;
    const v = enVariante(x, h.variantId);
    if (v) res.push({ slug: x.slug, name: x.name, priceCents: v.priceCents });
  }
  return res;
}

export type PiezaResuelta = {
  slug: string;
  nombre: string;
  varianteLabel: string | null;
  /** Unidades de esa pieza por cada pack. Hoy siempre 1. */
  qty: number;
};

/**
 * Los mensajes son para el cliente y no nombran el pack: la definición no lo
 * conoce (su nombre vive en la ficha), `priceOrder` los envuelve con él.
 */
export class PackError extends Error {}

/**
 * Comprueba las elecciones contra la definición y devuelve el desglose.
 * Lanza PackError con mensaje presentable si falta un hueco, sobra uno, la
 * elección no es válida o una pieza fija no se puede vender hoy.
 */
export function resolverPack(
  def: DefinicionPack,
  productos: ReadonlyMap<string, ProductoPieza>,
  opciones: Readonly<Record<string, string>>,
): PiezaResuelta[] {
  const res: PiezaResuelta[] = [];
  for (const pieza of def.piezas) {
    if (pieza.tipo === "fija") {
      const x = productos.get(pieza.slug);
      const v = vendible(x) ? enVariante(x, pieza.variantId) : null;
      if (!x || !v) {
        throw new PackError(`no está disponible ahora mismo: falta «${x?.name ?? pieza.slug}».`);
      }
      res.push(
        pieza.rotulo
          ? { slug: x.slug, nombre: pieza.rotulo, varianteLabel: null, qty: 1 }
          : { slug: x.slug, nombre: x.name, varianteLabel: v.label, qty: 1 },
      );
      continue;
    }
    const elegido = opciones[pieza.id];
    if (!elegido) throw new PackError(`Elige ${pieza.etiqueta.toLowerCase()}.`);
    const x = productos.get(elegido);
    if (!x || !admitido(pieza, x)) throw new PackError("Elección no válida.");
    // Se lee el nombre antes: tras `vendible` (guarda de tipo) TypeScript da `x` por `never` en la rama de fallo.
    const nombre = x.name;
    if (!vendible(x)) throw new PackError(`«${nombre}» se ha agotado: elige otro.`);
    const v = enVariante(x, pieza.variantId);
    if (!v) throw new PackError("Elección no válida.");
    res.push({ slug: x.slug, nombre: x.name, varianteLabel: v.label, qty: 1 });
  }
  // Una clave que el pack no tiene es un cliente manipulado, no un descuido.
  const ids = new Set(huecosDe(def).map((h) => h.id));
  if (!Object.keys(opciones).every((k) => ids.has(k))) throw new PackError("Elección no válida.");
  return res;
}

/** Suma de las piezas al precio de carta; en un hueco, la opción más barata. null si falta alguna. */
export function precioSueltoCents(def: DefinicionPack, productos: readonly ProductoPieza[]): number | null {
  let total = 0;
  for (const pieza of def.piezas) {
    if (pieza.tipo === "fija") {
      const x = productos.find((p) => p.slug === pieza.slug);
      const v = x ? enVariante(x, pieza.variantId) : null;
      if (!v) return null;
      total += v.priceCents;
    } else {
      const precios = opcionesDeHueco(pieza, productos).map((o) => o.priceCents);
      if (precios.length === 0) return null;
      total += Math.min(...precios);
    }
  }
  return total;
}

/** % entero de ahorro, o null si no ahorra (≤ 0) o no se puede calcular. */
export function ahorroPct(precioPackCents: number, sueltoCents: number | null): number | null {
  if (sueltoCents === null || precioPackCents >= sueltoCents) return null;
  const pct = Math.round((1 - precioPackCents / sueltoCents) * 100);
  // Un ahorro que redondea a 0 % no se enseña: «−0 %» desanima más que no decir nada.
  return pct > 0 ? pct : null;
}

/** Precio por persona redondeado a 10 céntimos, en céntimos. */
export function precioPorPersonaCents(precioPackCents: number, def: DefinicionPack): number {
  return Math.round(precioPackCents / def.personas.max / 10) * 10;
}

/** Etiqueta legible de una pieza resuelta: «Empanada de carne · Entera 16–20 rac.» */
export function etiquetaPieza(p: PiezaResuelta): string {
  return p.varianteLabel ? `${p.nombre} · ${p.varianteLabel}` : p.nombre;
}
