-- Rollback de 20261024000000_ronda_equipos_handicap_equipo_juego.sql.
-- Correr SOLO después de revertir el código que lee/escribe ronda_equipos.handicap_equipo_juego (si no,
-- sus SELECT/INSERT fallan con 42703 y los scorers y boards de equipos quedan caídos).
-- Pierde: el hándicap de juego de los equipos; esas filas vuelven a partir handicap_equipo (puede diferir
-- en un golpe en 9 hoyos). Revisar antes con
--   SELECT id, ronda_id, handicap_equipo, handicap_equipo_juego FROM public.ronda_equipos WHERE handicap_equipo_juego IS NOT NULL;

ALTER TABLE public.ronda_equipos DROP COLUMN IF EXISTS handicap_equipo_juego;

COMMENT ON COLUMN public.tournaments.hcp_pct IS
  'Handicap de juego del torneo: % del course handicap (WHS 6.2a). 100 = completo. Ignorado en formatos de equipo y en gross.';
