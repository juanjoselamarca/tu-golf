-- Audit 2026-05-17 P0 #1: el patrón `UPDATE ronda_libre_jugadores SET scores = $1`
-- reemplaza TODO el JSONB en cada save. Si el estado React del cliente queda
-- desincronizado (cierre app, race 3G, re-mount con datos parciales), el siguiente
-- save BORRA los hoyos anteriores.
--
-- Fix arquitectónico: RPC que hace merge server-side (`scores || delta`).
-- El cliente sigue enviando lo que tiene; la BD nunca pierde un hoyo previo.
-- Si el cliente quiere corregir un hoyo, el `||` deja ganar al lado derecho.
--
-- Validaciones:
--   - jugador pertenece a la ronda
--   - ronda está en_curso (no finalizada)
-- Errcodes específicos para que el cliente pueda distinguir "ronda cerrada".

create or replace function public.upsert_ronda_libre_scores(
  p_jugador_id uuid,
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
  -- Validar y lockear el row del jugador.
  select rl.estado into v_ronda_estado
  from rondas_libres rl
  inner join ronda_libre_jugadores rlj on rlj.ronda_id = rl.id
  where rlj.id = p_jugador_id and rl.codigo = p_codigo
  for update of rlj;

  if v_ronda_estado is null then
    raise exception 'RONDA_NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_ronda_estado <> 'en_curso' then
    raise exception 'RONDA_FINALIZED' using errcode = 'P0002';
  end if;

  -- Merge: `||` hace shallow merge JSONB (lado derecho gana en colisión).
  update ronda_libre_jugadores
  set scores = coalesce(scores, '{}'::jsonb) || coalesce(p_delta, '{}'::jsonb)
  where id = p_jugador_id
  returning scores into v_new_scores;

  return v_new_scores;
end;
$$;

grant execute on function public.upsert_ronda_libre_scores(uuid, text, jsonb) to authenticated;
