-- Fotos de más de una ficha, para el carrusel de la ficha. La principal
-- sigue en `image_*`: es la de las tarjetas, los packs y el JSON-LD, y así
-- nada de eso cambia. Aquí van las siguientes, en orden, cada una con
-- `{ url, alt, ancho, alto }` — las medidas por lo mismo que `image_width`
-- e `image_height`: `<Image>` con una URL remota las necesita.
alter table productos
  add column if not exists fotos_extra jsonb not null default '[]'::jsonb;
