-- Drop del modelo MUERTO `tournament_teams` / `tournament_team_members`.
--
-- Contexto: la migración 20260525_tournament_teams.sql creó estas tablas para
-- materializar equipos a nivel torneo (plan wizard-equipos del 24-may). Ese plan
-- fue SUPERADO por la decisión PM 2026-06-02 "el grupo de salida ES el equipo":
-- los equipos viven en `tournament_groups` → se materializan en `ronda_equipos`
-- al iniciar el torneo, y el leaderboard (`fetchScrambleTeams`/`fetchBestBallTeams`)
-- lee de ahí. Ver PRs #89/#94/#98.
--
-- Estado al borrar (verificado 2026-06-07): 0 filas en ambas tablas, 0 referencias
-- en código (data layer `teams.ts` + tipos + tests eliminados en el mismo PR).
-- Mantenerlas era una trampa: invitan a construir asignación de equipos sobre el
-- modelo equivocado (lo que casi pasó al retomar el plan).
--
-- members primero por la FK team_id → tournament_teams.

DROP TABLE IF EXISTS public.tournament_team_members;
DROP TABLE IF EXISTS public.tournament_teams;
