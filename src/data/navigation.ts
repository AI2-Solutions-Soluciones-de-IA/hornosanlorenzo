import type { CategoryId } from "~/data/categories";

/**
 * Estructura de navegación del brief de front end:
 * Inicio y cinco secciones, con submenú en «Tienda Online» y en «A quién servimos».
 */
export type NavChild = {
  href: string;
  label: string;
  short: string;
  /** Categorías del catálogo que agrupa esta entrada. */
  categories?: readonly CategoryId[];
};

export type NavItem = {
  href: string;
  label: string;
  children?: readonly NavChild[];
  /** El enlace descarga un fichero en vez de navegar a una página. */
  download?: boolean;
};

export const mainNav: readonly NavItem[] = [
  // Orden del 16-10-2026: las cuatro primeras a la izquierda del sello y las
  // otras tres a su derecha. «Nuestras tiendas» vuelve al menú el 19-10-2026.
  { href: "/", label: "Inicio" },
  { href: "/tradicion-y-calidad", label: "Tradición y Calidad" },
  { href: "/tiendas", label: "Nuestras tiendas" },
  {
    href: "/carta",
    label: "Carta",
  },
  {
    href: "/catalogo",
    label: "Tienda Online",
    children: [
      {
        href: "/catalogo/top-ventas",
        label: "Top Ventas",
        short: "Lo que más sale del obrador.",
      },
      {
        href: "/catalogo/packs",
        label: "Packs",
        short: "Nuestras cajitas para cada ocasión, listas para llevar.",
      },
      {
        href: "/catalogo/dulce",
        label: "Dulce",
        short: "Repostería de obrador con la receta tradicional desde 1986.",
        categories: ["bolleria", "tartas", "temporada"],
      },
      {
        href: "/catalogo/salado",
        label: "Salado",
        short: "El secreto de comer bien lleva 40 años en nuestra casa.",
        categories: ["salado"],
      },
      {
        href: "/catalogo/sin-alergenos",
        label: "Sin alérgenos",
        short: "Dulce y salado sin alérgenos, para que nadie se quede sin probarlo.",
        categories: ["sin-alergenos"],
      },
    ],
  },
  { href: "/noticias", label: "Promociones del mes" },
  {
    href: "/a-quien-servimos",
    label: "A quién servimos",
    children: [
      {
        href: "/a-quien-servimos#particulares",
        label: "Particulares",
        short: "La compra del día y el encargo de la semana, como en el mostrador.",
      },
      {
        href: "/a-quien-servimos#hosteleria",
        label: "Hostelería y eventos",
        short: "Suministro diario en formato mayorista para bares y restaurantes.",
      },
      {
        href: "/a-quien-servimos#empresas",
        label: "Empresas",
        short: "Desayunos de equipo, coffee breaks y regalo corporativo.",
      },
    ],
  },
] as const;

/** Las entradas del submenú de Tienda Online, reutilizadas en /catalogo. */
export const tiendaOnlineNav: readonly NavChild[] =
  mainNav.find((i) => i.href === "/catalogo")?.children ?? [];

export const footerNav: readonly { href: string; label: string }[] = [
  { href: "/catalogo", label: "Nuestros productos" },
  { href: "/catalogo/packs", label: "Packs y promos" },
  { href: "/a-quien-servimos", label: "A quién servimos" },
  { href: "/servicios", label: "Servicios" },
  { href: "/tradicion-y-calidad", label: "Tradición y calidad" },
  { href: "/tiendas", label: "Nuestras tiendas" },
  { href: "/noticias", label: "Promociones del mes" },
  { href: "/contacto", label: "Contacto" },
] as const;

/** Formas de pago sin marca gráfica disponible: se muestran como etiqueta. */
export const paymentLabels: readonly { id: string; label: string }[] = [
  // Bizum no lo tienen: transferencia, cheques gourmet y tarjetas de empresa (21-10-2026).
  { id: "transferencia", label: "Transferencia" },
  { id: "cheques-gourmet", label: "Cheques gourmet" },
  { id: "tarjetas-empresa", label: "Tarjetas de empresa" },
  { id: "efectivo", label: "Efectivo en tienda" },
] as const;
