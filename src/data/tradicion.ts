export const tradicion = {
  /**
   * Manifiesto de la marca, tal cual en las Brand Guidelines (versión
   * Avellana, diapositiva 8, «05 · Manifiesto»). Solo se han corregido
   * espacios sueltos del original.
   */
  manifiesto: {
    titulo: "Más de 40 años haciéndolo bien.",
    entradilla:
      "Personas que vuelven. Familias que nos recomiendan. Empresas que confían. Producto fresco, artesanal y generoso, con una calidad y un precio difíciles de igualar.",
    parrafos: [
      "San Lorenzo es el nombre de la playa de Gijón, el lugar de origen de nuestra familia y el origen de nuestro nombre. Una historia que comenzó en Asturias y que, desde 1986, seguimos construyendo en Madrid alrededor de algo muy sencillo: hacer las cosas bien, con producto fresco, artesanal y generoso.",
      "Durante más de cuatro décadas hemos crecido gracias a la confianza de nuestros clientes. Creemos que comer bien no debería ser complicado, ni caro, ni una excepción. Debería ser lo normal, como en Asturias: en casa, en la oficina y en cualquier mesa donde compartir sea parte del día.",
      "Queremos llegar a más personas, sin perder nuestra esencia. Modernizarnos sin perder nuestras raíces. Crecer sin perder la cercanía y la confianza que nos han traído hasta aquí.",
    ],
    cierre:
      "Porque después de más de 40 años, seguimos creyendo que la mejor forma de crecer es seguir haciéndolo bien.",
    firma: "Horno San Lorenzo, desde 1986",
  },

  /** Brand promise. */
  promesa: "Lo que sale hoy del obrador sabe igual que hace cuarenta años.",
  promesaBody:
    "Misma receta, mismo método y mismo precio justo, cada día, para la mesa de casa y la mesa de la empresa.",

  cifras: [
    { figure: "40", label: "años de trayectoria", body: "Fundado en 1986: mismo oficio, mismas recetas de base." },
    { figure: "2", label: "obradores en Madrid", body: "Alcobendas (sede) y Pozuelo de Alarcón, con horno propio." },
    { figure: "3", label: "canales de negocio", body: "Empresas y oficinas, hostelería y particulares." },
    { figure: "L–S", label: "reparto propio", body: "Entrega diaria con furgoneta y repartidor de la casa." },
  ],

  /** Los cinco valores del sistema de marca. Cada uno se cumple en algo concreto. */
  valores: [
    {
      number: "01",
      title: "Oficio",
      body: "El producto se hace en obrador propio. Nada se externaliza y nada se descongela para vender como recién hecho.",
    },
    {
      number: "02",
      title: "Constancia",
      body: "La tarta de hoy sabe igual que la de hace veinte años. La receta no cambia por moda ni por coste.",
    },
    {
      number: "03",
      title: "Honestidad",
      body: "Se dice lo que lleva, lo que cuesta y cuándo estará. Sin letra pequeña y sin promesas de salud.",
    },
    {
      number: "04",
      title: "Cercanía",
      body: "Reparto propio de lunes a sábado. Al cliente se le conoce por su nombre, no por su número de pedido.",
    },
    {
      number: "05",
      title: "Generosidad",
      body: "Raciones honestas y precio justo. La accesibilidad forma parte de la calidad, no la contradice.",
    },
  ],

  /** Las tres pruebas que sostienen la propuesta. */
  pruebas: [
    "40 años creciendo solo por recomendación, sin pagar publicidad.",
    "Reparto propio de lunes a sábado, con furgoneta y repartidor de la casa.",
    "El mismo producto para la mesa de casa y la de la empresa.",
  ],

  especialidad: {
    title: "La especialidad de la casa",
    body: "Tartas y empanadas: lo que se pone en el centro de la mesa, se corta y se comparte.",
  },

  certifications: [
    "Elaboración íntegra en obrador propio, sin externalizar",
    "Inscritos en el registro sanitario de Madrid desde 1986",
  ],
} as const;
