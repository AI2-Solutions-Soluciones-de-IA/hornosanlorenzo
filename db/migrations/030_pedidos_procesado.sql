-- «Procesado» en el panel de pedidos (11-11-2026): la oficina marca el
-- pedido cuando ya lo ha pasado al obrador. Quién y cuándo, para que otra
-- persona de la oficina sepa que no tiene que volver a hacerlo. Nulo: sin
-- procesar.
alter table pedidos
  add column if not exists procesado_en  timestamptz,
  add column if not exists procesado_por text;
