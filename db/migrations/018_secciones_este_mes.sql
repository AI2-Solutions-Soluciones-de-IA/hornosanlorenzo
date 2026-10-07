-- Secciones de «Este mes» que escribe el obrador desde el panel, debajo de
-- las ofertas: «Productos nuevos sin gluten», «Para Halloween»… Cada una es
-- un título, una frase opcional y productos de la carta, en el orden que se
-- elija. Los productos no se copian: se leen de su ficha, así que un precio
-- cambiado o un agotado se ve al momento.
create table if not exists secciones_este_mes (
  id          uuid primary key default gen_random_uuid(),
  titulo      text not null,
  descripcion text not null default '',
  orden       integer not null default 0,
  publicada   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Borrar una ficha de la carta la quita de la sección, sin romperla.
create table if not exists secciones_este_mes_productos (
  seccion_id  uuid not null references secciones_este_mes(id) on delete cascade,
  producto_id uuid not null references productos(id) on delete cascade,
  orden       integer not null default 0,
  primary key (seccion_id, producto_id)
);
