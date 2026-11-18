import { describe, expect, it } from "vitest";
import {
  comandosDeVisita,
  diaDesdeHash,
  diaEnMadrid,
  diasEntre,
  esRobot,
  origenDe,
  rutaNormalizada,
  sumaRecuentos,
} from "~/lib/visitas";

const HOST = "www.hornosanlorenzo.com";

describe("rutaNormalizada", () => {
  it("quita consulta, ancla y barra final, en minúsculas", () => {
    expect(rutaNormalizada("/catalogo/tarta-sacher/?x=1#a")).toBe(
      "/catalogo/tarta-sacher",
    );
    expect(rutaNormalizada("/")).toBe("/");
    expect(rutaNormalizada("/Carrito")).toBe("/carrito");
  });
  it("no cuenta panel, TPV, API, cuenta, acceso ni ficheros", () => {
    for (const r of [
      "/admin",
      "/admin/pedidos",
      "/tpv",
      "/api/v",
      "/cuenta",
      "/acceso/x",
      "/baja",
      "/_vercel/x",
    ])
      expect(rutaNormalizada(r)).toBeNull();
    expect(rutaNormalizada("/administracion")).toBe("/administracion");
  });
  it("lo raro va a «otra» para no llenar el día de rutas inventadas", () => {
    expect(rutaNormalizada("/wp-login.php")).toBe("otra");
    expect(rutaNormalizada(`/${"a".repeat(120)}`)).toBe("otra");
  });
  it("lo que no es una ruta, nada", () => {
    expect(rutaNormalizada("https://x.com/")).toBeNull();
    expect(rutaNormalizada(42)).toBeNull();
  });
});

describe("origenDe", () => {
  it("por la web de la que viene", () => {
    expect(origenDe("https://www.google.es/", "", HOST)).toBe("google");
    expect(origenDe("https://www.bing.com/search", "", HOST)).toBe(
      "otros buscadores",
    );
    expect(origenDe("https://l.instagram.com/?u=x", "", HOST)).toBe(
      "instagram",
    );
    expect(origenDe("https://m.facebook.com/", "", HOST)).toBe("facebook");
    expect(origenDe("https://www.tiktok.com/", "", HOST)).toBe("tiktok");
    expect(origenDe("https://blog.ejemplo.es/post", "", HOST)).toBe(
      "otras webs",
    );
    expect(origenDe("https://mail.google.com/", "", HOST)).toBe("correo");
    expect(origenDe("https://outlook.live.com/mail/", "", HOST)).toBe("correo");
    expect(origenDe("https://www.google.com.mx/", "", HOST)).toBe("google");
  });
  it("sin referencia, directo", () => {
    expect(origenDe("", "", HOST)).toBe("directo");
    expect(origenDe(undefined, undefined, HOST)).toBe("directo");
  });
  it("desde la propia web (con o sin www) no es visita nueva", () => {
    expect(
      origenDe("https://www.hornosanlorenzo.com/catalogo", "", HOST),
    ).toBeNull();
    expect(origenDe("https://hornosanlorenzo.com/", "", HOST)).toBeNull();
  });
  it("utm_source manda sobre la referencia", () => {
    expect(origenDe("", "instagram", HOST)).toBe("instagram");
    expect(origenDe("https://www.google.es/", "IG", HOST)).toBe("instagram");
    expect(origenDe("", "newsletter", HOST)).toBe("correo");
    expect(origenDe("https://www.google.es/", "algo-raro", HOST)).toBe(
      "google",
    );
  });
  it("un dominio que solo se parece no cuela", () => {
    expect(origenDe("https://google.es.timo.com/", "", HOST)).toBe(
      "otras webs",
    );
    expect(origenDe("https://nohornosanlorenzo.com/", "", HOST)).toBe(
      "otras webs",
    );
  });
});

describe("esRobot", () => {
  it("robots y previsualizaciones fuera; un navegador, dentro", () => {
    expect(esRobot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(esRobot("facebookexternalhit/1.1")).toBe(true);
    expect(esRobot("WhatsApp/2.23")).toBe(true);
    expect(esRobot("")).toBe(true);
    expect(
      esRobot(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
  });
});

describe("comandosDeVisita", () => {
  const base = {
    dia: "2026-11-18",
    ruta: "/carrito",
    visitante: "abc",
    ahoraMs: 1_000_000,
  };
  it("una página más: 3 operaciones", () => {
    expect(comandosDeVisita({ ...base, nueva: null })).toEqual([
      ["HINCRBY", "hsl:v:2026-11-18", "t", 1],
      ["HINCRBY", "hsl:v:2026-11-18", "p:/carrito", 1],
      ["ZADD", "hsl:ahora", 1_000_000, "abc"],
    ]);
  });
  it("la primera de una visita cuenta visita, origen, aparato y persona (10 en total)", () => {
    const c = comandosDeVisita({
      ...base,
      nueva: { origen: "google", dispositivo: "movil" },
    });
    expect(c).toHaveLength(10);
    expect(c).toContainEqual(["HINCRBY", "hsl:v:2026-11-18", "v", 1]);
    expect(c).toContainEqual(["HINCRBY", "hsl:v:2026-11-18", "o:google", 1]);
    expect(c).toContainEqual(["HINCRBY", "hsl:v:2026-11-18", "d:movil", 1]);
    expect(c).toContainEqual(["PFADD", "hsl:u:2026-11-18", "abc"]);
    expect(c.filter((x) => x[0] === "EXPIRE")).toHaveLength(2);
  });
});

describe("lectura", () => {
  it("un día desde su hash, como lista o como objeto", () => {
    const lista = [
      "t",
      "12",
      "v",
      "4",
      "p:/",
      "7",
      "p:/carrito",
      "5",
      "o:google",
      "3",
      "o:directo",
      "1",
      "d:movil",
      "4",
    ];
    const d = diaDesdeHash("2026-11-18", lista);
    expect(d).toEqual({
      dia: "2026-11-18",
      paginas: 12,
      visitas: 4,
      porPagina: { "/": 7, "/carrito": 5 },
      porOrigen: { google: 3, directo: 1 },
      porDispositivo: { movil: 4 },
    });
    expect(diaDesdeHash("2026-11-18", { t: "12", v: "4" }).visitas).toBe(4);
    expect(diaDesdeHash("2026-11-18", null).paginas).toBe(0);
  });
  it("suma varios días, de más a menos", () => {
    const a = diaDesdeHash("a", ["p:/", "2", "p:/carta", "5"]);
    const b = diaDesdeHash("b", ["p:/", "4"]);
    expect(sumaRecuentos([a, b], "porPagina")).toEqual([
      ["/", 6],
      ["/carta", 5],
    ]);
  });
  it("días del rango y el día en Madrid", () => {
    expect(diasEntre("2026-10-30", "2026-11-02")).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    // 23:30 UTC del 18 ya es el 19 en Madrid.
    expect(diaEnMadrid(new Date("2026-11-18T23:30:00Z"))).toBe("2026-11-19");
  });
});
