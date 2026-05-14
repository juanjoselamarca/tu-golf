-- supabase/migrations/042_fix_drafts_rls_recursion.sql
-- Las policies de tournament_drafts y tournament_draft_collaborators tenían recursión
-- infinita: la de drafts consulta TDC, la de TDC consulta drafts, evaluándose mutuamente.
-- Fix: helper SECURITY DEFINER que bypassea RLS al chequear collaborators.

create or replace function public.is_draft_collaborator(p_draft_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select exists (
    select 1
    from public.tournament_draft_collaborators
    where draft_id = p_draft_id and user_id = p_user_id
  );
$$;

revoke all on function public.is_draft_collaborator(uuid, uuid) from public;
grant execute on function public.is_draft_collaborator(uuid, uuid) to authenticated;

-- tournament_drafts: reescribir sin recursión
drop policy if exists tournament_drafts_select on public.tournament_drafts;
create policy tournament_drafts_select on public.tournament_drafts
  for select using (
    owner_id = auth.uid()
    or public.is_draft_collaborator(id, auth.uid())
  );

drop policy if exists tournament_drafts_update on public.tournament_drafts;
create policy tournament_drafts_update on public.tournament_drafts
  for update using (
    owner_id = auth.uid()
    or public.is_draft_collaborator(id, auth.uid())
  );

-- tournament_draft_events: misma raíz de problema (hereda visibilidad de drafts)
drop policy if exists tde_select on public.tournament_draft_events;
create policy tde_select on public.tournament_draft_events
  for select using (
    exists (
      select 1
      from public.tournament_drafts d
      where d.id = tournament_draft_events.draft_id
        and (d.owner_id = auth.uid() or public.is_draft_collaborator(d.id, auth.uid()))
    )
  );
