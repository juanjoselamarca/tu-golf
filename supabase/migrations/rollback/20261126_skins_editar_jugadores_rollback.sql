-- Rollback de 20261126100000_skins_editar_jugadores. Solo si la migración rompe algo.
-- Borra la función: PUT /api/ronda-libre/[codigo]/skins/jugadores empieza a responder 503 (la edición se cae, el
-- Skins sigue jugándose). No toca datos: las ediciones ya hechas quedan como están.
BEGIN;
DROP FUNCTION IF EXISTS public.editar_jugadores_skins(uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.skins_ronda_empezada(uuid);
COMMIT;
