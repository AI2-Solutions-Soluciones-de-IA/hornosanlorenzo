import { useMemo } from "react";
import type { ProductoCarta, Problema } from "~/lib/admin-packs-api";
import {
  dondeDePieza,
  huecoVacio,
  idsDeHuecos,
  mover,
  piezaAEntrada,
  piezaFijaVacia,
  problemasDe,
  type HuecoBorrador,
  type PiezaBorrador,
  type PiezaFijaBorrador,
} from "~/lib/admin-packs-borrador";
import { opcionesDeHueco, type HuecoEleccion } from "~/data/packs";
import { secciones } from "~/data/secciones";
import { formatPriceCents } from "~/lib/format";
import {
  ayuda,
  botonLinea,
  campo,
  etiqueta,
  Mover,
  Problemas,
} from "./comunes";

type Props = {
  piezas: PiezaBorrador[];
  carta: readonly ProductoCarta[];
  /** Solo los que ya toca enseñar (ver `EditorPack`); los avisos van en el resumen. */
  errores: readonly Problema[];
  onChange: (piezas: PiezaBorrador[]) => void;
};

/** Las secciones que se pueden elegir para un hueco: todas menos la de los packs. */
const SECCIONES_HUECO = secciones.filter((s) => s.id !== "packs");

type Grupo = { id: string; label: string; productos: ProductoCarta[] };

/** La carta agrupada por sección, en el orden de la carta impresa; lo que no tiene sección, al final. */
function agrupar(carta: readonly ProductoCarta[]): Grupo[] {
  const grupos: Grupo[] = secciones.map((s) => ({
    id: s.id,
    label: s.label,
    productos: carta.filter((p) => p.seccion === s.id),
  }));
  const conocidas = new Set<string>(secciones.map((s) => s.id));
  grupos.push({
    id: "",
    label: "Sin sección",
    productos: carta.filter((p) => !p.seccion || !conocidas.has(p.seccion)),
  });
  return grupos
    .filter((g) => g.productos.length > 0)
    .map((g) => ({
      ...g,
      productos: [...g.productos].sort((a, b) =>
        a.name.localeCompare(b.name, "es"),
      ),
    }));
}

function estadoProducto(p: ProductoCarta): string {
  if (!p.activo) return " (desactivado)";
  if (p.agotado) return " (agotado)";
  if (p.consultar) return " (precio a consultar)";
  return "";
}

