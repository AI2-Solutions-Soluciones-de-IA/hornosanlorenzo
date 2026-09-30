-- Packs editables desde el panel (30-9-2026). El pack sigue siendo una fila
-- de `productos` (categoría `packs`): nombre, precio, foto y activo viven
-- allí. Aquí va lo que antes estaba en `src/data/packs.ts`.
create table if not exists pack_definiciones (
  producto_id    uuid primary key references productos(id) on delete cascade,
  ocasion        text not null,
  personas_min   integer not null check (personas_min > 0),
  personas_max   integer not null check (personas_max >= personas_min),
  personas_texto text not null,
  para_quien     text[] not null default '{}',
  consejo        text
);

create table if not exists pack_piezas (
  id            uuid primary key default gen_random_uuid(),
  producto_id   uuid not null references pack_definiciones(producto_id) on delete cascade,
  orden         integer not null,
  tipo          text not null check (tipo in ('fija', 'eleccion')),
  titulo        text not null,
  descripcion   text not null default '',
  variant_id    text,
  -- fija
  slug          text,
  requiere_foto boolean not null default false,
  rotulo        text,
  -- eleccion
  hueco_id      text,
  etiqueta      text,
  seccion       text,
  slugs         text[],
  check (
    (tipo = 'fija' and slug is not null and hueco_id is null and etiqueta is null
       and seccion is null and slugs is null)
    or
    (tipo = 'eleccion' and slug is null and hueco_id is not null and etiqueta is not null
       and requiere_foto = false and rotulo is null
       and ((seccion is not null) <> (slugs is not null)))
  ),
  unique (producto_id, orden),
  unique (producto_id, hueco_id)
);
create index if not exists pack_piezas_por_pack on pack_piezas (producto_id, orden);
