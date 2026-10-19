-- Rollback de 20261020000000_tournaments_hcp_pct.sql.
-- Correr SOLO después de revertir el código que lee/escribe tournaments.hcp_pct (si no, sus SELECT fallan
-- con 42703 y el board/scorers de torneo quedan caídos).
-- Pierde: el % elegido por cada organizador. Los torneos con hcp_pct <> 100 pasan a jugarse al 100 %:
-- revisar antes con  SELECT id, name, hcp_pct FROM public.tournaments WHERE hcp_pct <> 100;

ALTER TABLE public.tournaments DROP COLUMN IF EXISTS hcp_pct;
