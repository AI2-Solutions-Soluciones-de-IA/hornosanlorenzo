import { describe, expect, it } from "vitest";
import {
  destinosVisibles,
  esAdmin,
  guardiaAdmin,
  vePedidos,
  ROL_ADMIN,
  ROL_OFICINA,
  ROL_OFICINA_ALCOBENDAS,
  ROL_OFICINA_POZUELO, veClientes, destinosDeVista } from "~/lib/auth/guardia";

const cliente = { id: "u1", email: "a@b.c", name: "Ana", rol: "cliente" };
const admin = { id: "u2", email: "c@d.e", name: "Carmen", rol: ROL_ADMIN };
const oficina = { id: "u3", email: "o@f.i", name: "Olga", rol: ROL_OFICINA };

describe("esAdmin", () => {
  it("solo es admin quien tiene el papel exacto", () => {
    expect(esAdmin(admin)).toBe(true);
    expect(esAdmin(cliente)).toBe(false);
    expect(esAdmin(null)).toBe(false);
    expect(esAdmin({ ...cliente, rol: null })).toBe(false);
    // Ni parecidos ni mayúsculas: la comparación es exacta a propósito.
    expect(esAdmin({ ...cliente, rol: "Admin" })).toBe(false);
    expect(esAdmin({ ...cliente, rol: "administrador" })).toBe(false);
  });
});

describe("guardiaAdmin", () => {
  it("deja pasar todo lo que no sea del panel, incluso sin sesión", () => {
    expect(guardiaAdmin({ usuario: null, pathname: "/catalogo" })).toBeNull();
    expect(guardiaAdmin({ usuario: null, pathname: "/" })).toBeNull();
    // Una ruta que solo EMPIECE por las mismas letras no es el panel.
    expect(
      guardiaAdmin({ usuario: null, pathname: "/administracion" }),
    ).toBeNull();
  });

  it("sin sesión, manda a /acceso", () => {
    const respuesta = guardiaAdmin({
      usuario: null,
      pathname: "/admin/pedidos",
    })!;
    expect(respuesta.status).toBe(302);
    expect(respuesta.headers.get("location")).toBe("/acceso");
  });

  it("con sesión de cliente, 404: el panel no se confirma a quien no entra", () => {
    const respuesta = guardiaAdmin({
      usuario: cliente,
      pathname: "/admin/pedidos",
    })!;
    expect(respuesta.status).toBe(404);
    // Ni una palabra sobre permisos: eso ya diría que la ruta existe.
    expect(respuesta.headers.get("location")).toBeNull();
  });

  it("cubre también los endpoints del panel", () => {
    expect(
      guardiaAdmin({ usuario: cliente, pathname: "/api/admin/noticias" })!
        .status,
    ).toBe(404);
  });

  it("con sesión de admin, deja pasar", () => {
    expect(
      guardiaAdmin({ usuario: admin, pathname: "/admin/pedidos" }),
    ).toBeNull();
  });

  // Astro sirve `//admin/clientes` como `/admin/clientes`: la guardia tiene
  // que ver lo mismo (auditoría del 10-10-2026).
  it("las barras repetidas no abren el panel", () => {
    for (const pathname of [
      "//admin/clientes",
      "//admin",
      "/admin//clientes",
      "///admin/pedidos",
      "//api/admin/productos",
    ]) {
      const anonimo = guardiaAdmin({ usuario: null, pathname })!;
      expect(anonimo.status).toBe(302);
      expect(anonimo.headers.get("location")).toBe("/acceso");
      expect(guardiaAdmin({ usuario: cliente, pathname })!.status).toBe(404);
    }
    expect(
      guardiaAdmin({ usuario: oficina, pathname: "//admin/resumen" })!.status,
    ).toBe(404);
    expect(
      guardiaAdmin({ usuario: oficina, pathname: "//admin/pedidos" }),
    ).toBeNull();
  });
});

