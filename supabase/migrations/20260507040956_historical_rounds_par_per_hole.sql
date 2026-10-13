-- Migración 038: añadir columna par_per_hole a historical_rounds
--
-- Contexto: importadores Garmin/screenshot guardan el par real por hoyo
-- (Record<string,number>) cuando lo conocen, en lugar de asumir par 4.
-- /perfil/historial, /perfil/stats y src/golf/core/compare lo leen.
--
-- Sin esta columna, la query SELECT de /perfil/historial fallaba con
-- "column does not exist" y la página mostraba "No se pudieron cargar
-- las tarjetas" en producción.
--
-- Tipo JSONB (no JSON) para soportar índices y operadores @>, ->, ->>
-- en consultas futuras. Nullable: rondas existentes no tienen par real
-- por hoyo registrado y conservan el comportamiento actual (par 4 default).

ALTER TABLE public.historical_rounds
  ADD COLUMN IF NOT EXISTS par_per_hole JSONB DEFAULT NULL;

COMMENT ON COLUMN public.historical_rounds.par_per_hole IS
  'Par real por hoyo cuando se conoce (e.g. desde Garmin ZIP o screenshot). '
  'Formato: {"1": 4, "2": 5, ...}. NULL si no se importó dato real (asumir par 4).';
