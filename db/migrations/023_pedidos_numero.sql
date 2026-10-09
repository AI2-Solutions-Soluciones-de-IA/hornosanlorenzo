-- Número de pedido correlativo para el panel (9-10-2026): «Pedido nº 14».
-- Se asigna cuando el pedido entra de verdad en la lista (pagado o por
-- cobrar), no al empezar el pago: así los carritos abandonados no dejan
-- huecos. Los que ya había se numeran por orden de entrada.
alter table pedidos add column if not exists numero integer unique;

create sequence if not exists pedidos_numero_seq;

update pedidos p
   set numero = o.n
  from (select id, row_number() over (order by created_at, id) as n
          from pedidos
         where estado in ('pagado', 'sin_pago') and numero is null) o
 where o.id = p.id;

select setval('pedidos_numero_seq', coalesce((select max(numero) from pedidos), 0) + 1, false);

create or replace function pedidos_asigna_numero() returns trigger as $$
begin
  if new.numero is null and new.estado in ('pagado', 'sin_pago') then
    new.numero := nextval('pedidos_numero_seq');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists pedidos_numero on pedidos;
create trigger pedidos_numero
  before insert or update of estado on pedidos
  for each row execute function pedidos_asigna_numero();
