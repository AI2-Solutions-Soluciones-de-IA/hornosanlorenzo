-- Precio de oferta de «Este mes». Una noticia que enlaza un producto puede
-- rebajarlo mientras esté publicada y hasta `oferta_hasta` (incluido; sin
-- fecha, mientras siga publicada). El precio rebajado vale en toda la web y
-- en el cobro: ver `~/lib/ofertas.ts`.
--
-- Un producto sin tamaños usa `oferta_cents`; uno con tamaños, un precio
-- por tamaño en `oferta_variantes` (`{ "<variant_id>": <céntimos> }`), y
-- los tamaños que no salen ahí se venden al precio de siempre.
alter table noticias
  add column if not exists oferta_cents integer
    check (oferta_cents is null or oferta_cents > 0),
  add column if not exists oferta_variantes jsonb not null default '{}'::jsonb,
  add column if not exists oferta_hasta date;
