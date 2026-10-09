-- Desde qué aparato se hizo el pedido, para el Resumen del panel (9-10-2026).
-- Se apunta al crear el pedido (`~/lib/dispositivo.ts`); los de antes quedan
-- en null y el Resumen los cuenta como «sin dato».
alter table pedidos
  add column if not exists dispositivo text
    check (dispositivo is null or dispositivo in ('movil', 'tablet', 'ordenador'));
