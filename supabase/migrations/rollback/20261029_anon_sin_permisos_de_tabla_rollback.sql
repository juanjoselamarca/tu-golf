-- Rollback de 20261029120000_anon_sin_permisos_de_tabla.sql.
-- Vuelve a los permisos de tabla que anon tenía antes (supabase/schema.sql al 29-oct): 68 tablas. Los SELECT por
-- columna no se tocan, así que las 9 tablas de las vistas públicas y profiles vuelven sin SELECT de tabla.
-- No pierde datos. Idempotente.

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.ai_usage, public.analytics_events, public.categories, public.cerebro_events, public.cerebro_weights,
  public.coach_episodic_memory, public.coach_eval_traces, public.coach_events, public.coach_plans,
  public.collective_insights, public.cost_tracking, public.course_holes, public.course_si_proposals,
  public.course_tees, public.courses, public.dev_pendientes, public.e2e_runs, public.error_logs,
  public.evaluation_runs, public.external_priors_amateur_benchmarks, public.external_priors_course_norms,
  public.external_priors_handicap_dist, public.fedegolf_credentials, public.flights, public.garmin_connections,
  public.golf_rules, public.handicap_history, public.historical_rounds, public.import_jobs, public.inbox_reports,
  public.indice_historial, public.knowledge_chunks, public.knowledge_sources, public.llm_models,
  public.match_pairings, public.notification_preferences, public.pattern_definitions, public.pattern_observations,
  public.plan_outcomes, public.player_patterns, public.player_psych_profile, public.push_subscriptions,
  public.rag_query_log, public.round_metrics, public.round_watchers, public.score_audit_log, public.taiger_feedback,
  public.taiger_message_feedback, public.taiger_recommendations, public.taiger_sessions,
  public.tournament_draft_collaborators, public.tournament_draft_events, public.tournament_draft_share_tokens,
  public.tournament_drafts, public.tournament_prizes, public.tournament_rounds, public.tournament_templates,
  public.tournaments
  TO anon;

GRANT INSERT, UPDATE, DELETE ON
  public.hole_scores, public.players, public.ronda_equipo_jugadores, public.ronda_equipos,
  public.ronda_libre_jugadores, public.rondas_libres, public.rounds, public.tournament_group_players,
  public.tournament_groups
  TO anon;

GRANT INSERT, DELETE ON
  public.profiles
  TO anon;
