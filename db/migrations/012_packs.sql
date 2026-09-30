-- Packs (septiembre de 2026). Un pack es un producto más; lo que lleva
-- dentro vive en `src/data/packs.ts`. La línea del pedido guarda el
-- desglose ya resuelto —qué empanada, qué plancha— porque es lo que hay
-- que hornear, y la definición en código puede cambiar después.
--   detalle: [{ slug, nombre, varianteLabel, qty }] por unidad de pack.
alter table lineas_pedido add column if not exists detalle jsonb;
-- La foto que sube el cliente (Pack Cumpleaños). URL de Vercel Blob.
alter table lineas_pedido add column if not exists foto_url text;

-- Límite de subidas públicas por IP. Una fila por IP y ventana.
create table if not exists limite_subidas (
  clave        text primary key,
  ventana      timestamptz not null,
  cuenta       integer not null
);
