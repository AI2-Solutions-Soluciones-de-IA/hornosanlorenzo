import { useEffect, useState } from "react";
import { chipGrande, selectRojo } from "~/islands/CategoryFilter";

type Chip = { id: string; label: string };

type Props = {
  /** Un chip por bloque de la página, en su orden; «Todo» va delante. */
  bloques: Chip[];
  etiqueta: string;
};

/**
 * Filtro de Este mes (16-10-2026): las mismas etiquetas que /catalogo, pero
 * cada una enseña un bloque entero de la página (`[data-bloque]`) en vez de
 * filtrar productos. El elegido va en `?s=` para poder compartir el enlace.
 */
export default function FiltroBloques({ bloques, etiqueta }: Props) {
  const [activo, setActivo] = useState("all");
  const [listo, setListo] = useState(false);

  useEffect(() => {
    const s = new URLSearchParams(window.location.search).get("s");
    if (s && bloques.some((b) => b.id === s)) setActivo(s);
    setListo(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!listo) return;
    const url = new URL(window.location.href);
    if (activo === "all") url.searchParams.delete("s");
    else url.searchParams.set("s", activo);
    window.history.replaceState({}, "", url.toString());
    document.querySelectorAll<HTMLElement>("[data-bloque]").forEach((el) => {
      el.style.display =
        activo === "all" || el.dataset.bloque === activo ? "" : "none";
      // La raya de arriba separa un bloque del anterior: con uno solo a la
      // vista quedaba pegada a las etiquetas.
      el.style.borderTopWidth = activo === "all" ? "" : "0";
    });
  }, [activo, listo]);

  const chips: Chip[] = [{ id: "all", label: "Todo" }, ...bloques];

  return (
    <>
      <label className="md:hidden block">
        <span className="sr-only">{etiqueta}</span>
        <select
          value={activo}
          onChange={(e) => setActivo(e.target.value)}
          style={selectRojo}
        >
          {chips.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <div
        role="tablist"
        aria-label={etiqueta}
        className="hidden md:flex flex-wrap gap-2"
      >
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === activo}
            onClick={() => setActivo(c.id)}
            style={chipGrande(c.id === activo)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </>
  );
}
