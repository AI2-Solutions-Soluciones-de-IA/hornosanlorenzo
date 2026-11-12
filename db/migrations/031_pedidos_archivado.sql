-- «Archivar» en el panel de pedidos (12-11-2026): saca el pedido de la
-- lista normal sin borrarlo ni anularlo (la hoja de producción y el aforo lo
-- siguen contando). Quién y cuándo, como «Procesado». Nulo: sin archivar.
alter table pedidos
  add column if not exists archivado_en  timestamptz,
  add column if not exists archivado_por text;
