import { describe, expect, it } from "vitest";
import {
  erroresEmpresa,
  esCifValido,
  validaEntrada,
  validaNuevaContrasena,
  validaRecuperar,
  validaRegistro,
} from "~/lib/auth/validacion";

describe("validaRegistro", () => {
  const bueno = {
    nombre: "Ana",
    email: "ana@ejemplo.com",
    telefono: "666123456",
    password: "unaclavelarga",
  };

  it("acepta un alta completa", () => {
    expect(validaRegistro(bueno)).toEqual({ ok: true });
  });

  it("no deja pasar un nombre de más de 100 caracteres", () => {
    const r = validaRegistro({ ...bueno, nombre: "a".repeat(101) });
    expect(r.ok === false && r.errores.nombre).toMatch(/100 caracteres/);
    expect(validaRegistro({ ...bueno, nombre: "a".repeat(100) })).toEqual({ ok: true });
  });

  it("exige nombre", () => {
    const r = validaRegistro({ ...bueno, nombre: " " });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.errores.nombre).toBeTruthy();
  });

  it("exige un correo con forma de correo", () => {
    const r = validaRegistro({ ...bueno, email: "ana@" });
    expect(r.ok === false && r.errores.email).toBeTruthy();
  });

  it("reutiliza la validación de teléfono del pedido", () => {
    const r = validaRegistro({ ...bueno, telefono: "12345" });
    expect(r.ok === false && r.errores.telefono).toBeTruthy();
  });

  it("exige ocho caracteres de contraseña, como el servidor", () => {
    const r = validaRegistro({ ...bueno, password: "corta7" });
    expect(r.ok === false && r.errores.password).toBeTruthy();
  });
});

describe("validaEntrada", () => {
  it("solo mira que haya correo y contraseña", () => {
    expect(validaEntrada({ email: "ana@ejemplo.com", password: "x" })).toEqual({
      ok: true,
    });
    expect(validaEntrada({ email: "", password: "x" }).ok).toBe(false);
  });
});

describe("validaRecuperar", () => {
  it("acepta un correo con forma de correo", () => {
    expect(validaRecuperar({ email: "ana@ejemplo.com" })).toEqual({
      ok: true,
    });
  });

  it("exige un correo con forma de correo", () => {
    const r = validaRecuperar({ email: "no-es-correo" });
    expect(r.ok === false && r.errores.email).toBeTruthy();
  });
});

describe("validaNuevaContrasena", () => {
  it("acepta dos contraseñas iguales y suficientemente largas", () => {
    expect(
      validaNuevaContrasena({
        password: "unaclavelarga",
        confirmar: "unaclavelarga",
      }),
    ).toEqual({ ok: true });
  });

  it("exige el mínimo de caracteres, como el servidor", () => {
    const r = validaNuevaContrasena({
      password: "corta7",
      confirmar: "corta7",
    });
    expect(r.ok === false && r.errores.password).toBeTruthy();
  });

  it("exige que las dos contraseñas coincidan", () => {
    const r = validaNuevaContrasena({
      password: "unaclavelarga",
      confirmar: "otraclavelarga",
    });
    expect(r.ok === false && r.errores.confirmar).toBeTruthy();
  });
});

describe("alta de empresa", () => {
  it("acepta CIF de sociedad, NIF de autónomo y NIE, con espacios o guiones", () => {
    for (const v of ["B12345678", "b-12.345.678", "A1234567J", "12345678Z", "X1234567L"]) expect(esCifValido(v)).toBe(true);
    for (const v of ["", "B1234567", "123", "I12345678", "ZZZ"]) expect(esCifValido(v)).toBe(false);
  });

  it("razón social y CIF van juntos; sin ninguno es una cuenta de particular", () => {
    expect(erroresEmpresa({})).toEqual({});
    expect(erroresEmpresa({ empresa: "Bar Pepe", cif: "B12345678" })).toEqual({});
    expect(erroresEmpresa({ empresa: "Bar Pepe" }).cif).toBeTruthy();
    expect(erroresEmpresa({ cif: "B12345678" }).empresa).toBeTruthy();
    expect(erroresEmpresa({ empresa: "Bar Pepe", cif: "nope" }).cif).toMatch(/no parece válido/);
  });
});
