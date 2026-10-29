-- Rollback de 20261027180000_timba_libre_datos.sql.
-- ⚠️ Borra las marcas de puntos especiales y los retiros de las Timbas. Antes de correrlo, toda ronda
-- 'personalizado' (rondas_libres e historical_rounds) tiene que pasar a otro formato, o el CHECK no se puede
-- restaurar.

DROP FUNCTION IF EXISTS public.marcar_retiro_ronda_libre(text, uuid, integer, bigint, uuid);
DROP FUNCTION IF EXISTS public.marcar_puntito_ronda_libre(text, uuid, integer, text, boolean, bigint, uuid);
DROP FUNCTION IF EXISTS public.timba_registrar_secuencia(uuid, text, bigint, uuid);
DROP FUNCTION IF EXISTS public.timba_ronda_para_escribir(text, uuid);

DROP TABLE IF EXISTS public.ronda_libre_juego_orden;
DROP TABLE IF EXISTS public.ronda_libre_retiros;
DROP TABLE IF EXISTS public.ronda_libre_puntitos;

DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_update" ON public.rondas_libres;
DROP POLICY IF EXISTS "rondas_libres_personalizado_solo_admin_insert" ON public.rondas_libres;
DROP FUNCTION IF EXISTS public.usuario_es_admin();

ALTER TABLE public.rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_reglas_juego_check;
ALTER TABLE public.rondas_libres DROP COLUMN IF EXISTS reglas_juego;

ALTER TABLE public.historical_rounds DROP CONSTRAINT IF EXISTS historical_rounds_formato_check;
ALTER TABLE public.historical_rounds ADD CONSTRAINT historical_rounds_formato_check CHECK (formato_juego = ANY (ARRAY[
  'stroke_play'::text, 'stableford'::text, 'match_play'::text, 'best_ball'::text, 'scramble'::text, 'foursome'::text]));

ALTER TABLE public.rondas_libres DROP CONSTRAINT IF EXISTS rondas_libres_formato_juego_check;
ALTER TABLE public.rondas_libres ADD CONSTRAINT rondas_libres_formato_juego_check CHECK (formato_juego = ANY (ARRAY[
  'stroke_play'::text, 'stableford'::text, 'match_play'::text, 'best_ball'::text, 'scramble'::text, 'foursome'::text]));
