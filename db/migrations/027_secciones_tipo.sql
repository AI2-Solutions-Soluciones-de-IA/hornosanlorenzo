-- Cada sección de Este mes es una promoción, una sugerencia o una novedad
-- (3-11-2026), y la página las enseña agrupadas en ese orden. Las que ya
-- llevan descuento pasan a promoción, «Novedades» a novedad y el resto
-- («Dulces para compartir»…) a sugerencia.
alter table secciones_este_mes
  add column if not exists tipo text not null default 'sugerencia'
    check (tipo in ('promocion', 'sugerencia', 'novedad'));

update secciones_este_mes set tipo = 'promocion' where con_descuento;
update secciones_este_mes set tipo = 'novedad'
 where not con_descuento and titulo ilike 'novedad%';
