-- Hándicap de equipo que PUNTÚA, en la escala de los hoyos de la ronda (plan hcp-equipos, PR-0).
-- SOLO schema, aditivo.
--
-- Va en un PR propio, ANTES del código que la lee y escribe: Vercel publica el código al mergear, pero
-- esta migración se aplica después (workflow migraciones-prod, con aprobación). Si el código llegara
-- primero, los SELECT/INSERT de ronda_equipos fallarían (PostgREST 42703) — docs/CONVENCIONES_TECNICAS.md.
--
-- ronda_equipos.handicap_equipo sigue siendo el hándicap COMPLETO del equipo (escala 18 hoyos), el que
-- se muestra. Para un equipo que juega 9 hoyos, partir ese número por la mitad no es lo mismo que la
-- fórmula WHS sobre los course handicap de 9 hoyos de cada jugador (puede diferir en un golpe), así que
-- el número con que se reparten los golpes se guarda aparte, igual que el handicap de juego individual
-- (courseHcpMap / courseHcpCompletoMap).
--
-- NULL = fila anterior a esta columna (o best ball, que no tiene hándicap de equipo): el motor sigue
-- partiendo el completo como hasta hoy, así que los torneos en curso no cambian.
--
-- Rollback: supabase/migrations/rollback/20261024_ronda_equipos_handicap_equipo_juego_rollback.sql

ALTER TABLE public.ronda_equipos
  ADD COLUMN IF NOT EXISTS handicap_equipo_juego smallint NULL;

COMMENT ON COLUMN public.ronda_equipos.handicap_equipo_juego IS
  'Hándicap del equipo que puntúa, en la escala de los hoyos de la ronda (WHS Apéndice C sobre los course handicap sin redondear). NULL = fila anterior: se usa handicap_equipo partido según los hoyos.';
