import { describe, expect, it } from "vitest";
import { eurosACentimos } from "./euros";

describe("eurosACentimos", () => {
  it("coma o punto decimal, y redondea al céntimo", () => {
    expect(eurosACentimos("19,99")).toBe(1999);
    expect(eurosACentimos("19.99")).toBe(1999);
    expect(eurosACentimos(" 40 ")).toBe(4000);
    // 19.99 * 100 en coma flotante es 1998.999…: tiene que redondear.
    expect(eurosACentimos("0,07")).toBe(7);
  });
  it("tolera el símbolo del euro y los miles con punto", () => {
    expect(eurosACentimos("12,50 €")).toBe(1250);
    expect(eurosACentimos("€12,50")).toBe(1250);
    expect(eurosACentimos("1.234,50")).toBe(123450);
  });
  it("null si está vacío o no es un precio", () => {
    expect(eurosACentimos("")).toBeNull();
    expect(eurosACentimos("   ")).toBeNull();
    expect(eurosACentimos("abc")).toBeNull();
    expect(eurosACentimos("12,50,3")).toBeNull();
    expect(eurosACentimos("12 50")).toBeNull();
  });
});
