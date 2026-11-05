import { describe, expect, it } from "vitest";
import { enumeraAlergenos } from "~/data/alergenos";

describe("enumeraAlergenos", () => {
  it("en minúscula, con «y» antes del último", () => {
    expect(enumeraAlergenos(["gluten", "huevo", "frutos-secos"])).toBe("gluten, huevo y frutos de cáscara");
    expect(enumeraAlergenos(["soja"])).toBe("soja");
    expect(enumeraAlergenos([])).toBe("");
  });
});
