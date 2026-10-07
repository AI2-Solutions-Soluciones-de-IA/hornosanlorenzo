-- Precio de oferta en las secciones de «Este mes», igual que en las noticias
-- (016): cada producto de la sección puede llevar su precio rebajado (uno, o
-- uno por tamaño) y la sección, una fecha de fin. Mientras esté publicada y
-- la fecha no haya pasado, el precio vale en toda la web y en el cobro: ver
-- `~/lib/db/ofertas.ts`.
alter table secciones_este_mes_productos
  add column if not exists oferta_cents integer
    check (oferta_cents is null or oferta_cents > 0),
  add column if not exists oferta_variantes jsonb not null default '{}'::jsonb;

alter table secciones_este_mes
  add column if not exists oferta_hasta date;
