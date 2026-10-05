/**
 * Carruseles de scroll nativo (destacados de la home, páginas de la carta).
 *
 * Marcado que espera, dentro de un `[data-carrusel]`:
 *   - `[data-carrusel-pista]`: el contenedor con `overflow-x` y snap.
 *   - `[data-carrusel-prev]` / `[data-carrusel-next]`: las flechas.
 *   - `[data-carrusel-contador]` (opcional): «1–2 de 12».
 * Con `data-carrusel="pantalla"` cada flecha pasa todo lo que se ve (la
 * carta, de dos en dos); si no, pasa de una en una.
 *
 * El sitio navega sin recargar (`ClientRouter`) y un script de página solo
 * corre la primera vez: por eso se engancha en cada `astro:page-load`, con
 * una marca para no hacerlo dos veces sobre el mismo carrusel.
 */
function engancha(raiz: HTMLElement) {
  const pista = raiz.querySelector<HTMLElement>("[data-carrusel-pista]");
  const prev = raiz.querySelector<HTMLButtonElement>("[data-carrusel-prev]");
  const next = raiz.querySelector<HTMLButtonElement>("[data-carrusel-next]");
  const contador = raiz.querySelector<HTMLElement>("[data-carrusel-contador]");
  if (!pista || !prev || !next) return;

  const porPantalla = raiz.dataset.carrusel === "pantalla";
  const total = pista.children.length;

  /** Una tarjeta más el hueco entre tarjetas. */
  const ancho = () => {
    const a = pista.children[0] as HTMLElement | undefined;
    const b = pista.children[1] as HTMLElement | undefined;
    return a && b ? b.offsetLeft - a.offsetLeft : pista.clientWidth;
  };
  const visibles = () =>
    Math.max(1, Math.round((pista.clientWidth + 1) / ancho()));
  const paso = () => (porPantalla ? visibles() * ancho() : ancho());

  const actualiza = () => {
    const max = pista.scrollWidth - pista.clientWidth;
    // Con todo en pantalla quedan las dos desactivadas, o sea, ocultas.
    prev.disabled = pista.scrollLeft <= 1;
    next.disabled = pista.scrollLeft >= max - 1;
    if (contador) {
      const primera = Math.round(pista.scrollLeft / ancho()) + 1;
      const ultima = Math.min(primera + visibles() - 1, total);
      contador.textContent =
        primera === ultima
          ? `${primera} de ${total}`
          : `${primera}–${ultima} de ${total}`;
    }
  };

  prev.addEventListener("click", () => pista.scrollBy({ left: -paso() }));
  next.addEventListener("click", () => pista.scrollBy({ left: paso() }));
  pista.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") next.click();
    else if (e.key === "ArrowLeft") prev.click();
    else return;
    e.preventDefault();
  });
  pista.addEventListener("scroll", actualiza, { passive: true });
  // Observa el propio carrusel: muere con él al navegar, sin dejar escuchas
  // colgadas en `window`.
  new ResizeObserver(actualiza).observe(pista);
  actualiza();

  const velocidad = Number(raiz.dataset.carruselAuto);
  if (velocidad > 0) desliza(raiz, pista, velocidad);
}

/**
 * `data-carrusel-auto="<px/s>"`: el carrusel se desliza solo, despacio y sin
 * saltos, hasta el final; espera un poco y vuelve igual hacia el principio.
 * Ida y vuelta en vez de bucle infinito para no clonar tarjetas (los clones
 * no traerían vivos los botones de «Añadir»).
 *
 * Se para mientras el ratón o el foco están dentro, si el carrusel no se ve
 * o la pestaña está oculta, y del todo cuando la persona lo mueve a mano.
 * Con «reducir movimiento» no arranca.
 */
function desliza(raiz: HTMLElement, pista: HTMLElement, velocidad: number) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const PAUSA_EN_EXTREMO = 2000;
  let encima = false;
  let visible = false;
  let tocado = false;
  let sentido = 1;
  let esperaHasta = 0;
  let pos = pista.scrollLeft;
  let antes = 0;

  // El snap y el scroll suave pelearían con el avance de píxel en píxel.
  raiz.classList.add("carrusel--auto");
  const suelta = () => {
    tocado = true;
    raiz.classList.remove("carrusel--auto");
  };

  raiz.addEventListener("pointerenter", () => (encima = true));
  raiz.addEventListener("pointerleave", () => (encima = false));
  raiz.addEventListener("pointerdown", suelta);
  pista.addEventListener("touchstart", suelta, { passive: true });
  pista.addEventListener(
    "wheel",
    (e) => {
      // Solo la rueda horizontal: la vertical es la página bajando.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) suelta();
    },
    { passive: true },
  );

  new IntersectionObserver(([e]) => (visible = e.isIntersecting), {
    threshold: 0.3,
  }).observe(pista);

  const paso = (ahora: number) => {
    // Al navegar a otra página el carrusel sale del DOM: se apaga solo.
    if (!pista.isConnected || tocado) return;
    const dt = antes ? Math.min(ahora - antes, 100) : 0;
    antes = ahora;
    requestAnimationFrame(paso);

    const parado =
      encima ||
      !visible ||
      document.hidden ||
      raiz.contains(document.activeElement);
    if (parado) {
      // Al seguir, parte de donde esté (las flechas o el teclado lo movieron).
      pos = pista.scrollLeft;
      return;
    }
    if (ahora < esperaHasta) return;

    const max = pista.scrollWidth - pista.clientWidth;
    if (max <= 1) return;
    pos += (sentido * velocidad * dt) / 1000;
    if (pos >= max || pos <= 0) {
      pos = Math.min(Math.max(pos, 0), max);
      sentido = -sentido;
      esperaHasta = ahora + PAUSA_EN_EXTREMO;
    }
    pista.scrollLeft = pos;
  };
  requestAnimationFrame(paso);
}

export function iniciarCarruseles() {
  document.querySelectorAll<HTMLElement>("[data-carrusel]").forEach((raiz) => {
    if (raiz.dataset.carruselListo) return;
    raiz.dataset.carruselListo = "1";
    engancha(raiz);
  });
}

document.addEventListener("astro:page-load", iniciarCarruseles);
