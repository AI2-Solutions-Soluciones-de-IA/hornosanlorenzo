import { Fragment } from "react";
import { CLASES_PAGINACION as C, numerosPagina } from "~/lib/paginacion";

type Props = {
  pagina: number;
  paginas: number;
  /** Para qué es, leído por un lector de pantalla: «Páginas de pedidos». */
  etiqueta: string;
} &
  /** En una página de servidor (sin `client:`): enlaces a `?pagina=N`. */
  (| { href: (n: number) => string; onCambiar?: never }
    /** Dentro de una isla: botones que cambian de página sin recargar. */
    | { onCambiar: (n: number) => void; href?: never }
  );

/**
 * La barra «← Anterior 1 2 3 Siguiente →» del panel. Con una sola página no
 * pinta nada.
 */
export default function Paginacion({
  pagina,
  paginas,
  etiqueta,
  href,
  onCambiar,
}: Props) {
  if (paginas <= 1) return null;

  const ir = (
    n: number,
    texto: React.ReactNode,
    clase: string,
    extra: Record<string, string> = {},
  ) =>
    href ? (
      <a href={href(n)} className={clase} {...extra}>
        {texto}
      </a>
    ) : (
      <button
        type="button"
        className={clase}
        onClick={() => onCambiar!(n)}
        {...extra}
      >
        {texto}
      </button>
    );

  return (
    <nav aria-label={etiqueta} className={C.nav}>
      {pagina > 1 ? (
        ir(pagina - 1, "← Anterior", C.boton, { rel: "prev" })
      ) : (
        <span className={C.apagado}>← Anterior</span>
      )}
      {numerosPagina(pagina, paginas).map((n, i) =>
        n === "…" ? (
          <span key={`p${i}`} className={C.puntos}>
            …
          </span>
        ) : n === pagina ? (
          <span key={n} className={C.actual} aria-current="page">
            {n}
          </span>
        ) : (
          <Fragment key={n}>{ir(n, n, C.boton)}</Fragment>
        ),
      )}
      {pagina < paginas ? (
        ir(pagina + 1, "Siguiente →", C.boton, { rel: "next" })
      ) : (
        <span className={C.apagado}>Siguiente →</span>
      )}
    </nav>
  );
}
