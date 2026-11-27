-- Rollback de 20261127150000_terminar_equipo_de_ronda. Solo si la migración rompe algo.
-- ANTES: el código que lee terminado_at o llama a terminar/reabrir_equipo_de_ronda tiene que estar fuera de prod
-- (una lectura de una columna que no existe hace fallar la vista en vivo y el scorer).
-- Las rondas que quedaron 'finalizada' por el último «terminar» siguen finalizadas (es el mismo estado de siempre).
-- Todo o nada. Orden: primero RPC y trigger, al final la columna.

BEGIN;

DROP TRIGGER IF EXISTS ronda_equipos_terminado_guard ON public.ronda_equipos;
DROP FUNCTION IF EXISTS public.ronda_equipos_terminado_guard();

DROP FUNCTION IF EXISTS public.terminar_equipo_de_ronda(text, uuid);
DROP FUNCTION IF EXISTS public.reabrir_equipo_de_ronda(text, uuid);
DROP FUNCTION IF EXISTS public.ronda_libre_tarjeta_completa(jsonb, integer);

ALTER TABLE public.ronda_equipos DROP COLUMN IF EXISTS terminado_at;

COMMIT;