describe("rol oficina", () => {
  it("no es admin, pero ve los pedidos", () => {
    expect(esAdmin(oficina)).toBe(false);
    expect(vePedidos(oficina)).toBe(true);
    expect(vePedidos(admin)).toBe(true);
    expect(vePedidos(cliente)).toBe(false);
  });

  it("entra a Pedidos, a su API y a su Excel", () => {
    expect(
      guardiaAdmin({ usuario: oficina, pathname: "/admin/pedidos" }),
    ).toBeNull();
    expect(
      guardiaAdmin({ usuario: oficina, pathname: "/api/admin/pedidos" }),
    ).toBeNull();
    expect(
      guardiaAdmin({
        usuario: oficina,
        pathname: "/api/admin/pedidos/exportar",
      }),
    ).toBeNull();
  });

  it("al entrar al panel va a Pedidos", () => {
    for (const pathname of ["/admin", "/admin/"]) {
      const r = guardiaAdmin({ usuario: oficina, pathname })!;
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toBe("/admin/pedidos");
    }
  });

  it("el resto del panel, 404", () => {
    for (const pathname of [
      "/admin/resumen",
      "/admin/produccion",
      "/admin/productos",
      "/admin/clientes",
      "/admin/pedidosx",
      "/api/admin/productos",
      "/api/admin/clientes/exportar",
    ])
      expect(guardiaAdmin({ usuario: oficina, pathname })!.status).toBe(404);
  });
});

describe("oficina de cada tienda", () => {
  const alcobendas = { id: "u4", email: "al@b.c", name: "Alba", rol: ROL_OFICINA_ALCOBENDAS };
  const pozuelo = { id: "u5", email: "po@z.u", name: "Pablo", rol: ROL_OFICINA_POZUELO };

  it("Alcobendas ve también Clientes; Pozuelo no (12-11-2026)", () => {
    expect(veClientes(alcobendas)).toBe(true);
    expect(guardiaAdmin({ usuario: alcobendas, pathname: "/admin/clientes" })).toBeNull();
    expect(guardiaAdmin({ usuario: alcobendas, pathname: "/api/admin/clientes/exportar" })).toBeNull();
    expect(veClientes(pozuelo)).toBe(false);
    expect(guardiaAdmin({ usuario: pozuelo, pathname: "/admin/clientes" })!.status).toBe(404);
    expect(guardiaAdmin({ usuario: pozuelo, pathname: "/api/admin/clientes/exportar" })!.status).toBe(404);
  });

  it("entra a Pedidos y a nada más de lo de admin", () => {
    for (const usuario of [alcobendas, pozuelo]) {
      expect(guardiaAdmin({ usuario, pathname: "/admin/produccion" })!.status).toBe(404);
      expect(guardiaAdmin({ usuario, pathname: "/admin/noticias" })!.status).toBe(404);
      expect(esAdmin(usuario)).toBe(false);
      expect(vePedidos(usuario)).toBe(true);
      expect(guardiaAdmin({ usuario, pathname: "/admin/pedidos" })).toBeNull();
      expect(guardiaAdmin({ usuario, pathname: "/admin" })!.headers.get("location")).toBe(
        "/admin/pedidos",
      );
      expect(guardiaAdmin({ usuario, pathname: "/admin/productos" })!.status).toBe(404);
    }
  });

  it("Alcobendas ve lo suyo y los envíos a domicilio; Pozuelo, lo suyo", () => {
    expect(destinosVisibles(alcobendas)).toEqual(["alcobendas", "domicilio"]);
    expect(destinosVisibles(pozuelo)).toEqual(["pozuelo"]);
  });

  it("la oficina general sigue sin Clientes; el admin, sí", () => {
    expect(veClientes(oficina)).toBe(false);
    expect(guardiaAdmin({ usuario: oficina, pathname: "/admin/clientes" })!.status).toBe(404);
    expect(veClientes(admin)).toBe(true);
  });

  it("el admin y la oficina general lo ven todo", () => {
    expect(destinosVisibles(admin)).toBeUndefined();
    expect(destinosVisibles(oficina)).toBeUndefined();
  });

  it("un papel parecido no cuela", () => {
    const raro = { ...pozuelo, rol: "oficina_POZUELO" };
    expect(vePedidos(raro)).toBe(false);
  });
});

describe("pestañas Todo · Alcobendas · Pozuelo (12-11-2026)", () => {
  it("quien lo ve todo elige; la oficina de una tienda no puede ampliar lo suyo", () => {
    expect(destinosDeVista(admin, undefined)).toBeUndefined();
    expect(destinosDeVista(admin, "alcobendas")).toEqual(["alcobendas", "domicilio"]);
    expect(destinosDeVista(admin, "pozuelo")).toEqual(["pozuelo"]);
    const pozuelo = { id: "u5", email: "po@z.u", name: "Pablo", rol: ROL_OFICINA_POZUELO };
    expect(destinosDeVista(pozuelo, "alcobendas")).toEqual(["pozuelo"]);
    expect(destinosDeVista(pozuelo, undefined)).toEqual(["pozuelo"]);
  });
});
