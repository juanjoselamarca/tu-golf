-- Torneos: el JUGADOR ya no puede escribir directo (PostgREST) en players / rounds /
-- hole_scores. 09-oct-2026. Subconjunto acotado de la fase F3 del ítem 7
-- (docs/superpowers/plans/2026-10-02-plan-9-fixes.md): sólo estas 4 políticas.
--
-- ESTADO DE PROD ANTES DE APLICAR (medido 09-oct con SELECT de sólo lectura):
--   * authenticated tiene INSERT/UPDATE/DELETE en las 3 tablas
--     (has_table_privilege = true), así que las políticas son la única barrera.
--   * Políticas de escritura del jugador (roles {public}):
--       players     INSERT "Jugador se inscribe"   WITH CHECK (auth.uid() = user_id)
--       rounds      ALL    "Jugador gestiona ronda" USING (su propia tarjeta)
--       hole_scores INSERT "Jugador carga scores"   WITH CHECK (su propia tarjeta)
--       hole_scores UPDATE "Jugador edita scores"   USING (status no confirmed/corrected
--                                                          y su propia tarjeta)
--   * Lectura: "Inscripciones visibles" / "Rondas visibles" / "Scores visibles"
--     (SELECT, USING true) — NO se tocan, la lectura queda igual.
--
-- EL HUECO: con su sesión y la anon key, un jugador podía, sin pasar por la API:
--   - inscribirse en CUALQUIER torneo (cerrado, en juego, lleno) con el
--     handicap_at_registration y el status que quisiera (se salta cupo, gate de
--     estado y el guard de índice de /api/torneos/[slug]/inscribirse);
--   - reabrir o BORRAR su tarjeta (rounds ALL incluye DELETE);
--   - cambiar sus golpes de un torneo ya CERRADO (1.002 de 1.044 hole_scores están
--     en status 'loaded', no 'confirmed') → el leaderboard deriva del bruto, así
--     que el resultado final cambia. /api/game congela los scores; RLS no.
--
-- POR QUÉ NO ROMPE NADA: ningún código de la app escribe estas tablas con la
-- sesión del jugador.
--   - grep `from('players'|'rounds'|'hole_scores').insert|update|upsert|delete`
--     fuera de src/app/api: sólo usePlayers.ts:152 (DELETE del ORGANIZADOR → su
--     política "Organizador elimina jugador" se mantiene) y lib/data/tournaments/
--     players.ts / scoring.ts (UPDATE del ORGANIZADOR → "Organizador actualiza
--     jugador" se mantiene).
--   - Las APIs (/api/game, inscribirse, guest-join, guest-claim, start, players,
--     admin/*, delete-account) escriben con service role (bypassa RLS).
--   - La única función SQL que escribe estas tablas es enroll_player, SECURITY
--     DEFINER (no evalúa estas políticas).
--   - Scripts de seed/e2e usan SUPABASE_SERVICE_ROLE_KEY.
--
-- QUÉ NO HACE: no toca GRANTs (eso es F3 completa) ni las políticas del
-- organizador ni las de lectura.
--
-- Re-medido el 19-oct en prod: los 4 nombres calzan literal y la política
-- "Organizador actualiza jugador" filtra solo por organizer_id (no por user_id).
-- La migración se verifica sola: si después de los drops queda alguna política de
-- escritura en estas tablas que filtre por el user_id del jugador, falla y no aplica
-- nada (un drop "if exists" con un nombre equivocado ya no pasa como éxito).
--
-- VERIFICAR DESPUÉS DE APLICAR (esperado: solo las 3 del organizador en players):
--   select tablename, policyname, cmd from pg_policies
--   where schemaname = 'public' and tablename in ('players','rounds','hole_scores')
--     and cmd <> 'SELECT';
-- Y en cancha: jugador scorea su tarjeta, organizador scorea, invitado scorea,
-- inscripción por link → todo por API, debe seguir funcionando igual.
--
-- ROLLBACK: supabase/migrations/rollback/20261009_rls_escritura_jugador_rollback.sql


drop policy if exists "Jugador se inscribe" on public.players;
drop policy if exists "Jugador gestiona ronda" on public.rounds;
drop policy if exists "Jugador carga scores" on public.hole_scores;
drop policy if exists "Jugador edita scores" on public.hole_scores;

do $$
declare
  restantes text;
begin
  select string_agg(tablename || '.' || policyname, ', ') into restantes
  from pg_policies
  where schemaname = 'public'
    and tablename in ('players', 'rounds', 'hole_scores')
    and cmd <> 'SELECT'
    and coalesce(qual, '') || ' ' || coalesce(with_check, '')
        ~ '(user_id\s*=\s*auth\.uid\(\)|auth\.uid\(\)\s*=\s*\w*\.?user_id)';
  if restantes is not null then
    raise exception 'Quedan políticas de escritura del jugador: %', restantes;
  end if;
end $$;

