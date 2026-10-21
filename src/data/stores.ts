export type StoreId = "alcobendas" | "pozuelo";

export type Store = {
  id: StoreId;
  name: string;
  shortName: string;
  address: string;
  city: string;
  postal: string;
  phone: string;
  phoneDisplay: string;
  /** Móviles de la tienda, además del fijo. */
  mobiles: readonly { number: string; display: string }[];
  email: string;
  hoursText: string;
  /** El horario por filas, para la tabla de /tiendas (19-10-2026). */
  horario: readonly { dias: string; horas: readonly string[] }[];
  /** Debajo de la tabla del horario, si hace falta. */
  horarioNota?: string;
  /** Etiqueta sobre la foto en /tiendas. */
  etiqueta: string;
  /** Hora tope para pasar a recoger un pedido. */
  pickupUntil: string;
  /**
   * Hora tope los sábados, domingos y festivos, si ese día cierra antes.
   * Entonces solo hay franja de mañana.
   */
  pickupUntilReducido?: string;
  /**
   * Hora de cierre los domingos y festivos, si la tienda cierra antes pero
   * NO tiene horario reducido el sábado (Pozuelo abre el sábado por la
   * tarde). Esos días solo se recoge de mañana.
   */
  cierreFestivo?: string;
  openDays: number[]; // 0=Sun ... 6=Sat
  /** Días en que se puede elegir recoger aquí. 0=domingo ... 6=sábado. */
  diasRecogida: readonly number[];
  /** El reparto a domicilio sale de aquí (solo Alcobendas, 14-10-2026). */
  reparto: boolean;
  mapsEmbed: string;
  mapsLink: string;
  coords: { lat: number; lng: number };
  image: string;
  imageAlt: string;
  /** `object-position` de la foto, si el centro no es el buen encuadre. */
  imageEncuadre?: string;
};

export const stores: readonly Store[] = [
  {
    id: "alcobendas",
    name: "Horno San Lorenzo — Central",
    shortName: "Alcobendas",
    address: "C/ Valgrande 21, Nave 2-k",
    city: "Alcobendas",
    postal: "28108",
    phone: "+34916613932",
    phoneDisplay: "916 613 932",
    mobiles: [
      { number: "+34667700059", display: "667 700 059" },
      { number: "+34653985065", display: "653 985 065" },
    ],
    email: "info@hornosanlorenzo.com",
    hoursText:
      "Recogida de lunes a viernes de 09:30 a 19:30 ininterrumpida · Sábados, domingos y festivos de 09:30 a 14:30",
    horario: [
      { dias: "Lunes a viernes", horas: ["9:30 – 19:30"] },
      { dias: "Sábados, domingos y festivos", horas: ["9:30 – 14:30"] },
    ],
    horarioNota: "Horario ininterrumpido.",
    etiqueta: "Obrador central · Horno propio",
    pickupUntil: "19:30",
    pickupUntilReducido: "14:30",
    openDays: [0, 1, 2, 3, 4, 5, 6],
    diasRecogida: [0, 1, 2, 3, 4, 5, 6],
    reparto: true,
    mapsEmbed:
      "https://www.google.com/maps?q=C%2FValgrande+21+Alcobendas&output=embed",
    mapsLink: "https://www.google.com/maps?q=C%2FValgrande+21+Alcobendas",
    coords: { lat: 40.5468, lng: -3.6394 },
    // Fotos del artifact «HSL · Nuestras tiendas» (21-10-2026).
    image: "/images/obrador-tartas.jpg",
    imageAlt: "Obrador central de Horno San Lorenzo en Alcobendas: tartas de fresa y maracuyá recién terminadas",
    imageEncuadre: "center 35%",
  },
  {
    id: "pozuelo",
    name: "Tienda Pozuelo",
    shortName: "Pozuelo",
    address: "Avda. Europa 28, entrada por C/ América",
    city: "Pozuelo de Alarcón",
    postal: "28223",
    phone: "+34916059056",
    phoneDisplay: "91 605 90 56",
    mobiles: [{ number: "+34659878272", display: "659 878 272" }],
    email: "pasteleriapozuelo@hornosanlorenzo.com",
    hoursText:
      "Lunes a viernes de 09:30 a 20:30 ininterrumpido · Sábados de 10:00 a 15:00 y de 17:00 a 20:30 · Domingos y festivos de 10:00 a 15:00",
    horario: [
      { dias: "Lunes a viernes", horas: ["9:30 – 20:30"] },
      { dias: "Sábados", horas: ["10:00 – 15:00", "17:00 – 20:30"] },
      { dias: "Domingos y festivos", horas: ["10:00 – 15:00"] },
    ],
    etiqueta: "Pastelería · Abierto tardes",
    pickupUntil: "20:30",
    cierreFestivo: "15:00",
    openDays: [0, 1, 2, 3, 4, 5, 6],
    // Recogida también el domingo, de mañana (14-10-2026).
    diasRecogida: [0, 1, 2, 3, 4, 5, 6],
    reparto: false,
    mapsEmbed:
      "https://www.google.com/maps?q=Avenida+Europa+28+Pozuelo+de+Alarcon&output=embed",
    mapsLink:
      "https://www.google.com/maps?q=Avenida+Europa+28+Pozuelo+de+Alarcon",
    coords: { lat: 40.4378, lng: -3.809 },
    image: "/images/tiendas/pozuelo-fachada.jpg",
    imageAlt: "Fachada de la pastelería Horno San Lorenzo en Pozuelo de Alarcón",
  },
] as const;

export const storeById = (id: StoreId): Store =>
  stores.find((s) => s.id === id)!;
