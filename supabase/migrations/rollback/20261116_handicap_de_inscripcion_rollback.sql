-- ROLLBACK de 20261116120000_handicap_de_inscripcion.sql: quita la RPC de edición, la función del backfill y la
-- columna ronda_libre_jugadores.handicap_de_inscripcion (con ella se van su GRANT y el valor del backfill; ningún
-- handicap cambia, la migración no tocó valores).
--
-- ANTES de correrlo: el código que lee la columna (PR B) o llama la RPC (PR C) tiene que estar fuera de prod, o esas
-- vistas caen con 42703 / la edición con 42883.
--
-- Vive en rollback/ para que el CLI de Supabase NUNCA lo tome como migración.
DROP FUNCTION IF EXISTS public.editar_handicap_inscrito(uuid, numeric, numeric, boolean, numeric, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.backfill_handicap_de_inscripcion();
ALTER TABLE public.ronda_libre_jugadores DROP COLUMN IF EXISTS handicap_de_inscripcion;
