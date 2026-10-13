-- Reserva de hueco en la capacidad del día (13-10-2026). Un pedido 'iniciado'
-- ocupa sitio mientras el cliente paga, hasta `reserva_hasta`; pasada esa
-- hora, o si vuelve al carrito desde Stripe (se pone a null), deja de contar.
-- Nulo en lo anterior a esta migración y en lo que no pasa por Stripe.
alter table pedidos add column if not exists reserva_hasta timestamptz;

create index if not exists pedidos_por_fecha_entrega on pedidos (fecha_entrega);
