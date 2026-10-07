-- Suscripciones a las ofertas de «Este mes». Alta directa desde /noticias
-- (sin doble confirmación, decisión del 7-10-2026) con casilla de
-- consentimiento. `token` es el de la baja: va en el enlace de cada correo
-- y no se puede adivinar. Una baja no borra la fila: queda `baja_en`, para
-- no volver a escribir a quien se fue y poder demostrar cuándo lo pidió.
create table if not exists suscriptores (
  id        uuid primary key default gen_random_uuid(),
  email     text not null,
  token     text not null unique,
  creado_en timestamptz not null default now(),
  baja_en   timestamptz
);

-- Un correo, una fila, sin importar mayúsculas.
create unique index if not exists suscriptores_email on suscriptores (lower(email));

-- Cuándo se mandó una noticia a los suscritos: se envía una sola vez.
alter table noticias add column if not exists enviada_en timestamptz;
