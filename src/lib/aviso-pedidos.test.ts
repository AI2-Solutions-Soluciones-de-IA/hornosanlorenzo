import { beforeEach, describe, expect, it, vi } from "vitest";

// Un Redis de mentira en memoria: GET, HGET, HSET, INCR, SET, DEL, EXPIRE.
const datos = new Map<string, unknown>();
let caido = false;
vi.mock("~/lib/redis", () => ({
  pipeline: async (comandos: (string | number)[][]) => {
    if (caido) return null;
    return comandos.map(([cmd, clave, ...resto]) => {
      const k = String(clave);
      switch (cmd) {
        case "GET":
          return (datos.get(k) as string | undefined) ?? null;
        case "SET":
          datos.set(k, String(resto[0]));
          return "OK";
        case "DEL":
          return datos.delete(k) ? 1 : 0;
        case "INCR": {
          const n = Number(datos.get(k) ?? 0) + 1;
          datos.set(k, String(n));
          return n;
        }
        case "HGET":
          return (
            (datos.get(k) as Map<string, string> | undefined)?.get(
              String(resto[0]),
            ) ?? null
          );
        case "HSET": {
          const h =
            (datos.get(k) as Map<string, string> | undefined) ?? new Map();
          h.set(String(resto[0]), String(resto[1]));
          datos.set(k, h);
          return 1;
        }
        default:
          return 1;
      }
    });
  },
}));

const {
  avisaCambioPedidos,
  claveDeSesion,
  cookieDeSesion,
  guardaSesion,
  olvidaSesion,
  sesionGuardada,
  totalConCache,
} = await import("~/lib/aviso-pedidos");

beforeEach(() => {
  datos.clear();
  caido = false;
});

describe("totalConCache", () => {
  it("cuenta en Postgres una vez y luego sirve el guardado hasta que entra un pedido", async () => {
    const cuenta = vi.fn().mockResolvedValueOnce(5).mockResolvedValueOnce(6);
    expect(await totalConCache("todo", cuenta)).toBe(5);
    expect(await totalConCache("todo", cuenta)).toBe(5);
    expect(cuenta).toHaveBeenCalledTimes(1);

    await avisaCambioPedidos();
    expect(await totalConCache("todo", cuenta)).toBe(6);
    expect(await totalConCache("todo", cuenta)).toBe(6);
    expect(cuenta).toHaveBeenCalledTimes(2);
  });

  it("cada oficina tiene su total", async () => {
    expect(await totalConCache("todo", async () => 9)).toBe(9);
    expect(await totalConCache("pozuelo", async () => 3)).toBe(3);
    expect(await totalConCache("todo", async () => 0)).toBe(9);
  });

  it("si entra un pedido mientras se cuenta, ese total no se reutiliza", async () => {
    const cuenta = vi.fn(async () => {
      await avisaCambioPedidos(); // el pedido entra a mitad del recuento
      return 5;
    });
    await totalConCache("todo", cuenta);
    cuenta.mockImplementation(async () => 6);
    expect(await totalConCache("todo", cuenta)).toBe(6);
  });

  it("sin Redis, siempre a Postgres", async () => {
    caido = true;
    const cuenta = vi.fn(async () => 4);
    expect(await totalConCache("todo", cuenta)).toBe(4);
    expect(await totalConCache("todo", cuenta)).toBe(4);
    expect(cuenta).toHaveBeenCalledTimes(2);
  });
});

describe("sesión guardada", () => {
  it("saca la cookie de Better Auth, con o sin __Secure-", () => {
    expect(
      cookieDeSesion("a=1; __Secure-better-auth.session_token=abc.def; b=2"),
    ).toBe("abc.def");
    expect(cookieDeSesion("better-auth.session_token=xyz")).toBe("xyz");
    expect(cookieDeSesion("otra=1")).toBeNull();
    expect(cookieDeSesion(null)).toBeNull();
  });

  it("la clave es la huella, nunca la cookie", async () => {
    const clave = await claveDeSesion("abc.def");
    expect(clave).not.toContain("abc");
    expect(clave).toMatch(/^hsl:panel:ses:[0-9a-f]{64}$/);
    expect(await claveDeSesion("abc.def")).toBe(clave);
  });

  it("se guarda, se lee y al cerrar sesión se olvida", async () => {
    const clave = await claveDeSesion("abc.def");
    expect(await sesionGuardada(clave)).toBeNull();
    await guardaSesion(clave, { id: "u1", rol: "admin" });
    expect(await sesionGuardada(clave)).toEqual({ id: "u1", rol: "admin" });
    await olvidaSesion(clave);
    expect(await sesionGuardada(clave)).toBeNull();
  });
});
