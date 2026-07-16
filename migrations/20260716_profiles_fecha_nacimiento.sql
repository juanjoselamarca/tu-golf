-- Agrega fecha_nacimiento al perfil, poblada desde FedeGolf al vincular
-- (getUserByRut, fill-if-null). Habilita edad → tees senior / segmentación.
-- Nullable: la mayoría de los usuarios no tienen cuenta FedeGolf vinculada.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS fecha_nacimiento date;

COMMENT ON COLUMN profiles.fecha_nacimiento IS
  'Fecha de nacimiento (ISO). Origen: FedeGolf getUserByRut al vincular. Nullable.';
