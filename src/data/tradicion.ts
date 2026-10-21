export const tradicion = {
  /** Cabecera de la página (imagen «tradicion y calidad» del cliente, 17-10-2026). */
  cabecera: {
    antetitulo: "Tradición y calidad · Desde 1986",
    titulo: ["Más de 40 años.", "Y todos te los debemos a ti."],
    texto:
      "Esta página debería hablar de nosotros. Pero si algo hemos aprendido en cuatro décadas de obrador es que la historia de Horno San Lorenzo no la hemos escrito solos. La han escrito nuestros clientes.",
  },

  /** Las tres tarjetas de agradecimiento, una por canal. */
  gracias: [
    {
      canal: "Particulares",
      title: "Gracias a quien vuelve",
      body: "A quien compra el pan de cada día y la tarta de cada domingo. A quien era niño cuando entraba de la mano y ahora entra con los suyos. A quien pide «lo de siempre» y no necesita explicar más.",
      cita: "La receta no ha cambiado porque no nos atrevemos a tocar lo que es vuestro.",
    },
    {
      canal: "Hostelería y eventos",
      title: "Gracias a quien confía",
      body: "A los bares, restaurantes, cafeterías y salones que ponen nuestro nombre en su carta sin que nadie lo vea. Cada mañana sale la furgoneta con vuestro pedido y vuelve con la confianza de que mañana volveréis a contar con nosotros.",
      cita: "Hace años que ya no sois clientes. Sois compañeros de oficio.",
    },
    {
      canal: "Empresas",
      title: "Gracias a quien nos recomienda",
      body: "A las empresas que nos llevan a sus desayunos y a sus celebraciones. A quien nos ha traído a su oficina, a su boda, a su familia. Todo lo que somos hoy ha crecido de boca en boca.",
      cita: "Eso solo pasa cuando alguien se juega su palabra por ti. No lo olvidamos.",
    },
  ],

  /** Entradilla de los cinco valores. */
  valoresIntro:
    "Tú has puesto la confianza. Esto es lo que ponemos nosotros, hoy igual que en 1986.",

  /**
   * Manifiesto de la marca, tal cual en las Brand Guidelines (versión
   * Avellana, diapositiva 8, «05 · Manifiesto»), revisado con la imagen
   * «texto tradicion HSL» del cliente (9-10-2026). Solo se han corregido
   * espacios sueltos del original. `**…**` marca la negrita.
   */
  manifiesto: {
    titulo: "Más de 40 años haciendo pastelería artesanal de calidad.",
    entradilla:
      "Personas que vuelven. Familias que nos recomiendan. Empresas que confían. Producto fresco, artesanal y generoso, con una calidad y un precio difíciles de igualar.",
    parrafos: [
      "San Lorenzo es el nombre de la playa de Gijón, el lugar de origen de nuestra familia y el origen de nuestro nombre. Una historia que comenzó en Asturias y que, desde 1986, seguimos construyendo en Madrid alrededor de algo muy sencillo: **hacer las cosas bien, con producto fresco, artesanal y generoso.**",
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
    {
      figure: "+40",
      label: "años de trayectoria",
      body: "Fundado en 1986: mismo oficio, mismas recetas de base.",
    },
    {
      figure: "3",
      label: "canales de negocio",
      body: "Empresas y oficinas, hostelería y particulares.",
    },
    {
      figure: "2",
      label: "obradores en Madrid",
      // «Abiertos de lunes a domingo», a petición del cliente (21-10-2026).
      body: "Alcobendas (sede, con horno propio) y Pozuelo de Alarcón, abiertos de lunes a domingo.",
    },
    {
      figure: "De lunes a sábado",
      label: "reparto propio",
      body: "Entrega diaria con furgoneta y repartidor de la casa.",
    },
  ],

  /**
   * Los cinco valores del sistema de marca. Cada uno se cumple en algo
   * concreto. Textos de la imagen «valores HSL» del cliente (9-10-2026);
   * fotos de la carpeta «fotos para poner en carrusel de los 5 valores».
   */
  valores: [
    {
      number: "01",
      title: "Oficio",
      foto: "/images/valores/oficio.jpg",
      body: "Lo artesanal empieza en nuestro propio obrador, desde 1986. Cada día, recién salido del horno, para hogares y empresas.",
    },
    {
      number: "02",
      title: "Constancia",
      foto: "/images/valores/constancia.jpg",
      /** Encuadre: la brocha y la taza quedan a la izquierda del centro. */
      encuadre: "25% center",
      body: "Más de 40 años después la receta es la misma. Los ingredientes no se cambian por coste.",
    },
    {
      number: "03",
      title: "Honestidad",
      foto: "/images/valores/honestidad.jpg",
      body: "Artesanal, con una relación calidad-precio difícil de igualar. Decimos lo que lleva, lo que cuesta y cuándo estará.",
    },
    {
      number: "04",
      title: "Cercanía",
      foto: "/images/valores/cercania.jpg",
      body: "Conocemos a nuestros clientes por su nombre, no por su número de pedido. Reparto propio de lunes a sábado.",
    },
    {
      number: "05",
      title: "Generosidad",
      foto: "/images/valores/generosidad.jpg",
      body: "La receta de siempre con raciones generosas. Porque creemos que comer bien no debería ser un lujo.",
    },
  ],

  /** Las tres pruebas que sostienen la propuesta. */
  pruebas: [
    "40 años creciendo solo por recomendación, sin pagar publicidad.",
    "Reparto propio de lunes a sábado, con furgoneta y repartidor de la casa.",
    "Obradores abiertos de lunes a domingo.",
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
