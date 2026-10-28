/**
 * Los 14 alérgenos de declaración obligatoria (Reglamento UE 1169/2011), en
 * su orden oficial. Hasta el 28-10-2026 la web solo admitía 7; se amplió
 * para cargar la lista que manda el obrador. Una sola lista para el panel,
 * la validación del servidor y la ficha pública: los `id` se guardan en
 * `productos.allergens` y no se renombran.
 */
export const alergenos = [
  { id: "gluten", label: "Gluten" },
  { id: "crustaceos", label: "Crustáceos" },
  { id: "huevo", label: "Huevo" },
  { id: "pescado", label: "Pescado" },
  { id: "cacahuetes", label: "Cacahuetes" },
  { id: "soja", label: "Soja" },
  { id: "leche", label: "Leche" },
  { id: "frutos-secos", label: "Frutos de cáscara" },
  { id: "apio", label: "Apio" },
  { id: "mostaza", label: "Mostaza" },
  { id: "sesamo", label: "Sésamo" },
  { id: "sulfitos", label: "Sulfitos" },
  { id: "altramuces", label: "Altramuces" },
  { id: "moluscos", label: "Moluscos" },
] as const;

export type AlergenoId = (typeof alergenos)[number]["id"];

export const alergenoIds = alergenos.map((a) => a.id) as [AlergenoId, ...AlergenoId[]];

/** «Frutos de cáscara», o el id tal cual si no está en la lista. */
export function nombreAlergeno(id: string): string {
  return alergenos.find((a) => a.id === id)?.label ?? id;
}
