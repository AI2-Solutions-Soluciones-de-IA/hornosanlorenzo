/**
 * Visor de la carta: abre una página a pantalla completa y deja ampliarla.
 *
 * Al abrir, la página cabe entera en pantalla («100 %»). Con + / −, las
 * teclas + y −, o doble clic (doble toque) sobre la página se amplía hasta
 * 3× desplazándose con scroll; al cambiar el zoom se mantiene en el centro
 * lo que se estaba mirando. ← y → pasan de página; Esc cierra.
 *
 * Como el carrusel, se engancha en cada `astro:page-load` (ClientRouter).
 */
const NIVELES = [1, 1.5, 2, 3];

function engancha(visor: HTMLDialogElement) {
  const abrir = document.querySelectorAll<HTMLButtonElement>("[data-visor-abrir]");
  const lienzo = visor.querySelector<HTMLElement>("[data-visor-lienzo]")!;
  const img = visor.querySelector<HTMLImageElement>("[data-visor-img]")!;
  const rotulo = visor.querySelector<HTMLElement>("[data-visor-pagina]")!;
  const rotuloZoom = visor.querySelector<HTMLElement>("[data-visor-zoom]")!;
  const boton = (n: string) =>
    visor.querySelector<HTMLButtonElement>(`[data-visor-${n}]`)!;
  const [prev, next, menos, mas, cerrar] = ["prev", "next", "menos", "mas", "cerrar"].map(boton);
  const total = abrir.length;

  let actual = 0;
  let nivel = 0;
  let origen: HTMLElement | null = null;

  /** Ancho con el que la página cabe entera en el lienzo. */
  const anchoBase = () => {
    const estilo = getComputedStyle(lienzo);
    const pad = parseFloat(estilo.paddingLeft) + parseFloat(estilo.paddingRight);
    const w = lienzo.clientWidth - pad;
    const h = lienzo.clientHeight - pad;
    const proporcion = img.naturalWidth && img.naturalHeight
      ? img.naturalWidth / img.naturalHeight
      : img.width / img.height;
    return Math.max(120, Math.min(w, h * proporcion));
  };

  const pinta = (mantenerCentro = false) => {
    // Qué punto de la página estaba en el centro, en proporción.
    const cx = (lienzo.scrollLeft + lienzo.clientWidth / 2) / lienzo.scrollWidth;
    const cy = (lienzo.scrollTop + lienzo.clientHeight / 2) / lienzo.scrollHeight;
    img.style.width = `${Math.round(anchoBase() * NIVELES[nivel])}px`;
    if (mantenerCentro) {
      lienzo.scrollLeft = cx * lienzo.scrollWidth - lienzo.clientWidth / 2;
      lienzo.scrollTop = cy * lienzo.scrollHeight - lienzo.clientHeight / 2;
    }
    lienzo.toggleAttribute("data-ampliado", nivel > 0);
    rotuloZoom.textContent = `${Math.round(NIVELES[nivel] * 100)} %`;
    menos.disabled = nivel === 0;
    mas.disabled = nivel === NIVELES.length - 1;
  };

  const zoom = (nuevo: number) => {
    nivel = Math.max(0, Math.min(NIVELES.length - 1, nuevo));
    pinta(true);
  };

  const muestra = (i: number) => {
    actual = Math.max(0, Math.min(total - 1, i));
    const fuente = abrir[actual];
    img.src = fuente.dataset.grande!;
    img.alt = fuente.querySelector("img")?.alt ?? "";
    rotulo.textContent = `${actual + 1} de ${total}`;
    prev.disabled = actual === 0;
    next.disabled = actual === total - 1;
    nivel = 0;
    lienzo.scrollTo(0, 0);
    pinta();
  };

  abrir.forEach((b) =>
    b.addEventListener("click", () => {
      origen = b;
      visor.showModal();
      muestra(Number(b.dataset.visorAbrir));
    }),
  );
  prev.addEventListener("click", () => muestra(actual - 1));
  next.addEventListener("click", () => muestra(actual + 1));
  menos.addEventListener("click", () => zoom(nivel - 1));
  mas.addEventListener("click", () => zoom(nivel + 1));
  cerrar.addEventListener("click", () => visor.close());
  img.addEventListener("dblclick", () => zoom(nivel === 0 ? 2 : 0));
  // La imagen grande puede tardar: al llegar ya sabemos su proporción real.
  img.addEventListener("load", () => pinta());
  visor.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" && nivel === 0) muestra(actual + 1);
    else if (e.key === "ArrowLeft" && nivel === 0) muestra(actual - 1);
    else if (e.key === "+" || e.key === "=") zoom(nivel + 1);
    else if (e.key === "-") zoom(nivel - 1);
    else return;
    e.preventDefault();
  });
  visor.addEventListener("close", () => {
    img.removeAttribute("src");
    origen?.focus();
  });
  new ResizeObserver(() => visor.open && pinta()).observe(lienzo);
}

function iniciarVisor() {
  const visor = document.querySelector<HTMLDialogElement>("[data-visor]");
  if (!visor || visor.dataset.visorListo) return;
  visor.dataset.visorListo = "1";
  engancha(visor);
}

document.addEventListener("astro:page-load", iniciarVisor);
