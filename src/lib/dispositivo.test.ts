import { describe, expect, it } from "vitest";
import { dispositivoDe } from "~/lib/dispositivo";

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidMovil: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  ipadAntiguo: "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};

describe("dispositivoDe", () => {
  it("móviles", () => {
    expect(dispositivoDe(UA.iphone)).toBe("movil");
    expect(dispositivoDe(UA.androidMovil)).toBe("movil");
  });

  it("tablets, también la Android sin «Mobile» y el iPad antiguo", () => {
    expect(dispositivoDe(UA.androidTablet)).toBe("tablet");
    expect(dispositivoDe(UA.ipadAntiguo)).toBe("tablet");
  });

  it("ordenadores; un iPad moderno (se presenta como Mac) solo con la pista del navegador", () => {
    expect(dispositivoDe(UA.windows)).toBe("ordenador");
    expect(dispositivoDe(UA.mac)).toBe("ordenador");
    expect(dispositivoDe(UA.mac, "tablet")).toBe("tablet");
    // La pista no convierte un móvil en otra cosa.
    expect(dispositivoDe(UA.iphone, "tablet")).toBe("movil");
  });

  it("sin User-Agent, ordenador", () => {
    expect(dispositivoDe(null)).toBe("ordenador");
  });
});
