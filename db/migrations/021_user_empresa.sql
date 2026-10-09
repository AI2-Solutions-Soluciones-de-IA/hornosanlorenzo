-- Alta de empresa con cuenta propia, igual que la de particular (9-10-2026):
-- la cuenta guarda además la razón social y el CIF. Los dos van juntos o
-- ninguno (lo comprueba `preparaAltaUsuario`); una cuenta de particular los
-- deja vacíos.
alter table "user"
  add column if not exists empresa text,
  add column if not exists cif text;
