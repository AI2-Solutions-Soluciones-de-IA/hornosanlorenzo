-- Avisos de cupo de correo (11-11-2026). Resend no avisa cuando una cuenta
-- se acerca al límite del plan gratuito (100 al día, 3.000 al mes): la web
-- lo lee de las cabeceras de cada envío y avisa ella. Una fila por aviso
-- mandado («dia:2026-11-12», «mes:2026-11») para que salga una sola vez,
-- aunque varios envíos pasen el umbral a la vez.
create table if not exists avisos_cupo_correo (
  clave      text primary key,
  enviado_en timestamptz not null default now()
);
