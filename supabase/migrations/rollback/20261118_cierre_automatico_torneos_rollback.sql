-- Rollback de 20261118120000_cierre_automatico_torneos.sql. Antes, revertir el código que lee estas columnas
-- (closeTournament/reopenTournament y el cron de cierre): un SELECT o UPDATE con una columna que no existe falla.
-- Se pierden las marcas de aviso y de cierre automático (no cambia el status de ningún torneo).

DROP TRIGGER IF EXISTS update_ronda_libre_jugadores_updated_at ON public.ronda_libre_jugadores;
ALTER TABLE public.ronda_libre_jugadores DROP COLUMN IF EXISTS updated_at;

ALTER TABLE public.tournaments
  DROP COLUMN IF EXISTS aviso_cierre_enviado_at,
  DROP COLUMN IF EXISTS cerrado_automaticamente_at,
  DROP COLUMN IF EXISTS cierre_automatico;
