import { describe, expect, it } from "vitest";
import { esAdmin, guardiaAdmin, vePedidos, ROL_ADMIN, ROL_OFICINA } from "~/lib/auth/guardia";

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
});

describe("rol oficina", () => {
  it("no es admin, pero ve los pedidos", () => {
    expect(esAdmin(oficina)).toBe(false);
    expect(vePedidos(oficina)).toBe(true);
    expect(vePedidos(admin)).toBe(true);
    expect(vePedidos(cliente)).toBe(false);
  });

  it("entra a Pedidos, a su API y a su Excel", () => {
    expect(guardiaAdmin({ usuario: oficina, pathname: "/admin/pedidos" })).toBeNull();
    expect(guardiaAdmin({ usuario: oficina, pathname: "/api/admin/pedidos" })).toBeNull();
    expect(guardiaAdmin({ usuario: oficina, pathname: "/api/admin/pedidos/exportar" })).toBeNull();
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
