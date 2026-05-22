-- Audit 2026-05-17 P0 #1 — fase 2 (modo equipos ronda libre):
-- RPC paralela a `upsert_ronda_libre_scores` pero para `ronda_equipos`.
-- El modo equipos (scramble, foursome, best_ball) guarda scores compartidos
-- por equipo. Mismo bug original: UPDATE completo del JSONB pisaba hoyos
-- previos si el estado React quedaba stale.
--
-- Depende de `20260522_team_format_tables.sql` (crea la tabla `ronda_equipos`).

create or replace function public.upsert_ronda_equipos_scores(
  p_equipo_id uuid,
  p_codigo text,
  p_delta jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_new_scores jsonb;
  v_ronda_estado text;
begin
  -- Validar y lockear el row del equipo.
  select rl.estado into v_ronda_estado
  from rondas_libres rl
  inner join ronda_equipos re on re.ronda_id = rl.id
  where re.id = p_equipo_id and rl.codigo = p_codigo
  for update of re;

  if v_ronda_estado is null then
    raise exception 'RONDA_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_ronda_estado <> 'en_curso' then
    raise exception 'RONDA_FINALIZED' using errcode = 'P0002';
  end if;

  update ronda_equipos
  set scores = coalesce(scores, '{}'::jsonb) || coalesce(p_delta, '{}'::jsonb)
  where id = p_equipo_id
  returning scores into v_new_scores;

  return v_new_scores;
end;
$$;

grant execute on function public.upsert_ronda_equipos_scores(uuid, text, jsonb) to authenticated;
