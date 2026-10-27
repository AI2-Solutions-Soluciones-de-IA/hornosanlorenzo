-- Solo rebajan las secciones de Este mes marcadas con descuento, como «10% de
-- descuento» (27-10-2026). El resto («Dulces para compartir», «Novedades»…)
-- son recomendaciones que rotan cada mes y van al precio de siempre: se les
-- habían puesto ofertas por error desde el panel. Las que ya tienen alguna
-- oferta se marcan, para que nada cambie al aplicar esta migración.
alter table secciones_este_mes
  add column if not exists con_descuento boolean not null default false;

update secciones_este_mes s
   set con_descuento = true
 where exists (
   select 1 from secciones_este_mes_productos sp
    where sp.seccion_id = s.id
      and (sp.oferta_cents is not null or sp.oferta_variantes <> '{}'::jsonb)
 );
