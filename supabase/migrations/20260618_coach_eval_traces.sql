-- Trazas del examen del coach (Fase 0 Combo IA). Cada fila = una corrida de un
-- caso golden contra el coach real, con el veredicto de ambos jueces. Sirve para
-- observar la calidad del coach a lo largo del tiempo (no es data de usuario).
create table if not exists public.coach_eval_traces (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,                 -- agrupa una corrida completa del examen
  case_id text not null,                -- EXAM_CASES[].id
  tags text[] not null default '{}',
  coach_model text not null,            -- modelo del coach bajo examen
  user_message text not null,
  final_text text not null,
  tools_used text[] not null default '{}',
  correctness_pass boolean not null,
  correctness_reasons text[] not null default '{}',
  six_pieces_applicable boolean not null default false,
  six_pieces_score int,                 -- null si no aplica
  six_pieces_missing text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists coach_eval_traces_run_idx on public.coach_eval_traces (run_id, created_at desc);
create index if not exists coach_eval_traces_case_idx on public.coach_eval_traces (case_id, created_at desc);

alter table public.coach_eval_traces enable row level security;

-- Solo service-role escribe (el examen corre en CI/build-time con la service key).
-- Lectura: nadie por anon (es data interna de calidad); el service-role bypassa RLS.
drop policy if exists coach_eval_traces_no_anon on public.coach_eval_traces;
create policy coach_eval_traces_no_anon on public.coach_eval_traces
  for select using (false);
