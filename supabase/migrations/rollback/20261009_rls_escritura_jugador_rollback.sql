-- ROLLBACK de 20261009_rls_quitar_escritura_directa_jugador_torneo.sql
-- Recrea EXACTAMENTE las 4 políticas medidas en prod el 09-oct-2026 (pg_policies,
-- sólo lectura): PERMISSIVE, roles {public}.
--
-- Vive en rollback/ para que el CLI de Supabase NUNCA lo tome como migración.
-- Aplicar: node --env-file=.env.local scripts/run-sql.mjs supabase/migrations/rollback/20261009_rls_escritura_jugador_rollback.sql

begin;

create policy "Jugador se inscribe" on public.players
  as permissive for insert to public
  with check (auth.uid() = user_id);

create policy "Jugador gestiona ronda" on public.rounds
  as permissive for all to public
  using (exists (
    select 1 from public.players
    where players.id = rounds.player_id and players.user_id = auth.uid()
  ));

create policy "Jugador carga scores" on public.hole_scores
  as permissive for insert to public
  with check (exists (
    select 1 from public.rounds r join public.players p on p.id = r.player_id
    where r.id = hole_scores.round_id and p.user_id = auth.uid()
  ));

create policy "Jugador edita scores" on public.hole_scores
  as permissive for update to public
  using (
    status <> all (array['confirmed'::text, 'corrected'::text])
    and exists (
      select 1 from public.rounds r join public.players p on p.id = r.player_id
      where r.id = hole_scores.round_id and p.user_id = auth.uid()
    )
  );

commit;
