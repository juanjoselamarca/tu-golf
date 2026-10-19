-- Handicap de juego por torneo: % del course handicap con que juega cada jugador (plan hcp-pct-torneo).
-- SOLO schema, aditivo.
--
-- Va en un PR propio, ANTES del código que la lee: Vercel publica el código al mergear, pero esta
-- migración se aplica después (workflow migraciones-prod, con aprobación). Los SELECT de los scorers,
-- el board, /en-vivo, /tv y el GWI piden hcp_pct: si el código llegara primero fallarían en prod
-- durante el intervalo (PostgREST 42703, columna inexistente) — docs/CONVENCIONES_TECNICAS.md.
--
-- tournaments.hcp_pct: porcentaje del course handicap (WHS Regla 6.2a, Playing Handicap). El
-- organizador elige 100/95/90/85/80/75 en el wizard; la app valida las opciones exactas
-- (src/golf/core/playing-handicap.ts). El CHECK solo acota el rango para no exigir una migración si se
-- suma una opción. DEFAULT 100 = todos los torneos existentes quedan exactamente como estaban.
-- Formatos de equipo (team_config.handicap_pct) y modo gross lo ignoran (hcpPctEfectivo → 100).
--
-- Rollback: supabase/migrations/rollback/20261020_tournaments_hcp_pct_rollback.sql

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS hcp_pct smallint NOT NULL DEFAULT 100
  CONSTRAINT tournaments_hcp_pct_check CHECK (hcp_pct BETWEEN 50 AND 100);

COMMENT ON COLUMN public.tournaments.hcp_pct IS
  'Handicap de juego del torneo: % del course handicap (WHS 6.2a). 100 = completo. Ignorado en formatos de equipo y en gross.';
