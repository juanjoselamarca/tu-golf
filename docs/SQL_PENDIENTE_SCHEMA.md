-- PENDIENTE: ejecutar en Supabase SQL Editor

-- 1. Renombrar handicap → indice (si no existe ya como indice)
-- Verificar primero: SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name IN ('handicap','indice');
-- Si solo existe handicap:
-- ALTER TABLE profiles RENAME COLUMN handicap TO indice;
-- Si coexisten ambas y indice ya tiene datos:
-- ALTER TABLE profiles DROP COLUMN handicap;
