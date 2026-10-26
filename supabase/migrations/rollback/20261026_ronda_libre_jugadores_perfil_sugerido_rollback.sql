-- Rollback de 20261026120000_ronda_libre_jugadores_perfil_sugerido.sql.
-- Correr SOLO después de revertir el código que escribe ronda_libre_jugadores.perfil_sugerido_id
-- (POST /api/ronda-libre/create): si no, el INSERT de jugadores falla con 42703 y no se puede crear
-- ninguna ronda libre con un rival elegido de la lista.
-- Pierde: qué perfil eligió el creador para cada rival (no afecta puntajes, permisos ni índices). Revisar antes con
--   SELECT count(*) FROM public.ronda_libre_jugadores WHERE perfil_sugerido_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_ronda_libre_jugadores_perfil_sugerido_id;
ALTER TABLE public.ronda_libre_jugadores DROP COLUMN IF EXISTS perfil_sugerido_id;
