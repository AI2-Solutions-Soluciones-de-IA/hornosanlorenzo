-- TPV de las oficinas (13-11-2026): los pedidos que se toman por teléfono
-- entran por `/tpv` y no por la web. `origen` los distingue en el panel y
-- en el Excel; `registrado_por` es quién lo apuntó (nombre de la cuenta).
-- Los de la web, todos los de hasta hoy incluidos, son 'web'.
alter table pedidos
  add column if not exists origen text not null default 'web',
  add column if not exists registrado_por text;

alter table pedidos drop constraint if exists pedidos_origen_check;
alter table pedidos
  add constraint pedidos_origen_check check (origen in ('web', 'tpv'));
