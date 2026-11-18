-- Rollback de 20261121100000_orden_guardados_hole_scores.sql: se borra la función y el orden guardado por dispositivo.
-- No hace falta revertir el código antes: /api/game cae al upsert de antes cuando guardar_hole_score no existe
-- (PGRST202 / 42883). Lo único que se pierde es el orden: vuelve a ganar el guardado que llega último.

DROP FUNCTION IF EXISTS public.guardar_hole_score(jsonb, bigint, uuid);
DROP TABLE IF EXISTS public.hole_scores_orden;

NOTIFY pgrst, 'reload schema';
