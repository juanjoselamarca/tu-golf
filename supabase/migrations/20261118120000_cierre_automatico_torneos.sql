-- Cierre automático de torneos con aviso previo al organizador (PR1, base).
--
-- Por qué: `tournaments.status` solo cambia cuando el organizador aprieta "Cerrar". Si se olvida, la vista ya lo
-- muestra finalizado (`estadoDelTorneo`), pero las rondas nunca entran al historial ni al índice. El cron de PR2
-- avisará al organizador un día antes y cerrará el torneo de verdad con `closeTournament`. Esta migración solo
-- agrega lo que ese cron necesita; no cierra nada.
--
-- tournaments:
--   · aviso_cierre_enviado_at: cuándo se avisó "se cierra mañana". Un aviso de antes de mover la fecha no vale
--     (el motor lo compara con el día de cierre vigente).
--   · cerrado_automaticamente_at: el cierre lo hizo el cron, no el organizador (para decírselo en la UI). Reabrir
--     el torneo (`reopenTournament`) limpia ambas marcas.
--   · cierre_automatico: interruptor por torneo. Default true (solo hacia adelante).
-- ronda_libre_jugadores.updated_at y ronda_equipos.updated_at + trigger: las tarjetas de equipos guardan los golpes
--   en `scores` (JSONB) sin fecha, por jugador (best ball, ronda libre) o por equipo (bola compartida:
--   `upsert_ronda_equipos_scores` escribe ronda_equipos.scores). Sin estas columnas el cron no sabría si alguien
--   sigue anotando y podría cerrar con un capitán corrigiendo. La actividad del torneo = el máximo de
--   hole_scores.updated_at y estas dos. Las filas existentes quedan con now(): las primeras 24 h tras aplicar, el
--   cron aplaza (lado seguro).
--
-- Permisos: sin policies nuevas ("Organizador edita torneos" ya limita la escritura). tournaments tiene SELECT de
-- tabla para anon (ANON_TABLE_PRIVILEGES) y las columnas nuevas no son sensibles. ronda_libre_jugadores tiene SELECT
-- por columna para anon y authenticated (ANON_COLUMN_SELECT): updated_at NO se agrega al grant; solo la lee el cron
-- con service_role. ronda_equipos: anon lee por columna (ANON_COLUMN_SELECT, sin updated_at) y authenticated tiene
-- SELECT de tabla (la columna no es sensible: cuándo se anotó por última vez).
--
-- Decisión de producto (Juanjo, 17-nov-2026): los torneos ya vencidos al salir quedan EXCLUIDOS. Se marcan con
-- cierre_automatico = false los que aceptan scores y cuya última fecha (date_end ?? date_start; con fechas
-- invertidas, date_start, igual que `rangoDelTorneo`) es anterior a hoy − 3 en Chile. Medido el 17-nov: 8 torneos
-- (7 demo y "Copa cabros", abril).
--
-- Rollback: supabase/migrations/rollback/20261118_cierre_automatico_torneos_rollback.sql

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS aviso_cierre_enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS cerrado_automaticamente_at timestamptz,
  ADD COLUMN IF NOT EXISTS cierre_automatico boolean NOT NULL DEFAULT true;

ALTER TABLE public.ronda_libre_jugadores
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Privada para el cliente a propósito (sin GRANT SELECT): el REVOKE es no-op en Postgres, pero deja dicho que la
-- falta del grant es intencional (lo exige canary-column-select).
REVOKE SELECT (updated_at) ON public.ronda_libre_jugadores FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS update_ronda_libre_jugadores_updated_at ON public.ronda_libre_jugadores;
CREATE TRIGGER update_ronda_libre_jugadores_updated_at
  BEFORE UPDATE ON public.ronda_libre_jugadores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.ronda_equipos
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DROP TRIGGER IF EXISTS update_ronda_equipos_updated_at ON public.ronda_equipos;
CREATE TRIGGER update_ronda_equipos_updated_at
  BEFORE UPDATE ON public.ronda_equipos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

UPDATE public.tournaments
SET cierre_automatico = false
WHERE status IN ('in_progress', 'active')
  AND greatest(date_start, coalesce(date_end, date_start)) < (now() AT TIME ZONE 'America/Santiago')::date - 3;
