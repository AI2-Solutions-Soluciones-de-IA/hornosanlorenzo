export const site = {
  name: "Horno San Lorenzo",
  short: "HSL",
  /** Arquitectura de mensajes, nivel I — portadas, cierres y firma. */
  tagline: "Más de 40 años haciéndolo bien.",
  /** Nivel II — el concepto hecho frase: abre campañas, manifiesto y web. */
  claim: "El futuro es volver a comer de verdad, con producto fresco recién salido del horno cada día.",
  /** Nivel III — sitúa el negocio en una línea. */
  descriptor: "Producto fresco y artesanal, recién salido del horno, para hogares y empresas.",
  /** Nivel IV — el argumento comercial central. */
  usp: "La confianza de siempre: producto artesanal fresco que sale del horno cada día, con una calidad precio difícil de igualar.",
  /** Marca gráfica. */
  legend: "Obrador artesano · Madrid",
  founded: 1986,
  url: import.meta.env.PUBLIC_SITE_URL,
  social: {
    instagram: "https://instagram.com/hornosanlorenzo_1986",
    facebook: "https://facebook.com/hornosanlorenzo",
  },
  email: "info@hornosanlorenzo.com",
  ogImage: "/og-image.jpg",
  noteForDemo:
    "Demo en presentación — fotos representativas. Los productos, tiendas y datos de contacto son reales.",
} as const;

export type Site = typeof site;
