-- Trazas de alérgenos (5-11-2026): lo que el obrador declara como «puede
-- contener» además de lo que el producto lleva (`allergens`). Mismos ids
-- que `allergens` (src/data/alergenos.ts).
alter table productos add column if not exists trazas text[] not null default '{}';
