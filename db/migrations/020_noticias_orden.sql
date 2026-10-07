-- Orden de las noticias, elegido en el panel (arrastrando o con las flechas).
-- Menor sale antes. Las que ya había conservan el orden que tenían (por
-- fecha, la más reciente primero); una nueva entra la primera.
alter table noticias add column if not exists orden integer not null default 0;

update noticias n
   set orden = o.pos
  from (select id, row_number() over (order by fecha desc, created_at desc) - 1 as pos
          from noticias) o
 where o.id = n.id;
