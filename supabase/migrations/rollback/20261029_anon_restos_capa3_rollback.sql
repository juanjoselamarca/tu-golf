-- Rollback de 20261029200000_anon_restos_capa3.sql.
-- Vuelve a los permisos de anon y al EXECUTE de authenticated en restamp_round_metrics_target de antes
-- (supabase/schema.sql al 29-oct).
-- No pierde datos. Idempotente.

GRANT EXECUTE ON FUNCTION public.restamp_round_metrics_target(uuid, numeric) TO PUBLIC, anon, authenticated;

GRANT SELECT, UPDATE, USAGE ON SEQUENCE
  public.cerebro_events_id_seq, public.coach_events_id_seq, public.cost_tracking_id_seq,
  public.external_priors_amateur_benchmarks_id_seq, public.external_priors_course_norms_id_seq,
  public.external_priors_handicap_dist_id_seq, public.pattern_observations_id_seq
  TO anon;

GRANT SELECT (
  analysis_level, avatar_url, cerebro_v3_enabled, coach_access_enabled, cpi_score, cpi_status, cpi_trend,
  cpi_updated_at, created_at, default_tee_color, founding_member_at, genero, golf_goals, id, indice, indice_golfers,
  indice_golfers_updated_at, is_founding_member, name, nivel, nivel_expires_at, nivel_updated_at,
  patterns_need_recalc, role, subscription_status, subscription_tier, target_deadline, target_handicap,
  target_set_at, trial_ends_at, trial_rounds_remaining, updated_at
) ON public.profiles TO anon;