export default function EditorPiezas({
  piezas,
  carta,
  errores,
  onChange,
}: Props) {
  const grupos = useMemo(() => agrupar(carta), [carta]);
  const porSlug = useMemo(
    () => new Map(carta.map((p) => [p.slug, p])),
    [carta],
  );

  const cambiar = (
    i: number,
    cambio: Partial<PiezaFijaBorrador> | Partial<HuecoBorrador>,
  ) =>
    onChange(
      piezas.map((p, j) =>
        j === i ? ({ ...p, ...cambio } as PiezaBorrador) : p,
      ),
    );

  return (
    <div data-donde="piezas">
      <p style={ayuda}>
        En el orden en que se leen en la ficha. Una pieza <strong>fija</strong>{" "}
        va siempre igual; en un <strong>hueco a elegir</strong> el cliente
        escoge en un desplegable.
      </p>
      <Problemas errores={problemasDe(errores, ["piezas"])} />

      <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {piezas.map((p, i) => {
          const donde = dondeDePieza(p, i);
          const errs = problemasDe(errores, donde);
          return (
            <li
              key={p.clave}
              data-donde={`clave:${p.clave}`}
              style={{
                marginTop: 16,
                border: `1px solid ${errs.length ? "var(--color-caramelo)" : "var(--color-avellana)"}`,
                padding: "1rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <p className="numeracion">
                  Pieza {i + 1} ·{" "}
                  {p.tipo === "fija" ? "Fija" : "Hueco a elegir"}
                </p>
                <Mover
                  i={i}
                  total={piezas.length}
                  que={`la pieza ${i + 1}`}
                  onMover={(dir) => onChange(mover(piezas, i, dir))}
                  onQuitar={() => onChange(piezas.filter((_, j) => j !== i))}
                />
              </div>

              {p.tipo === "fija" ? (
                <Fija
                  p={p}
                  i={i}
                  grupos={grupos}
                  producto={porSlug.get(p.slug)}
                  onCambio={(c) => cambiar(i, c)}
                />
              ) : (
                <Hueco
                  p={p}
                  i={i}
                  carta={carta}
                  grupos={grupos}
                  onCambio={(c) => cambiar(i, c)}
                />
              )}

              <Problemas errores={errs} />
            </li>
          );
        })}
      </ol>

      {piezas.length === 0 && (
        <p style={{ ...ayuda, marginTop: 16 }}>
          Todavía no lleva nada. Añade la primera pieza.
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
        <button
          type="button"
          style={botonLinea}
          onClick={() => onChange([...piezas, piezaFijaVacia()])}
        >
          Añadir pieza fija
        </button>
        <button
          type="button"
          style={botonLinea}
          onClick={() => onChange([...piezas, huecoVacio(idsDeHuecos(piezas))])}
        >
          Añadir hueco a elegir
        </button>
      </div>
    </div>
  );
}

function TextosFicha({
  id,
  titulo,
  descripcion,
  onCambio,
  ejemploTitulo,
}: {
  id: string;
  titulo: string;
  descripcion: string;
  onCambio: (c: { titulo?: string; descripcion?: string }) => void;
  ejemploTitulo: string;
}) {
  return (
    <>
      <div style={{ marginTop: 12 }}>
        <label style={etiqueta} htmlFor={`${id}-titulo`}>
          Título en la ficha
        </label>
        <input
          id={`${id}-titulo`}
          value={titulo}
          maxLength={200}
          placeholder={ejemploTitulo}
          onChange={(e) => onCambio({ titulo: e.target.value })}
          style={campo}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <label style={etiqueta} htmlFor={`${id}-desc`}>
          Descripción en la ficha (segunda línea, en pequeño)
        </label>
        <input
          id={`${id}-desc`}
          value={descripcion}
          maxLength={300}
          onChange={(e) => onCambio({ descripcion: e.target.value })}
          style={campo}
        />
      </div>
    </>
  );
}

function Fija({
  p,
  i,
  grupos,
  producto,
  onCambio,
}: {
  p: PiezaFijaBorrador;
  i: number;
  grupos: Grupo[];
  producto: ProductoCarta | undefined;
  onCambio: (c: Partial<PiezaFijaBorrador>) => void;
}) {
  const id = `pz${i}`;
  const variante = producto?.variantes.find((v) => v.variantId === p.variantId);
  const precio =
    variante?.priceCents ??
    (producto && producto.variantes.length === 0 ? producto.priceCents : null);
  return (
    <div>
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}
      >
        <div style={{ flex: "2 1 16rem" }}>
          <label style={etiqueta} htmlFor={`${id}-producto`}>
            Producto
          </label>
          <select
            id={`${id}-producto`}
            value={p.slug}
            onChange={(e) => {
              const nuevo = grupos
                .flatMap((g) => g.productos)
                .find((x) => x.slug === e.target.value);
              // Con un solo tamaño no hay nada que elegir: se pone ese.
              const unico =
                nuevo?.variantes.length === 1
                  ? nuevo.variantes[0].variantId
                  : "";
              onCambio({ slug: e.target.value, variantId: unico });
            }}
            style={campo}
          >
            <option value="">— Elige un producto —</option>
            {grupos.map((g) => (
              <optgroup key={g.id || "sin"} label={g.label}>
                {g.productos.map((x) => (
                  <option key={x.slug} value={x.slug}>
                    {x.name}
                    {estadoProducto(x)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {producto && producto.variantes.length > 0 && (
          <div style={{ flex: "1 1 12rem" }}>
            <label style={etiqueta} htmlFor={`${id}-tamano`}>
              Tamaño
            </label>
            <select
              id={`${id}-tamano`}
              value={p.variantId}
              onChange={(e) => onCambio({ variantId: e.target.value })}
              style={campo}
            >
              <option value="">— Elige un tamaño —</option>
              {producto.variantes.map((v) => (
                <option key={v.variantId} value={v.variantId}>
                  {v.label} · {formatPriceCents(v.priceCents)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {producto && precio !== null && (
        <p style={ayuda}>Precio en la carta: {formatPriceCents(precio)}</p>
      )}

      <TextosFicha
        id={id}
        titulo={p.titulo}
        descripcion={p.descripcion}
        ejemploTitulo="24 bollos preñaos asturianos"
        onCambio={onCambio}
      />

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: 12,
          fontSize: 14,
        }}
      >
        <input
          type="checkbox"
          checked={p.requiereFoto}
          onChange={(e) => onCambio({ requiereFoto: e.target.checked })}
        />
        Lleva la foto del cliente
      </label>
      {p.requiereFoto && (
        <div style={{ marginTop: 12 }}>
          <label style={etiqueta} htmlFor={`${id}-rotulo`}>
            Nombre para el obrador
          </label>
          <input
            id={`${id}-rotulo`}
            value={p.rotulo}
            maxLength={200}
            placeholder="Foto comestible para la plancha"
            onChange={(e) => onCambio({ rotulo: e.target.value })}
            style={campo}
          />
          <p style={ayuda}>
            Así se llama esta pieza en el pedido y en la hoja de producción.
            Vacío: el nombre del producto.
          </p>
        </div>
      )}
    </div>
  );
}

/** Tamaños que aparecen entre los productos del hueco, con cuántos lo tienen. */
function tamanosDe(candidatos: readonly ProductoCarta[]) {
  const res = new Map<string, { label: string; cuantos: number }>();
  for (const x of candidatos) {
    for (const v of x.variantes) {
      const t = res.get(v.variantId);
      if (t) t.cuantos++;
      else res.set(v.variantId, { label: v.label, cuantos: 1 });
    }
  }
  return [...res.entries()].map(([variantId, t]) => ({ variantId, ...t }));
}

function Hueco({
  p,
  i,
  carta,
  grupos,
  onCambio,
}: {
  p: HuecoBorrador;
  i: number;
  carta: readonly ProductoCarta[];
  grupos: Grupo[];
  onCambio: (c: Partial<HuecoBorrador>) => void;
}) {
  const id = `pz${i}`;
  const candidatos =
    p.modo === "seccion"
      ? carta.filter((x) => p.seccion !== "" && x.seccion === p.seccion)
      : carta.filter((x) => p.slugs.includes(x.slug));
  const tamanos = tamanosDe(candidatos);
  // Un tamaño guardado que ya no tiene ningún producto se sigue enseñando, para no perderlo sin querer.
  const tamanoHuerfano =
    p.variantId && !tamanos.some((t) => t.variantId === p.variantId);
  const listo = p.modo === "seccion" ? p.seccion !== "" : p.slugs.length > 0;
  const opciones = listo
    ? opcionesDeHueco(piezaAEntrada(p) as HuecoEleccion, carta)
    : [];

  const alternarSlug = (slug: string) =>
    onCambio({
      slugs: p.slugs.includes(slug)
        ? p.slugs.filter((s) => s !== slug)
        : [...p.slugs, slug],
    });

  return (
    <div>
      <TextosFicha
        id={id}
        titulo={p.titulo}
        descripcion={p.descripcion}
        ejemploTitulo="1 empanada entera, sabor a elegir"
        onCambio={onCambio}
      />
      <div style={{ marginTop: 12 }}>
        <label style={etiqueta} htmlFor={`${id}-etiqueta`}>
          Nombre del desplegable
        </label>
        <input
          id={`${id}-etiqueta`}
          value={p.etiqueta}
          maxLength={100}
          placeholder="Sabor de la empanada"
          onChange={(e) => onCambio({ etiqueta: e.target.value })}
          style={campo}
        />
      </div>

      <fieldset style={{ border: "none", padding: 0, margin: "16px 0 0" }}>
        <legend style={etiqueta}>El cliente elige</legend>
        <div
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            marginTop: 8,
            fontSize: 14,
          }}
        >
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name={`${id}-modo`}
              checked={p.modo === "seccion"}
              onChange={() => onCambio({ modo: "seccion" })}
            />
            Entre una sección de la carta
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="radio"
              name={`${id}-modo`}
              checked={p.modo === "lista"}
              onChange={() => onCambio({ modo: "lista" })}
            />
            Entre los productos que marque
          </label>
        </div>
      </fieldset>

      {p.modo === "seccion" ? (
        <div style={{ marginTop: 12 }}>
          <label style={etiqueta} htmlFor={`${id}-seccion`}>
            Sección
          </label>
          <select
            id={`${id}-seccion`}
            value={p.seccion}
            onChange={(e) => onCambio({ seccion: e.target.value })}
            style={campo}
          >
            <option value="">— Elige una sección —</option>
            {SECCIONES_HUECO.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <p style={ayuda}>
            Si mañana se añade un producto a esa sección, aparece solo en el
            desplegable.
          </p>
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            border: "1px solid var(--color-avellana)",
            maxHeight: "18rem",
            overflowY: "auto",
            padding: "0.5rem 0.75rem",
          }}
        >
          {grupos.map((g) => (
            <div key={g.id || "sin"} style={{ marginTop: 8 }}>
              <p className="numeracion">{g.label}</p>
              {g.productos.map((x) => (
                <label
                  key={x.slug}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 14,
                    marginTop: 4,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={p.slugs.includes(x.slug)}
                    onChange={() => alternarSlug(x.slug)}
                  />
                  {x.name}
                  <span style={{ color: "var(--color-ink-muted)" }}>
                    {estadoProducto(x)}
                  </span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <label style={etiqueta} htmlFor={`${id}-tamano`}>
          Tamaño (el mismo para todas las opciones)
        </label>
        <select
          id={`${id}-tamano`}
          value={p.variantId}
          onChange={(e) => onCambio({ variantId: e.target.value })}
          style={campo}
        >
          <option value="">Sin tamaño: productos de un solo precio</option>
          {tamanos.map((t) => (
            <option key={t.variantId} value={t.variantId}>
              {t.label} · lo tienen {t.cuantos} de {candidatos.length}
            </option>
          ))}
          {tamanoHuerfano && (
            <option value={p.variantId}>
              {p.variantId} · ningún producto lo tiene
            </option>
          )}
        </select>
        <p style={ayuda}>Solo entran los productos que tienen ese tamaño.</p>
      </div>

      <div
        style={{
          marginTop: 16,
          background: "var(--color-latte)",
          padding: "0.75rem 1rem",
        }}
      >
        <p style={etiqueta}>Lo que verá hoy el cliente en el desplegable</p>
        {!listo ? (
          <p style={ayuda}>
            {p.modo === "seccion"
              ? "Elige una sección para verlo."
              : "Marca algún producto para verlo."}
          </p>
        ) : opciones.length === 0 ? (
          <p
            style={{
              marginTop: 6,
              fontSize: 13,
              color: "var(--color-caramelo)",
              fontWeight: 600,
            }}
          >
            Ninguna opción: todas están agotadas, desactivadas o no tienen ese
            tamaño.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: "6px 0 0",
              fontSize: 14,
            }}
          >
            {opciones.map((o) => (
              <li
                key={o.slug}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginTop: 2,
                }}
              >
                <span>{o.name}</span>
                <span
                  style={{
                    color: "var(--color-ink-muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatPriceCents(o.priceCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
