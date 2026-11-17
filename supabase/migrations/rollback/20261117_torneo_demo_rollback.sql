-- Rollback de 20261117200100_torneo_demo.sql: borra el torneo demo nuevo (id fijo) y, en cascada, sus jugadores,
-- grupos, rondas y golpes. Solo datos ficticios: ningún jugador tiene cuenta. Corre como postgres (las guardas de
-- grupos fijos solo cortan a anon/authenticated). Después se puede restaurar el demo viejo desde el respaldo (ver
-- 20261117_borrar_torneos_de_prueba_rollback.sql).
DELETE FROM public.tournaments WHERE id = '00000000-0000-4000-8000-00000d000000' AND es_demo = true;
