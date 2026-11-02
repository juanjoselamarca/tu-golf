-- El jugador no edita su propia fila del scorer. Cierra en ronda libre el mismo hueco que 20261019120000 cerró en
-- players, rounds y hole_scores: ahí se sacaron las policies "Jugador gestiona ronda" / "Jugador carga scores" /
-- "Jugador edita scores" porque dejaban saltarse /api/game con la anon key. En ronda_libre_jugadores quedó viva la
-- equivalente, `jugador_update_scores` (FOR UPDATE, USING user_id = auth.uid() OR creador de la ronda).
--
-- Por qué importa: `startTournament` materializa una fila de ronda_libre_jugadores por jugador del torneo CON su
-- user_id (src/lib/data/tournaments/startTournament.ts:370), y el creador de esa ronda es el organizador. Con esa
-- policy, cualquier inscrito podía hacer PATCH directo de SU fila con la anon key + su JWT y escribir:
--   · `handicap`  -> cambia su neto en el leaderboard del torneo (/api/torneo/[slug]/live lo lee de esta tabla);
--   · `scores`    -> su tarjeta completa, sin pasar por las validaciones de /api/game (torneo activo, jugador no
--                    retirado, rango del score) ni por el seq/dispositivo de `upsert_ronda_libre_scores`;
--   · `ronda_id`  -> se mete en CUALQUIER otra ronda libre. El WITH CHECK de una policy FOR UPDATE sin WITH CHECK
--                    es su propio USING, y `user_id = auth.uid()` sigue cierto después de cambiar la ronda, así que
--                    la fila entra a una ronda ajena sin ser su creador (la policy de INSERT, `gestionar_jugadores`,
--                    sí exige ser el creador: el UPDATE la rodeaba).
-- Al 30-oct-2026 en prod: 167 filas con cuenta, 16 con user_id distinto del creador (12 de torneo, del evento del
-- 29-ago), 0 en curso. Cada torneo que arranca vuelve a crear una fila PATCHeable por jugador.
--
-- Por qué no rompe nada: ninguna escritura del código usa esta policy. Toda escritura de la tabla va por
-- `upsert_ronda_libre_scores`, `finalizar_ronda_libre` y `eliminar_cuenta` (SECURITY DEFINER), por service role
-- (/api/game, /api/torneos/[slug]/start, /api/admin/*) o por el INSERT del creador en /api/ronda-libre/create, que
-- se apoya en `gestionar_jugadores` (FOR ALL, creador de la ronda) y queda intacto. `merge_ronda_player_scores` es
-- la única SECURITY INVOKER que escribe la tabla y solo la ejecutan service_role y postgres.
-- Lo exige en el repo canary-ronda-libre-no-direct-writes y acá scripts/ci/pruebas-sql/scorer-escritura-jugador.sql.
--
-- rounds y hole_scores: desde 20261019120000 no les queda NINGUNA policy de escritura (solo "Scores visibles" /
-- "Rondas visibles", FOR SELECT USING true), así que los grants de INSERT/UPDATE/DELETE de authenticated ya no
-- autorizan nada — RLS los rechaza igual. Se sacan para que el permiso diga la verdad: toda escritura es service
-- role (/api/game, startTournament, /api/admin/*). SELECT se queda: el leaderboard lo lee con la sesión.
--
-- Idempotente. Rollback: supabase/migrations/rollback/20261030_jugador_no_edita_su_fila_del_scorer_rollback.sql

DROP POLICY IF EXISTS "jugador_update_scores" ON public.ronda_libre_jugadores;

REVOKE INSERT, UPDATE, DELETE ON public.rounds FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.hole_scores FROM authenticated;
