-- Devoluciones hechas desde Stripe (9-10-2026). El pedido sigue `pagado`:
-- se apunta cuánto se ha devuelto y cuándo, y el panel lo enseña como
-- «Devuelto» o «Devuelto en parte». Lo escribe el webhook con el evento
-- `charge.refunded`; el Resumen lo resta de la recaudación.
alter table pedidos
  add column if not exists devuelto_cents integer not null default 0
    check (devuelto_cents >= 0),
  add column if not exists devuelto_en timestamptz;
