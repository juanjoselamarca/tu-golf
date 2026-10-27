-- Rollback de 20261019200000_fedegolf_1b_avisos_y_rate_limit.sql.
-- Correr SOLO después de revertir el código que usa estas columnas/función (si no, sus SELECT fallan).
-- Pierde: preferencias "Cambios en tu índice" elegidas, marcas "sin índice desde" y conteos de rate limit
-- (todos reconstruibles: default true, el cron vuelve a marcar, los conteos son ventanas cortas).

DROP FUNCTION IF EXISTS public.rate_limit_hit(text, integer, integer);
DROP TABLE IF EXISTS public.rate_limit_hits;
ALTER TABLE public.fedegolf_credentials DROP COLUMN IF EXISTS sin_indice_desde;
ALTER TABLE public.notification_preferences DROP COLUMN IF EXISTS indice_cambios;
