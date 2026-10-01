-- La foto principal no es de este producto sino de uno parecido, puesta
-- mientras llega la suya. Solo lo ve el panel: sirve para saber qué fotos
-- faltan por hacer. Ver `PARECIDAS` en `scripts/fotos-finales-web.mjs`.
alter table productos
  add column if not exists foto_provisional boolean not null default false;
