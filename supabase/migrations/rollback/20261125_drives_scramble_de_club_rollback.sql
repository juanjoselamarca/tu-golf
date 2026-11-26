-- Rollback de 20261125200000_drives_scramble_de_club. Solo si la migración rompe algo.
-- Borra los drives anotados (son un registro aparte: no tocan scores, hándicap ni historial).
-- ANTES: el código que lee drive_jugadores / drives / drives_minimo tiene que estar fuera de prod (una lectura de una
-- columna que no existe hace fallar la vista en vivo y el scorer).
-- Todo o nada. Orden: primero la RPC y el trigger, al final las columnas.

BEGIN;

DROP FUNCTION IF EXISTS public.marcar_drive_equipo(uuid, text, integer, smallint);

DROP TRIGGER IF EXISTS ronda_equipos_drives_solo_por_rpc ON public.ronda_equipos;
DROP FUNCTION IF EXISTS public.ronda_equipos_drives_solo_por_rpc();

ALTER TABLE public.ronda_equipos DROP CONSTRAINT IF EXISTS ronda_equipos_drive_jugadores_check;
ALTER TABLE public.ronda_equipos DROP CONSTRAINT IF EXISTS ronda_equipos_drives_check;
ALTER TABLE public.rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_drives_minimo_check;

ALTER TABLE public.ronda_equipos DROP COLUMN IF EXISTS drive_jugadores, DROP COLUMN IF EXISTS drives;
ALTER TABLE public.rondas_libres DROP COLUMN IF EXISTS drives_minimo;

COMMIT;
