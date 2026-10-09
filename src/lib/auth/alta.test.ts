import { describe, expect, it } from "vitest";
import {
  preparaAltaUsuario,
  preparaActualizacionUsuario,
} from "~/lib/auth/alta";

describe("preparaAltaUsuario", () => {
  const bueno = { name: "Ana", telefono: "666123456" };

  it("alta de empresa: guarda la razón social y el CIF normalizado", async () => {
    const { data } = await preparaAltaUsuario({ ...bueno, empresa: "  Bar Pepe, S.L. ", cif: "b-12345678" });
    expect(data.empresa).toBe("Bar Pepe, S.L.");
    expect(data.cif).toBe("B12345678");
  });

  it("alta de empresa: un CIF mal escrito o sin razón social se rechaza", async () => {
    await expect(preparaAltaUsuario({ ...bueno, empresa: "Bar Pepe", cif: "123" })).rejects.toMatchObject({
      body: { code: "INVALID_CIF" },
    });
    await expect(preparaAltaUsuario({ ...bueno, cif: "B12345678" })).rejects.toMatchObject({
      body: { code: "INVALID_COMPANY" },
    });
  });

  it("alta de particular: sin empresa ni CIF quedan vacíos", async () => {
    const { data } = await preparaAltaUsuario(bueno);
    expect(data.empresa).toBeNull();
    expect(data.cif).toBeNull();
  });

  it("acepta un alta con nombre y teléfono válidos", async () => {
    const { data } = await preparaAltaUsuario(bueno);
    expect(data.name).toBe("Ana");
    expect(data.telefono).toBe("666123456");
  });

  it("normaliza el teléfono al guardarlo", async () => {
    const { data } = await preparaAltaUsuario({
      ...bueno,
      telefono: "+34 666 12 34 56",
    });
    expect(data.telefono).toBe("666123456");
  });

  it("recorta espacios del nombre", async () => {
    const { data } = await preparaAltaUsuario({ ...bueno, name: "  Ana  " });
    expect(data.name).toBe("Ana");
  });

  it("rechaza el alta si el nombre queda vacío tras recortarlo", async () => {
    await expect(
      preparaAltaUsuario({ ...bueno, name: "   " }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });

  it("acepta un nombre de 100 caracteres y rechaza uno de 101", async () => {
    const { data } = await preparaAltaUsuario({ ...bueno, name: "a".repeat(100) });
    expect(data.name).toHaveLength(100);
    await expect(
      preparaAltaUsuario({ ...bueno, name: "a".repeat(101) }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });

  it("también al editar la cuenta: un nombre de 101 caracteres no entra", async () => {
    await expect(
      preparaActualizacionUsuario({ name: "a".repeat(101) }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });

  it("rechaza el alta sin teléfono, aunque el campo sea opcional en el esquema", async () => {
    const { telefono, ...sinTelefono } = bueno;
    await expect(preparaAltaUsuario(sinTelefono)).rejects.toMatchObject({
      status: "BAD_REQUEST",
    });
  });

  it("rechaza un teléfono que no tiene forma de teléfono español", async () => {
    await expect(
      preparaAltaUsuario({ ...bueno, telefono: "12345" }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });
});

// El endpoint `update-user` de Better Auth solo manda los campos que
// cambian: a diferencia del alta, aquí un campo ausente no debe rechazarse.
describe("preparaActualizacionUsuario", () => {
  it("no toca nada si la actualización no trae ni nombre ni teléfono", async () => {
    const { data } = await preparaActualizacionUsuario({ image: "foto.png" });
    expect(data).toEqual({ image: "foto.png" });
  });

  it("valida y normaliza el teléfono cuando es lo único que cambia", async () => {
    const { data } = await preparaActualizacionUsuario({
      telefono: "+34 666 12 34 56",
    });
    expect(data.telefono).toBe("666123456");
    expect(data.name).toBeUndefined();
  });

  it("valida el nombre cuando es lo único que cambia", async () => {
    const { data } = await preparaActualizacionUsuario({ name: "  Ana  " });
    expect(data.name).toBe("Ana");
    expect(data.telefono).toBeUndefined();
  });

  it("rechaza un nombre en blanco aunque el teléfono no venga", async () => {
    await expect(
      preparaActualizacionUsuario({ name: "   " }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });

  it("rechaza un teléfono sin forma de teléfono español aunque el nombre no venga", async () => {
    await expect(
      preparaActualizacionUsuario({ telefono: "12345" }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });

  it("valida los dos campos cuando los dos cambian a la vez", async () => {
    const { data } = await preparaActualizacionUsuario({
      name: "Ana",
      telefono: "666123456",
    });
    expect(data.name).toBe("Ana");
    expect(data.telefono).toBe("666123456");
  });
});
