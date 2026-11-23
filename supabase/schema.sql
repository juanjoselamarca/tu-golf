-- GENERADO por scripts/ci/esquema.mjs: no editar a mano. Es el esquema que dejan las migraciones de
-- supabase/migrations, y el workflow esquema lo verifica en cada PR. Tras una migración: node scripts/ci/esquema.mjs

set local check_function_bodies = off;
set local search_path to '';
-- ===== 1. extensiones =====
create extension if not exists "pg_stat_statements" with schema "extensions";
create extension if not exists "pg_trgm" with schema "public";
create extension if not exists "pgcrypto" with schema "extensions";
create extension if not exists "plpgsql" with schema "pg_catalog";
create extension if not exists "supabase_vault" with schema "vault";
create extension if not exists "unaccent" with schema "public";
create extension if not exists "uuid-ossp" with schema "extensions";
create extension if not exists "vector" with schema "public";
-- ===== 2. enums =====
create type public."subscription_status" as enum ('active', 'trialing', 'past_due', 'paused', 'canceled');
create type public."subscription_tier" as enum ('free', 'pro', 'pro_plus');
-- ===== 3. secuencias =====
create sequence public."cerebro_events_id_seq" as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1;
create sequence public."coach_events_id_seq" as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1;
create sequence public."cost_tracking_id_seq" as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 cache 1;
-- ===== 4. tablas =====
create table public."ai_usage" (
  "id" uuid default gen_random_uuid() not null,
  "created_at" timestamp with time zone default now() not null,
  "ai_env" text not null,
  "role" text not null,
  "provider" text,
  "model" text,
  "status" text not null,
  "fallback_used" boolean default false not null,
  "attempts" integer default 0 not null,
  "tokens_in" integer default 0 not null,
  "tokens_out" integer default 0 not null,
  "latency_ms" integer default 0 not null,
  "cost_usd" numeric(12,8) default 0 not null,
  "error_kind" text,
  "user_id" uuid,
  "surface" text,
  "cache_read_tokens" integer default 0 not null,
  "cache_write_tokens" integer default 0 not null,
  "session_id" uuid
);
create table public."analytics_events" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "event_type" text not null,
  "event_data" jsonb default '{}'::jsonb,
  "session_id" text,
  "device_type" text,
  "created_at" timestamp with time zone default now()
);
create table public."categories" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "tournament_id" uuid not null,
  "name" text not null,
  "handicap_min" numeric(4,1),
  "handicap_max" numeric(4,1),
  "gender" text,
  "created_at" timestamp with time zone default now(),
  "default_tee_color" text
);
create table public."cerebro_events" (
  "id" bigint default nextval('public.cerebro_events_id_seq'::regclass) not null,
  "user_id" uuid,
  "event_type" text not null,
  "event_payload" jsonb not null,
  "weights_snapshot" jsonb,
  "latency_ms" integer,
  "cost_usd" numeric(8,5),
  "created_at" timestamp with time zone default now() not null
);
create table public."cerebro_weights" (
  "id" uuid default gen_random_uuid() not null,
  "parameter_type" text not null,
  "parameter_key" text not null,
  "current_weight" numeric(5,4) not null,
  "previous_weight" numeric(5,4),
  "user_cluster_id" uuid,
  "source" text not null,
  "version" integer default 1 not null,
  "locked_until" timestamp with time zone,
  "last_auto_update_at" timestamp with time zone,
  "last_manual_override_at" timestamp with time zone,
  "updated_at" timestamp with time zone default now() not null
);
create table public."coach_episodic_memory" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "category" text not null,
  "fact" text not null,
  "confidence" numeric(3,2) not null,
  "source_session_id" uuid,
  "source_message_id" uuid,
  "superseded_by" uuid,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null
);
create table public."coach_eval_traces" (
  "id" uuid default gen_random_uuid() not null,
  "run_id" text not null,
  "case_id" text not null,
  "tags" text[] default '{}'::text[] not null,
  "coach_model" text not null,
  "user_message" text not null,
  "final_text" text not null,
  "tools_used" text[] default '{}'::text[] not null,
  "correctness_pass" boolean not null,
  "correctness_reasons" text[] default '{}'::text[] not null,
  "six_pieces_applicable" boolean default false not null,
  "six_pieces_score" integer,
  "six_pieces_missing" text[] default '{}'::text[] not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."coach_events" (
  "id" bigint default nextval('public.coach_events_id_seq'::regclass) not null,
  "user_id" uuid not null,
  "type" text not null,
  "payload" jsonb not null,
  "related_plan_id" uuid,
  "related_session_id" uuid,
  "created_at" timestamp with time zone default now() not null
);
create table public."coach_plans" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "pattern_id" text not null,
  "pattern_version" integer default 1 not null,
  "hypothesis" text not null,
  "rule" text not null,
  "metric" text not null,
  "target_value" numeric not null,
  "target_op" text default 'lte'::text not null,
  "baseline_value" numeric,
  "duration_days" integer default 21 not null,
  "status" text default 'active'::text not null,
  "resolution_reason" text,
  "observation_data" jsonb not null,
  "assigned_by" text default 'tAIger'::text not null,
  "session_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "resolved_at" timestamp with time zone
);
create table public."collective_insights" (
  "id" uuid default gen_random_uuid() not null,
  "pattern_type" text not null,
  "handicap_range" text not null,
  "insight" text not null,
  "sample_size" integer default 0 not null,
  "confidence" numeric default 0 not null,
  "computed_at" timestamp with time zone default now() not null
);
create table public."cost_tracking" (
  "id" bigint default nextval('public.cost_tracking_id_seq'::regclass) not null,
  "user_id" uuid,
  "feature" text not null,
  "provider" text not null,
  "tokens_input" integer,
  "tokens_output" integer,
  "cost_usd" numeric(8,5) not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."course_holes" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "course_id" uuid not null,
  "numero" integer not null,
  "par" integer not null,
  "stroke_index" integer,
  "yardaje_negras" integer,
  "yardaje_azul" integer,
  "yardaje_blanco" integer,
  "yardaje_rojo" integer,
  "descripcion" text,
  "recorrido" text,
  "fuente_yardaje" text,
  "yardaje_verificado_at" date
);
create table public."course_si_proposals" (
  "id" uuid default gen_random_uuid() not null,
  "course_id" uuid,
  "proposed_by" uuid,
  "stroke_index" jsonb not null,
  "status" text default 'pending'::text,
  "created_at" timestamp with time zone default now()
);
create table public."course_tees" (
  "id" uuid default gen_random_uuid() not null,
  "course_id" uuid not null,
  "nombre" text not null,
  "yardaje_total" integer,
  "par_total" integer,
  "rating" numeric(4,1),
  "slope" integer,
  "genero" text default 'M'::text,
  "created_at" timestamp with time zone default now(),
  "front_course_rating" numeric(4,1),
  "front_slope_rating" integer,
  "front_bogey_rating" numeric(4,1),
  "back_course_rating" numeric(4,1),
  "back_slope_rating" integer,
  "back_bogey_rating" numeric(4,1),
  "bogey_rating" numeric(4,1),
  "total_yards" integer,
  "total_meters" integer,
  "fuente" text default 'manual'::text
);
create table public."courses" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "nombre" text not null,
  "ciudad" text,
  "pais" text default 'Chile'::text not null,
  "slope_rating" integer default 113,
  "course_rating" numeric(4,1),
  "par_total" integer default 72 not null,
  "foto_url" text,
  "sitio_web" text,
  "latitud" numeric(10,7),
  "longitud" numeric(10,7),
  "fuente" text default 'manual'::text,
  "fuente_id" text,
  "activa" boolean default true,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "tipo_recorrido" text default '18h'::text,
  "parent_id" uuid,
  "loop_nombre" text,
  "datos_verificados" boolean default false,
  "si_verificado" boolean default false,
  "fedegolf_club_id" integer,
  "fedegolf_cancha_id" integer,
  "fedegolf_synced_at" timestamp with time zone,
  "canonical_course_id" uuid,
  "nombre_canonico" text generated always as (lower(regexp_replace(nombre, '\s*\((DAMAS|VARONES|CABALLEROS)\)\s*'::text, ''::text, 'gi'::text))) stored,
  "genero_norm" text generated always as (
CASE
    WHEN (nombre ~* '\(DAMAS\)'::text) THEN 'D'::text
    WHEN (nombre ~* '\(VARONES\)|\(CABALLEROS\)'::text) THEN 'V'::text
    ELSE 'X'::text
END) stored
);
create table public."dev_pendientes" (
  "id" uuid default gen_random_uuid() not null,
  "sprint" text,
  "titulo" text,
  "descripcion" text,
  "prioridad" text,
  "resuelto" boolean default false,
  "created_at" timestamp with time zone default now()
);
create table public."e2e_runs" (
  "id" uuid default gen_random_uuid() not null,
  "status" text not null,
  "triggered_by" uuid,
  "github_run_id" bigint,
  "github_run_url" text,
  "branch" text,
  "commit_sha" text,
  "base_url" text,
  "started_at" timestamp with time zone default now(),
  "finished_at" timestamp with time zone,
  "summary" jsonb default '{"total": 0, "failed": 0, "passed": 0, "skipped": 0}'::jsonb,
  "results" jsonb default '[]'::jsonb,
  "error_message" text,
  "created_at" timestamp with time zone default now()
);
create table public."error_logs" (
  "id" uuid default gen_random_uuid() not null,
  "level" text default 'error'::text not null,
  "message" text not null,
  "source" text,
  "page" text,
  "user_id" uuid,
  "metadata" jsonb default '{}'::jsonb,
  "resolved" boolean default false,
  "created_at" timestamp with time zone default now()
);
create table public."evaluation_runs" (
  "id" uuid default gen_random_uuid() not null,
  "triggered_by" text not null,
  "ola_version" text,
  "profiles_evaluated" text[],
  "results" jsonb not null,
  "pass" boolean not null,
  "evaluator_notes" text,
  "created_at" timestamp with time zone default now() not null
);
create table public."external_priors_amateur_benchmarks" (
  "id" bigint generated always as identity not null,
  "source_id" uuid not null,
  "handicap_bucket" text not null,
  "metric_key" text not null,
  "percentile" integer not null,
  "value" numeric not null,
  "sample_size" integer,
  "created_at" timestamp with time zone default now() not null
);
create table public."external_priors_course_norms" (
  "id" bigint generated always as identity not null,
  "source_id" uuid not null,
  "course_external_id" text not null,
  "course_name" text,
  "region" text,
  "par" integer,
  "slope_rating" integer,
  "course_rating" numeric,
  "metadata" jsonb,
  "created_at" timestamp with time zone default now() not null
);
create table public."external_priors_handicap_dist" (
  "id" bigint generated always as identity not null,
  "source_id" uuid not null,
  "region" text not null,
  "gender" text default 'all'::text not null,
  "age_bucket" text default 'all'::text not null,
  "handicap_bin" text not null,
  "proportion" numeric not null,
  "year" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."fedegolf_credentials" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "rut_encrypted" text not null,
  "password_encrypted" text not null,
  "ultimo_sync" timestamp with time zone,
  "ultimo_indice" numeric(4,1),
  "activo" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "ultimo_sync_tarjetas" timestamp with time zone,
  "sin_indice_desde" timestamp with time zone
);
create table public."flights" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "tournament_id" uuid not null,
  "name" text not null,
  "tee_time" timestamp with time zone,
  "created_at" timestamp with time zone default now()
);
create table public."garmin_connections" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "access_token" text,
  "refresh_token" text,
  "token_expires_at" timestamp with time zone,
  "garmin_user_id" text,
  "last_sync" timestamp with time zone,
  "status" text default 'pending'::text,
  "created_at" timestamp with time zone default now()
);
create table public."golf_rules" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "category" text not null,
  "rule_key" text not null,
  "rule_data" jsonb not null,
  "description" text,
  "source" text,
  "version" text default '2024'::text,
  "created_at" timestamp with time zone default now()
);
create table public."handicap_history" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "handicap_index" numeric(4,1),
  "source" text default 'manual'::text,
  "calculated_at" timestamp with time zone default now()
);
create table public."historical_rounds" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "course_name" text not null,
  "tee_color" text,
  "played_at" date not null,
  "scores" jsonb default '[]'::jsonb not null,
  "total_gross" integer,
  "notes" text,
  "privacy" text default 'private'::text not null,
  "created_at" timestamp with time zone default now(),
  "total_neto" integer,
  "total_stableford" integer,
  "course_id" uuid,
  "import_confidence" numeric(3,2) default 1.00,
  "holes_played" integer not null,
  "import_source" text default 'manual'::text,
  "course_rating" numeric(4,1),
  "slope_rating" integer,
  "metadata" jsonb,
  "garmin_scorecard_id" text,
  "diferencial" numeric(5,2),
  "formato_juego" text default 'stroke_play'::text not null,
  "modo_juego" text default 'gross'::text not null,
  "par_per_hole" jsonb,
  "excluded_from_handicap" boolean default false not null,
  "fedegolf_ticket" text,
  "vale_doble" boolean default false not null,
  "match_result" text,
  "team_name" text,
  "adjusted_gross" integer
);
create table public."hole_scores" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "round_id" uuid not null,
  "hole_number" integer not null,
  "par" integer not null,
  "gross_score" integer,
  "net_score" integer,
  "points" integer default 0,
  "source" text default 'manual_player'::text not null,
  "status" text default 'pending'::text not null,
  "garmin_activity_id" text,
  "garmin_shot_data" jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "putts" integer,
  "fairway_hit" boolean,
  "gir" boolean
);
create table public."hole_scores_orden" (
  "round_id" uuid not null,
  "hole_number" integer not null,
  "dispositivo" uuid not null,
  "seq" bigint not null
);
create table public."import_jobs" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "source" text not null,
  "status" text default 'pending'::text not null,
  "total_detected" integer default 0,
  "total_valid" integer default 0,
  "total_excluded" integer default 0,
  "total_imported" integer default 0,
  "raw_data" jsonb,
  "mapped_data" jsonb,
  "errors" jsonb,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "completed_at" timestamp with time zone,
  "total_updated" integer,
  "unsaved_rounds" jsonb
);
create table public."inbox_reports" (
  "id" uuid default gen_random_uuid() not null,
  "telegram_message_id" bigint not null,
  "telegram_chat_id" bigint not null,
  "telegram_user_id" bigint,
  "telegram_media_group_id" text,
  "telegram_msg_date" timestamp with time zone not null,
  "texto" text,
  "caption" text,
  "fotos_paths" text[] default '{}'::text[] not null,
  "audio_path" text,
  "reply_to_report_id" uuid,
  "recibido_en" timestamp with time zone default now() not null,
  "editado_en" timestamp with time zone,
  "procesado_en" timestamp with time zone,
  "status" text default 'nuevo'::text not null,
  "prioridad" text,
  "categoria" text,
  "ruta_afectada" text,
  "resumen_corto" text,
  "rama_fix" text,
  "enlace_auditoria" text,
  "notas" text
);
create table public."indice_historial" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "indice" numeric(4,1) not null,
  "fecha" timestamp with time zone default now() not null,
  "fuente" text default 'manual'::text not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."knowledge_chunks" (
  "id" uuid default gen_random_uuid() not null,
  "source_id" uuid not null,
  "block_key" text not null,
  "breadcrumb" text not null,
  "rule_anchor" text,
  "content" text not null,
  "contextual_prefix" text,
  "content_for_embed" text not null,
  "embedding" public.vector(1536),
  "chunk_hash" text not null,
  "page_start" integer,
  "page_end" integer,
  "token_count" integer not null,
  "created_at" timestamp with time zone default now() not null,
  "tsv" tsvector generated always as (to_tsvector('simple'::regconfig, COALESCE(content, ''::text))) stored
);
create table public."knowledge_sources" (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "title" text not null,
  "authors" text[] default '{}'::text[] not null,
  "url_source" text not null,
  "url_local_pdf" text,
  "block_key" text not null,
  "jurisdiction" text not null,
  "priority_rank" integer default 100 not null,
  "is_authoritative_for" text[] default '{}'::text[] not null,
  "legal_basis" text not null,
  "source_hash" text,
  "ingested_at" timestamp with time zone,
  "chunk_count" integer default 0 not null,
  "ingest_cost_usd" numeric(8,4) default 0 not null,
  "status" text default 'pending'::text not null,
  "error_message" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."llm_models" (
  "id" uuid default gen_random_uuid() not null,
  "model_id" text not null,
  "role" text not null,
  "status" text not null,
  "context_window" integer,
  "cost_per_1m_tokens_input" numeric(8,4),
  "cost_per_1m_tokens_output" numeric(8,4),
  "embedding_dim" integer,
  "fallback_to_model_id" text,
  "config" jsonb,
  "created_at" timestamp with time zone default now() not null
);
create table public."match_pairings" (
  "id" uuid default gen_random_uuid() not null,
  "ronda_id" uuid not null,
  "jugador_a_id" uuid not null,
  "jugador_b_id" uuid not null,
  "hcp_diff_a" integer default 0,
  "hcp_diff_b" integer default 0,
  "nassau" boolean default false,
  "resultado" jsonb,
  "created_at" timestamp with time zone default now()
);
create table public."notification_preferences" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "birdies" boolean default true,
  "eagles" boolean default true,
  "leader_changes" boolean default true,
  "round_updates" boolean default true,
  "round_finished" boolean default true,
  "marketing" boolean default false,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "indice_cambios" boolean default true not null
);
create table public."pattern_definitions" (
  "id" uuid default gen_random_uuid() not null,
  "pattern_key" text not null,
  "name" text not null,
  "description" text,
  "generation" integer default 0 not null,
  "formula_kind" text not null,
  "formula_payload" jsonb not null,
  "applicable_when" jsonb,
  "weight" numeric(5,4) default 0.5 not null,
  "version" integer default 1 not null,
  "source" text not null,
  "status" text default 'active'::text not null,
  "validation_metadata" jsonb,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."pattern_observations" (
  "id" bigint generated always as identity not null,
  "pattern_id" uuid not null,
  "pattern_key" text not null,
  "pattern_version" integer not null,
  "round_id" uuid not null,
  "user_id" uuid not null,
  "value" numeric not null,
  "metadata" jsonb,
  "computed_at" timestamp with time zone default now() not null
);
create table public."plan_outcomes" (
  "id" uuid default gen_random_uuid() not null,
  "plan_id" uuid not null,
  "user_id" uuid not null,
  "historical_round_id" uuid,
  "ronda_libre_id" uuid,
  "played_at" timestamp with time zone not null,
  "metric_value" numeric not null,
  "delta_vs_baseline" numeric,
  "target_reached" boolean not null,
  "compliance" text not null,
  "metadata" jsonb,
  "created_at" timestamp with time zone default now() not null
);
create table public."player_patterns" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "pattern_type" text not null,
  "confidence" numeric(3,2) default 0.0,
  "data_points" integer default 0,
  "metadata" jsonb default '{}'::jsonb,
  "first_detected" timestamp with time zone default now(),
  "last_updated" timestamp with time zone default now(),
  "status" text default 'active'::text
);
create table public."player_psych_profile" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "onboarding_completed" boolean default false,
  "onboarding_answers" jsonb default '{}'::jsonb,
  "identity_score" numeric(3,1),
  "pressure_response" text,
  "motivation_type" text,
  "primary_fear" text,
  "updated_at" timestamp with time zone default now()
);
create table public."players" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "tournament_id" uuid not null,
  "user_id" uuid,
  "category_id" uuid,
  "flight_id" uuid,
  "handicap_at_registration" numeric(4,1),
  "status" text default 'pending'::text not null,
  "created_at" timestamp with time zone default now(),
  "tees" text,
  "status_reason" text,
  "status_changed_at" timestamp with time zone,
  "pending_user_id" uuid,
  "player_name" text,
  "tee_id" uuid,
  "genero" text
);
create table public."profiles" (
  "id" uuid not null,
  "email" text not null,
  "name" text not null,
  "role" text default 'player'::text not null,
  "indice" numeric(4,1),
  "avatar_url" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "patterns_need_recalc" boolean default false,
  "cpi_score" numeric(5,2),
  "cpi_updated_at" timestamp with time zone,
  "cpi_trend" numeric(6,4),
  "cpi_status" text default 'insufficient_data'::text,
  "analysis_level" text,
  "golf_goals" text,
  "indice_golfers" numeric(4,1),
  "indice_golfers_updated_at" timestamp with time zone,
  "nivel" integer default 1,
  "nivel_updated_at" timestamp with time zone,
  "nivel_expires_at" timestamp with time zone,
  "cerebro_v3_enabled" boolean default false not null,
  "target_handicap" numeric(4,1),
  "target_deadline" date,
  "target_set_at" timestamp with time zone,
  "default_tee_color" text,
  "genero" text,
  "fecha_nacimiento" date,
  "coach_access_enabled" boolean default false not null,
  "subscription_tier" public.subscription_tier default 'free'::public.subscription_tier not null,
  "subscription_status" public.subscription_status default 'active'::public.subscription_status not null,
  "trial_rounds_remaining" integer,
  "trial_ends_at" timestamp with time zone,
  "is_founding_member" boolean default false not null,
  "founding_member_at" timestamp with time zone
);
create table public."push_subscriptions" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "endpoint" text not null,
  "p256dh" text not null,
  "auth" text not null,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now()
);
create table public."rag_query_log" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "query" text not null,
  "query_embedding" public.vector(1536),
  "jurisdictions_filter" text[],
  "top_k_requested" integer not null,
  "hybrid_alpha" numeric(3,2) not null,
  "total_candidates" integer not null,
  "returned_count" integer not null,
  "top_score" numeric(8,6),
  "bottom_score" numeric(8,6),
  "cited_chunk_ids" uuid[] not null,
  "latency_ms" integer not null,
  "cost_usd" numeric(10,8) not null,
  "embedding_model" text not null,
  "reranker_model" text not null,
  "error_code" text,
  "created_at" timestamp with time zone default now() not null
);
create table public."rate_limit_hits" (
  "key" text not null,
  "count" integer not null,
  "reset_at" timestamp with time zone not null
);
create table public."ronda_equipo_jugadores" (
  "id" uuid default gen_random_uuid() not null,
  "equipo_id" uuid not null,
  "jugador_id" uuid not null,
  "orden" integer default 0 not null
);
create table public."ronda_equipos" (
  "id" uuid default gen_random_uuid() not null,
  "ronda_id" uuid not null,
  "nombre" text not null,
  "handicap_equipo" numeric(4,1),
  "scores" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone default now(),
  "handicap_equipo_juego" smallint,
  "updated_at" timestamp with time zone default now(),
  "handicap_origen" text default 'calculado'::text not null,
  "anotador_user_id" uuid,
  "anotador_nombre" text
);
create table public."ronda_equipos_scores_orden" (
  "equipo_id" uuid not null,
  "dispositivo" uuid not null,
  "seq" bigint not null
);
create table public."ronda_libre_juego_orden" (
  "ronda_id" uuid not null,
  "clave" text not null,
  "dispositivo" uuid not null,
  "seq" bigint not null
);
create table public."ronda_libre_jugadores" (
  "id" uuid default gen_random_uuid() not null,
  "ronda_id" uuid,
  "nombre" text not null,
  "user_id" uuid,
  "scores" jsonb default '{}'::jsonb,
  "created_at" timestamp with time zone default now(),
  "nombre_invitado" text,
  "telefono_invitado" text,
  "is_guest" boolean default false,
  "tarjeta_aceptada" boolean,
  "pending_user_id" uuid,
  "handicap" numeric(4,1) default NULL::numeric,
  "tees" text,
  "perfil_sugerido_id" uuid,
  "handicap_de_inscripcion" boolean default false not null,
  "updated_at" timestamp with time zone default now()
);
create table public."ronda_libre_puntitos" (
  "id" uuid default gen_random_uuid() not null,
  "ronda_id" uuid not null,
  "jugador_id" uuid not null,
  "hoyo" integer not null,
  "puntito_id" text not null,
  "created_at" timestamp with time zone default clock_timestamp() not null
);
create table public."ronda_libre_retiros" (
  "jugador_id" uuid not null,
  "ronda_id" uuid not null,
  "desde_hoyo" integer not null,
  "created_at" timestamp with time zone default clock_timestamp() not null
);
create table public."ronda_libre_scores_orden" (
  "jugador_id" uuid not null,
  "dispositivo" uuid not null,
  "seq" bigint not null
);
create table public."rondas_libres" (
  "id" uuid default gen_random_uuid() not null,
  "codigo" text not null,
  "creador_id" uuid,
  "course_id" uuid,
  "course_name" text not null,
  "tees" text default 'blanco'::text,
  "holes" integer default 18,
  "fecha" date not null,
  "estado" text default 'en_curso'::text not null,
  "created_at" timestamp with time zone default now(),
  "modo_juego" text default 'gross'::text,
  "hoyo_inicio" integer default 1,
  "admin_mode" boolean default false,
  "admin_user_id" uuid,
  "recorridos" jsonb,
  "custom_stroke_index" jsonb,
  "course_snapshot" jsonb,
  "formato_juego" text default 'stroke_play'::text not null,
  "es_demo" boolean default false not null,
  "hcp_pct" smallint default 100 not null,
  "reglas_juego" jsonb
);
create table public."round_metrics" (
  "id" uuid default gen_random_uuid() not null,
  "round_id" uuid not null,
  "user_id" uuid not null,
  "strokes_over_par_round" numeric(4,1) not null,
  "delta_vs_handicap_expected" numeric(4,1) not null,
  "delta_vs_target_handicap" numeric(4,1),
  "holes_played" integer not null,
  "par_cancha" integer not null,
  "handicap_at_time" numeric(4,1),
  "target_at_time" numeric(4,1),
  "computed_at" timestamp with time zone default now() not null
);
create table public."round_watchers" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "ronda_codigo" text not null,
  "created_at" timestamp with time zone default now(),
  "push_subscription_id" uuid
);
create table public."rounds" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "tournament_id" uuid not null,
  "player_id" uuid not null,
  "status" text default 'in_progress'::text not null,
  "total_gross" integer default 0,
  "total_net" integer default 0,
  "total_points" integer default 0,
  "started_at" timestamp with time zone default now(),
  "closed_at" timestamp with time zone,
  "round_number" integer default 1
);
create table public."score_audit_log" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "hole_score_id" uuid not null,
  "changed_by" uuid,
  "previous_value" integer,
  "new_value" integer,
  "reason" text not null,
  "created_at" timestamp with time zone default now()
);
create table public."taiger_feedback" (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid not null,
  "user_id" uuid not null,
  "rating" integer not null,
  "comment" text,
  "created_at" timestamp with time zone default now() not null
);
create table public."taiger_message_feedback" (
  "id" uuid default gen_random_uuid() not null,
  "session_id" uuid not null,
  "user_id" uuid not null,
  "message_key" text not null,
  "vote" smallint not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."taiger_recommendations" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid not null,
  "session_id" uuid,
  "recommendation" text not null,
  "category" text not null,
  "focus_area" text not null,
  "status" text default 'active'::text not null,
  "score_before" numeric,
  "score_after" numeric,
  "created_at" timestamp with time zone default now() not null,
  "resolved_at" timestamp with time zone
);
create table public."taiger_sessions" (
  "id" uuid default gen_random_uuid() not null,
  "user_id" uuid,
  "session_type" text not null,
  "tournament_id" uuid,
  "ronda_libre_id" uuid,
  "messages" jsonb default '[]'::jsonb,
  "techniques_assigned" jsonb default '[]'::jsonb,
  "mental_notes" text,
  "next_focus" text,
  "created_at" timestamp with time zone default now(),
  "rating" integer,
  "is_primary" boolean default false not null,
  "updated_at" timestamp with time zone default now() not null
);
create table public."timba_probadores" (
  "user_id" uuid not null,
  "creado_en" timestamp with time zone default now() not null
);
create table public."tournament_draft_collaborators" (
  "draft_id" uuid not null,
  "user_id" uuid not null,
  "role" text not null,
  "added_by" uuid not null,
  "added_at" timestamp with time zone default now() not null
);
create table public."tournament_draft_events" (
  "id" uuid default gen_random_uuid() not null,
  "draft_id" uuid not null,
  "actor_id" uuid not null,
  "config_partial" jsonb not null,
  "config_before" jsonb,
  "source" text not null,
  "ai_message" text,
  "ai_explanation" text,
  "ai_cost_usd" numeric(8,5),
  "ai_latency_ms" integer,
  "created_at" timestamp with time zone default now() not null
);
create table public."tournament_draft_share_tokens" (
  "token" text not null,
  "draft_id" uuid not null,
  "created_by" uuid not null,
  "expires_at" timestamp with time zone not null,
  "consumed_at" timestamp with time zone,
  "consumed_by" uuid,
  "created_at" timestamp with time zone default now() not null
);
create table public."tournament_drafts" (
  "id" uuid default gen_random_uuid() not null,
  "owner_id" uuid not null,
  "name" text,
  "config" jsonb default '{}'::jsonb not null,
  "status" text default 'draft'::text not null,
  "version" integer default 1 not null,
  "tournament_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "pending_tournament_id" uuid
);
create table public."tournament_group_players" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "group_id" uuid,
  "player_id" uuid,
  "jugador_ronda_id" uuid
);
create table public."tournament_groups" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "tournament_id" uuid,
  "name" text not null,
  "tee_time" timestamp with time zone,
  "ronda_libre_id" uuid,
  "sort_order" integer default 0,
  "created_at" timestamp with time zone default now()
);
create table public."tournament_prizes" (
  "id" uuid default gen_random_uuid() not null,
  "tournament_id" uuid not null,
  "type" text not null,
  "description" text not null,
  "category_id" uuid,
  "position" integer,
  "hole_number" integer,
  "awarded_to" uuid,
  "created_at" timestamp with time zone default now() not null,
  "kind" text
);
create table public."tournament_rounds" (
  "id" uuid default gen_random_uuid() not null,
  "tournament_id" uuid not null,
  "round_number" integer not null,
  "date" date,
  "course_id" uuid,
  "hole_count" integer not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."tournament_templates" (
  "id" uuid default gen_random_uuid() not null,
  "owner_id" uuid,
  "name" text not null,
  "config" jsonb not null,
  "is_global" boolean default false not null,
  "created_at" timestamp with time zone default now() not null
);
create table public."tournaments" (
  "id" uuid default extensions.uuid_generate_v4() not null,
  "name" text not null,
  "slug" text not null,
  "organizer_id" uuid not null,
  "course_name" text,
  "date_start" date not null,
  "date_end" date,
  "format" text default 'stroke_play'::text not null,
  "hole_count" integer default 18 not null,
  "use_handicap" boolean default true,
  "status" text default 'draft'::text not null,
  "cover_image_url" text,
  "created_at" timestamp with time zone default now(),
  "updated_at" timestamp with time zone default now(),
  "slope_rating" integer default 113,
  "course_rating" numeric(4,1),
  "course_id" uuid,
  "tees" text default 'blanco'::text,
  "modo_juego" text default 'gross'::text,
  "afecta_estadisticas" boolean default true,
  "codigo" text,
  "total_rounds" integer default 1,
  "custom_stroke_index" jsonb,
  "course_snapshot" jsonb,
  "formato_juego" text default 'stroke_play'::text not null,
  "es_demo" boolean default false not null,
  "hcp_calc_mode" text default 'whs'::text not null,
  "team_config" jsonb,
  "max_players" integer,
  "description" text,
  "hcp_pct" smallint default 100 not null,
  "aviso_cierre_enviado_at" timestamp with time zone,
  "cerrado_automaticamente_at" timestamp with time zone,
  "cierre_automatico" boolean default true not null
);
-- ===== 5. funciones =====
CREATE OR REPLACE FUNCTION public.aprobar_en_juego_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated', 'service_role')
     AND NEW.status = 'approved'
     -- Mover el tournament_id también cuenta: sacar al inscrito a un torneo abierto, aprobarlo y devolverlo
     -- aprobado sería el mismo atajo en tres pasos.
     AND (OLD.status IS DISTINCT FROM 'approved' OR NEW.tournament_id IS DISTINCT FROM OLD.tournament_id)
     AND COALESCE(public.torneo_con_grupos_fijos(NEW.tournament_id), false) THEN
    RAISE EXCEPTION 'El torneo ya empezó: asigna al jugador a un grupo para sumarlo'
      USING ERRCODE = 'P0001', HINT = 'grupos_fijos';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.asegurar_tarjeta_vigente(p_tournament_id uuid, p_player_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tstatus  text;
  v_total    integer;
  v_pstatus  text;
  v_vigente  integer;
  v_round_id uuid;
BEGIN
  -- Mismo lock que enroll_player: serializa con las altas del torneo.
  SELECT status, coalesce(total_rounds, 1) INTO v_tstatus, v_total FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tournament_not_found');
  END IF;

  SELECT status INTO v_pstatus FROM players WHERE id = p_player_id AND tournament_id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_not_found');
  END IF;
  -- WD/DQ (o pendiente) no juegan: sin tarjeta.
  IF v_pstatus IS DISTINCT FROM 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'player_not_active');
  END IF;
  -- Torneo finalizado (= FINALIZADO_STATUSES de src/golf/tournament-live-status.ts; lo vigila un canario).
  IF v_tstatus IN ('closed', 'published', 'finished') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tournament_closed');
  END IF;

  -- Ronda vigente = la mayor con tarjetas (la misma regla que startNextRound). Sin tarjetas: la 1.
  SELECT max(round_number) INTO v_vigente FROM rounds WHERE tournament_id = p_tournament_id;
  v_vigente := coalesce(v_vigente, 1);

  SELECT id INTO v_round_id FROM rounds
  WHERE tournament_id = p_tournament_id AND player_id = p_player_id AND round_number = v_vigente;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'round_id', v_round_id, 'round_number', v_vigente, 'creada', false);
  END IF;

  -- ENTRE RONDAS (la vigente ya cerrada y queda una siguiente) no se crea nada: una tarjeta abierta ahí
  -- bloquearía "abrir la ronda siguiente", y startNextRound crea la de la siguiente para cada jugador aprobado.
  -- En la ÚLTIMA ronda (o un torneo de una ronda) sí se crea aunque las demás tarjetas estén cerradas: si no, el
  -- jugador agregado tarde quedaba sin tarjeta para siempre.
  -- "En juego" = alguna tarjeta ABIERTA de un jugador APROBADO (= contarTarjetasEnJuego de
  -- src/lib/data/tournaments/siguiente-ronda.ts). La tarjeta abierta de un retirado (WD) o descalificado (DQ) no
  -- cuenta: retirarse no la cierra (se preserva tal cual) y no puede dejar la ronda "en juego" para siempre.
  -- Estados de tarjeta cerrada = CLOSED_ROUND_STATUSES de src/golf/tournament-rounds.ts (canario).
  -- Nunca se crean tarjetas de rondas ANTERIORES que el jugador no jugó.
  IF v_vigente < v_total
     AND EXISTS (SELECT 1 FROM rounds WHERE tournament_id = p_tournament_id)
     AND NOT EXISTS (
       SELECT 1 FROM rounds r
       JOIN players pl ON pl.id = r.player_id
       WHERE r.tournament_id = p_tournament_id AND r.round_number = v_vigente
         AND r.status NOT IN ('closed', 'official')
         AND pl.status = 'approved'
     ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'round_not_in_play', 'round_number', v_vigente);
  END IF;

  INSERT INTO rounds (tournament_id, player_id, round_number, status)
  VALUES (p_tournament_id, p_player_id, v_vigente, 'in_progress')
  ON CONFLICT (tournament_id, player_id, round_number) DO NOTHING
  RETURNING id INTO v_round_id;

  IF v_round_id IS NULL THEN
    SELECT id INTO v_round_id FROM rounds
    WHERE tournament_id = p_tournament_id AND player_id = p_player_id AND round_number = v_vigente;
    RETURN jsonb_build_object('ok', true, 'round_id', v_round_id, 'round_number', v_vigente, 'creada', false);
  END IF;
  RETURN jsonb_build_object('ok', true, 'round_id', v_round_id, 'round_number', v_vigente, 'creada', true);
END;
$function$;
CREATE OR REPLACE FUNCTION public.backfill_handicap_de_inscripcion()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  n integer;
BEGIN
  UPDATE public.ronda_libre_jugadores rlj
     SET handicap_de_inscripcion = true
   WHERE rlj.handicap IS NOT NULL
     AND NOT rlj.handicap_de_inscripcion
     AND EXISTS (SELECT 1 FROM public.tournament_group_players tgp WHERE tgp.jugador_ronda_id = rlj.id);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$function$;
CREATE OR REPLACE FUNCTION public.calcular_indice_golfers(p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid            uuid := auth.uid();
  v_differentials  DECIMAL[];
  v_count          INTEGER;
  v_best           INTEGER;
  v_adjustment     NUMERIC;
  v_average        NUMERIC;
  v_index          DECIMAL(4,1);
BEGIN
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR session_user <> 'authenticator'
    OR (v_uid IS NOT NULL AND v_uid = p_user_id)
    OR (v_uid IS NOT NULL AND EXISTS (
      SELECT 1
      FROM ronda_libre_jugadores j
      JOIN rondas_libres r ON r.id = j.ronda_id
      WHERE j.user_id = p_user_id
        AND (
          r.creador_id = v_uid
          OR r.admin_user_id = v_uid
          OR EXISTS (SELECT 1 FROM ronda_libre_jugadores yo WHERE yo.ronda_id = r.id AND yo.user_id = v_uid)
        )
    ))
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN: no puede recalcular el índice de otro jugador' USING ERRCODE = '42501';
  END IF;

  SELECT ARRAY_AGG(diferencial ORDER BY diferencial ASC)
  INTO   v_differentials
  FROM (
    SELECT diferencial
    FROM   historical_rounds
    WHERE  user_id               = p_user_id
      AND  diferencial           IS NOT NULL
      AND  slope_rating          IS NOT NULL
      AND  course_rating         IS NOT NULL
      AND  excluded_from_handicap = FALSE
      AND  (total_gross IS NULL OR holes_played IS NULL OR total_gross >= 3 * holes_played)
    ORDER  BY played_at DESC, created_at DESC NULLS LAST, id DESC
    LIMIT  20
  ) sub;

  v_count := COALESCE(ARRAY_LENGTH(v_differentials, 1), 0);

  IF v_count < 3 THEN
    UPDATE profiles
    SET    indice_golfers            = NULL,
           indice_golfers_updated_at = NOW()
    WHERE  id = p_user_id;
    RETURN NULL;
  END IF;

  v_best := CASE
    WHEN v_count <= 5  THEN 1
    WHEN v_count <= 8  THEN 2
    WHEN v_count <= 11 THEN 3
    WHEN v_count <= 14 THEN 4
    WHEN v_count <= 16 THEN 5
    WHEN v_count <= 18 THEN 6
    WHEN v_count = 19  THEN 7
    ELSE 8
  END;

  v_adjustment := CASE
    WHEN v_count = 3 THEN -2.0
    WHEN v_count = 4 THEN -1.0
    WHEN v_count = 6 THEN -1.0
    ELSE 0
  END;

  SELECT AVG(d)
  INTO   v_average
  FROM   UNNEST(v_differentials[1:v_best]) AS d;

  v_index := ROUND(v_average + v_adjustment, 1);

  UPDATE profiles
  SET    indice_golfers            = v_index,
         indice_golfers_updated_at = NOW()
  WHERE  id = p_user_id;

  RETURN v_index;
END;
$function$;
CREATE OR REPLACE FUNCTION public.cleanup_old_e2e_runs()
 RETURNS TABLE(timed_out integer, deleted integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_timed_out int;
  v_deleted int;
BEGIN
  -- Marca como timeout los runs activos sin update en >30 min.
  -- Caso típico: workflow cancelado manualmente desde GH UI, callback
  -- perdido por error de red, o crash de runner.
  UPDATE public.e2e_runs
    SET status = 'timeout',
        finished_at = NOW(),
        error_message = COALESCE(error_message, '') ||
          E'\n[cleanup] Run estancado >30min sin update final. Marcado timeout automáticamente.'
    WHERE status IN ('queued', 'running')
      AND started_at < NOW() - INTERVAL '30 minutes';
  GET DIAGNOSTICS v_timed_out = ROW_COUNT;

  -- Borra runs terminales > 90 días. Mantiene historia reciente útil para
  -- diagnóstico, sin acumular gigas en jsonb.
  DELETE FROM public.e2e_runs
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND status IN ('passed', 'failed', 'error', 'cancelled', 'timeout');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_timed_out, v_deleted;
END;
$function$;
CREATE OR REPLACE FUNCTION public.colocar_inscrito_en_grupo(p_tournament_id uuid, p_player_id uuid, p_grupo_destino uuid, p_esperado jsonb, p_fila jsonb, p_equipos jsonb, p_politica jsonb, p_borrar_inscrito boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  -- Política del formato.
  v_equipo      boolean;
  v_compartida  boolean;
  v_match       boolean;
  v_pie_ret     boolean;
  v_min         integer;
  v_max         integer;
  v_jpm         integer;
  v_formato     text;
  v_equipos     jsonb := COALESCE(p_equipos, '[]'::jsonb);
  v_card        uuid;
  v_fmt         text;
  v_total_rondas integer;
  -- Estado bajo lock.
  v_tstatus     text;
  v_max_players integer;
  v_status      text;
  v_user_id     uuid;
  v_estado      text;   -- compite | retirado | sin-aprobar
  v_op          text;
  v_origen      uuid;
  v_o_card      uuid;
  v_d_card      uuid;
  v_cards       uuid[];
  v_grupos      uuid[];
  v_jrid        uuid;
  v_ins_golpes  boolean := false;
  v_o_miembros  integer := 0;
  v_o_filas     integer := 0;
  v_o_golpes    boolean := false;
  v_d_miembros  integer := 0;
  v_d_filas     integer := 0;
  v_d_golpes    boolean := false;
  v_quedan      integer;
  v_filas_q     integer;
  v_sale_m      integer;
  v_sale_f      integer;
  v_aprobado    boolean := false;
  v_retirados   integer := 0;
  v_ret_gp      uuid[];
  v_ret_jr      uuid[];
  v_eq_creado   boolean := false;
  v_eq_borrado  boolean := false;
  v_equipo_id   uuid;
  v_n           integer;
  v_e           jsonb;
  v_k           text;
  v_r           jsonb;
  c_fuera       CONSTANT text[] := ARRAY['withdrawn', 'disqualified'];  -- = JUGADOR_FUERA_STATUSES (tournament-status.ts)
BEGIN
  -- ── Forma de los parámetros ───────────────────────────────────────────────────────────────────────────────
  IF p_tournament_id IS NULL OR p_player_id IS NULL OR p_borrar_inscrito IS NULL THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_tournament_id, p_player_id y p_borrar_inscrito son obligatorios';
  END IF;
  IF (p_grupo_destino IS NULL) <> p_borrar_inscrito THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: sin grupo destino solo se borra (y borrar no lleva destino)';
  END IF;
  IF jsonb_typeof(p_politica) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_politica->'formato') IS DISTINCT FROM 'string'
     OR jsonb_typeof(p_politica->'equipo') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_politica->'bola_compartida') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_politica->'match_play') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_politica->'al_pie_con_retirado') IS DISTINCT FROM 'boolean'
     OR jsonb_typeof(p_politica->'jugadores_por_match') IS DISTINCT FROM 'number'
     OR jsonb_typeof(p_politica->'jugadores_por_equipo') NOT IN ('object', 'null') THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_politica mal formada';
  END IF;
  v_formato    := p_politica->>'formato';
  v_equipo     := (p_politica->>'equipo')::boolean;
  v_compartida := (p_politica->>'bola_compartida')::boolean;
  v_match      := (p_politica->>'match_play')::boolean;
  v_pie_ret    := (p_politica->>'al_pie_con_retirado')::boolean;
  v_jpm        := (p_politica->>'jugadores_por_match')::integer;
  IF v_equipo THEN
    IF jsonb_typeof(p_politica->'jugadores_por_equipo'->'min') IS DISTINCT FROM 'number'
       OR jsonb_typeof(p_politica->'jugadores_por_equipo'->'max') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_politica de equipo sin jugadores_por_equipo';
    END IF;
    v_min := (p_politica->'jugadores_por_equipo'->>'min')::integer;
    v_max := (p_politica->'jugadores_por_equipo'->>'max')::integer;
  ELSIF jsonb_typeof(p_politica->'jugadores_por_equipo') <> 'null' THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: jugadores_por_equipo fuera de un formato por equipos';
  END IF;
  IF COALESCE(v_formato, '') = '' OR v_jpm IS NULL OR v_jpm < 1 OR (v_equipo AND (v_min < 1 OR v_max < v_min))
     OR (v_compartida AND NOT v_equipo) OR (v_match AND v_equipo) OR (v_pie_ret AND NOT v_compartida) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_politica incoherente';
  END IF;
  IF jsonb_typeof(v_equipos) <> 'array' THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_equipos debe ser array';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_equipos) e
              WHERE jsonb_typeof(e) <> 'object' OR NOT (e ? 'group_id') OR NOT (e ? 'handicap_equipo')
                 OR NOT (e ? 'handicap_equipo_juego')
                 OR jsonb_typeof(e->'group_id') <> 'string'
                 OR jsonb_typeof(e->'handicap_equipo') NOT IN ('number', 'null')
                 OR jsonb_typeof(e->'handicap_equipo_juego') NOT IN ('number', 'null'))
     OR (SELECT count(*) FROM jsonb_array_elements(v_equipos))
        <> (SELECT count(DISTINCT e->>'group_id') FROM jsonb_array_elements(v_equipos) e) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_equipos mal formado o con grupos repetidos';
  END IF;
  IF p_fila IS NOT NULL AND (
       jsonb_typeof(p_fila) <> 'object'
       OR jsonb_typeof(p_fila->'nombre') IS DISTINCT FROM 'string' OR btrim(p_fila->>'nombre') = ''
       OR (p_fila ? 'handicap' AND jsonb_typeof(p_fila->'handicap') NOT IN ('number', 'null'))
       OR (p_fila ? 'handicap_de_inscripcion' AND jsonb_typeof(p_fila->'handicap_de_inscripcion') <> 'boolean')
       OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_fila) k WHERE k NOT IN ('nombre', 'handicap', 'handicap_de_inscripcion'))) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_fila mal formada';
  END IF;
  IF jsonb_typeof(p_esperado) IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_esperado->'inscrito') IS DISTINCT FROM 'object'
     OR NOT (p_esperado->'inscrito' ? 'status') OR NOT (p_esperado->'inscrito' ? 'handicap')
     OR NOT (p_esperado->'inscrito' ? 'grupo') OR NOT (p_esperado->'inscrito' ? 'tee_id')
     OR NOT (p_esperado->'inscrito' ? 'genero') OR NOT (p_esperado->'inscrito' ? 'category_id')
     OR jsonb_typeof(p_esperado->'grupos') IS DISTINCT FROM 'array'
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_esperado->'grupos') g
                 WHERE jsonb_typeof(g) <> 'object' OR jsonb_typeof(g->'group_id') IS DISTINCT FROM 'string'
                    OR jsonb_typeof(g->'ronda_libre_id') NOT IN ('string', 'null')
                    OR jsonb_typeof(g->'jugadores') IS DISTINCT FROM 'array'
                    OR EXISTS (SELECT 1 FROM jsonb_array_elements(g->'jugadores') j
                                WHERE jsonb_typeof(j) <> 'object' OR NOT (j ? 'player_id') OR NOT (j ? 'status')
                                   OR NOT (j ? 'handicap') OR NOT (j ? 'tee_id') OR NOT (j ? 'genero')
                                   OR NOT (j ? 'category_id'))) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_esperado mal formado';
  END IF;

  -- ── Locks 1-2: torneo ─────────────────────────────────────────────────────────────────────────────────────
  PERFORM pg_advisory_xact_lock(hashtextextended('grupos:' || p_tournament_id::text, 0));
  SELECT t.status, t.max_players, COALESCE(t.total_rounds, 1) INTO v_tstatus, v_max_players, v_total_rondas
    FROM public.tournaments t WHERE t.id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: el torneo % no existe', p_tournament_id;
  END IF;
  IF v_tstatus IS DISTINCT FROM 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'torneo-no-en-juego', 'ofrece_retirar', false);
  END IF;
  -- Varias rondas: cada ronda tiene sus tarjetas y el plan (#814) cubre solo torneos de una ronda.
  IF v_total_rondas > 1 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'torneo-varias-rondas', 'ofrece_retirar', false);
  END IF;

  -- Grupo de origen y tarjetas. Otros escritores de tournament_group_players: el inicio (startTournament enlaza
  -- con el torneo todavía open y lo pone in_progress al final, con un UPDATE que espera este lock), cancelar (solo
  -- draft/open, lo valida la ruta; no cambia el estado antes de borrar, pero nunca corre con el torneo in_progress)
  -- y la gestión de grupos del cliente (authenticated: los triggers grupos_fijos_* la cortan en juego). Ninguno
  -- escribe con el torneo in_progress, que esta RPC exige bajo FOR UPDATE.
  IF (SELECT count(*) FROM public.tournament_group_players gp WHERE gp.player_id = p_player_id) > 1 THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: el inscrito está en más de un grupo';
  END IF;
  SELECT gp.group_id INTO v_origen FROM public.tournament_group_players gp WHERE gp.player_id = p_player_id;
  IF v_origen IS NOT NULL AND v_origen IS NOT DISTINCT FROM p_grupo_destino THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'mismo-grupo', 'ofrece_retirar', false);
  END IF;
  v_op := CASE WHEN p_borrar_inscrito THEN 'borrar' WHEN v_origen IS NULL THEN 'agregar' ELSE 'mover' END;
  v_grupos := ARRAY(SELECT x FROM unnest(ARRAY[v_origen, p_grupo_destino]) x WHERE x IS NOT NULL);
  IF (SELECT count(*) FROM public.tournament_groups g WHERE g.id = ANY (v_grupos) AND g.tournament_id = p_tournament_id)
     <> cardinality(v_grupos) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: algún grupo no es del torneo';
  END IF;
  SELECT g.ronda_libre_id INTO v_o_card FROM public.tournament_groups g WHERE g.id = v_origen;
  SELECT g.ronda_libre_id INTO v_d_card FROM public.tournament_groups g WHERE g.id = p_grupo_destino;
  IF (v_origen IS NOT NULL AND v_o_card IS NULL) OR (p_grupo_destino IS NOT NULL AND v_d_card IS NULL) THEN
    -- Un grupo creado tras el inicio sin tarjeta (lo resuelve el PR4): no se toca hasta que la tenga.
    RETURN jsonb_build_object('ok', false, 'motivo', 'grupo-sin-tarjeta', 'ofrece_retirar', false);
  END IF;
  v_cards := ARRAY(SELECT x FROM unnest(ARRAY[v_o_card, v_d_card]) x WHERE x IS NOT NULL);

  -- ── Lock 3: tarjetas en curso ─────────────────────────────────────────────────────────────────────────────
  PERFORM 1 FROM public.rondas_libres rl WHERE rl.id = ANY (v_cards) ORDER BY rl.id FOR NO KEY UPDATE;
  IF EXISTS (SELECT 1 FROM public.rondas_libres rl WHERE rl.id = ANY (v_cards) AND rl.estado IS DISTINCT FROM 'en_curso') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tarjeta-cerrada', 'ofrece_retirar', false);
  END IF;
  -- La política tiene que ser la del torneo que armó estas tarjetas (`formatoDeLaTarjetaDelGrupo`).
  IF EXISTS (SELECT 1 FROM public.rondas_libres rl WHERE rl.id = ANY (v_cards)
              AND rl.formato_juego IS DISTINCT FROM v_formato AND NOT (v_match AND rl.formato_juego = 'stroke_play')) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_politica no es la del formato de las tarjetas';
  END IF;
  -- Timba y match_pairings: sus filas guardan la ronda; mover o borrar las dejaría apuntando mal. Falla cerrado.
  -- Timba: motivo (el organizador ve por qué). match_pairings: los torneos no los crean, así que es una corrupción.
  IF EXISTS (SELECT 1 FROM public.rondas_libres rl WHERE rl.id = ANY (v_cards) AND rl.reglas_juego IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.ronda_libre_puntitos x WHERE x.ronda_id = ANY (v_cards))
     OR EXISTS (SELECT 1 FROM public.ronda_libre_retiros x WHERE x.ronda_id = ANY (v_cards))
     OR EXISTS (SELECT 1 FROM public.ronda_libre_juego_orden x WHERE x.ronda_id = ANY (v_cards)) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tarjeta-con-timba', 'ofrece_retirar', false);
  END IF;
  IF EXISTS (SELECT 1 FROM public.match_pairings x WHERE x.ronda_id = ANY (v_cards)) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: la tarjeta tiene match_pairings';
  END IF;

  -- ── Lock 4: players ───────────────────────────────────────────────────────────────────────────────────────
  PERFORM 1 FROM public.players p
   WHERE p.id = p_player_id
      OR p.id IN (SELECT gp.player_id FROM public.tournament_group_players gp WHERE gp.group_id = ANY (v_grupos))
   ORDER BY p.id FOR NO KEY UPDATE;
  SELECT p.status, p.user_id INTO v_status, v_user_id
    FROM public.players p WHERE p.id = p_player_id AND p.tournament_id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflicto', 'ofrece_retirar', false);
  END IF;

  -- Su tarjeta individual (`rounds`) FOR UPDATE: un golpe que /api/game guarda en hole_scores toma FOR KEY SHARE
  -- de esa fila (FK), así que espera a esta transacción o esta espera a él y después lo ve (#828).
  PERFORM 1 FROM public.rounds r WHERE r.tournament_id = p_tournament_id AND r.player_id = p_player_id
   ORDER BY r.id FOR UPDATE;

  -- ── Locks 5-6: filas de tarjeta y equipos ─────────────────────────────────────────────────────────────────
  PERFORM 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = ANY (v_cards) ORDER BY j.id FOR UPDATE;
  PERFORM 1 FROM public.ronda_equipos re WHERE re.ronda_id = ANY (v_cards) ORDER BY re.id FOR UPDATE;

  -- ── Control optimista ─────────────────────────────────────────────────────────────────────────────────────
  IF (p_esperado->'inscrito'->>'status') IS DISTINCT FROM v_status
     OR (p_esperado->'inscrito'->>'grupo')::uuid IS DISTINCT FROM v_origen
     OR jsonb_build_object('handicap', p_esperado->'inscrito'->'handicap', 'tee_id', p_esperado->'inscrito'->'tee_id',
                           'genero', p_esperado->'inscrito'->'genero', 'category_id', p_esperado->'inscrito'->'category_id')
        IS DISTINCT FROM
        (SELECT jsonb_build_object('handicap', COALESCE(to_jsonb(p.handicap_at_registration), 'null'::jsonb),
                                   'tee_id', COALESCE(to_jsonb(p.tee_id), 'null'::jsonb),
                                   'genero', COALESCE(to_jsonb(p.genero), 'null'::jsonb),
                                   'category_id', COALESCE(to_jsonb(p.category_id), 'null'::jsonb))
           FROM public.players p WHERE p.id = p_player_id)
     OR jsonb_array_length(p_esperado->'grupos') <> cardinality(v_grupos)
     OR EXISTS (
          SELECT 1 FROM unnest(v_grupos) gid
           WHERE NOT EXISTS (
             SELECT 1 FROM jsonb_array_elements(p_esperado->'grupos') eg
              WHERE (eg->>'group_id')::uuid = gid
                AND (eg->>'ronda_libre_id')::uuid IS NOT DISTINCT FROM (SELECT g.ronda_libre_id FROM public.tournament_groups g WHERE g.id = gid)
                AND COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', (j->>'player_id')::uuid, 'status', j->'status', 'handicap', j->'handicap',
                                                                  'tee_id', j->'tee_id', 'genero', j->'genero', 'category_id', j->'category_id')
                                               ORDER BY (j->>'player_id')::uuid)
                                FROM jsonb_array_elements(eg->'jugadores') j), '[]'::jsonb)
                    = COALESCE((SELECT jsonb_agg(jsonb_build_object('player_id', p.id, 'status', to_jsonb(p.status),
                                                                    'handicap', COALESCE(to_jsonb(p.handicap_at_registration), 'null'::jsonb),
                                                                    'tee_id', COALESCE(to_jsonb(p.tee_id), 'null'::jsonb),
                                                                    'genero', COALESCE(to_jsonb(p.genero), 'null'::jsonb),
                                                                    'category_id', COALESCE(to_jsonb(p.category_id), 'null'::jsonb))
                                                 ORDER BY p.id)
                                  FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
                                 WHERE gp.group_id = gid), '[]'::jsonb))) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflicto', 'ofrece_retirar', false);
  END IF;

  -- Cada fila de las tarjetas tocadas es de exactamente un inscrito de su grupo (si no, los conteos mienten).
  IF EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j
              JOIN public.tournament_groups g ON g.ronda_libre_id = j.ronda_id
             WHERE j.ronda_id = ANY (v_cards)
               AND (SELECT count(*) FROM public.tournament_group_players gp
                     WHERE gp.jugador_ronda_id = j.id AND gp.group_id = g.id) <> 1) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: una tarjeta tocada tiene filas sin inscrito de su grupo';
  END IF;
  IF v_compartida AND EXISTS (SELECT 1 FROM public.ronda_equipos re WHERE re.ronda_id = ANY (v_cards)
                               GROUP BY re.ronda_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: una tarjeta tiene más de un equipo';
  END IF;

  -- ── Estado, bajo lock ─────────────────────────────────────────────────────────────────────────────────────
  -- `estadoDelInscrito`.
  v_estado := CASE WHEN v_status = ANY (c_fuera) THEN 'retirado'
                   WHEN v_status = 'approved' THEN 'compite' ELSE 'sin-aprobar' END;
  SELECT gp.jugador_ronda_id INTO v_jrid FROM public.tournament_group_players gp WHERE gp.player_id = p_player_id;
  IF v_jrid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.id = v_jrid AND j.ronda_id = v_o_card) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: la fila del inscrito no es de la tarjeta de su grupo';
  END IF;
  IF v_estado = 'sin-aprobar' AND v_jrid IS NOT NULL THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: un inscrito sin aprobar tiene fila de tarjeta';
  END IF;
  -- Un WD/DQ puede no tener fila (se retiró antes del inicio y no se materializó); uno que compite, no.
  IF v_estado = 'compite' AND v_origen IS NOT NULL AND v_jrid IS NULL THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: inscrito que compite en un grupo con tarjeta sin fila enlazada';
  END IF;

  -- InscritoAColocar.tieneGolpes: su fila del grupo y, sin grupo, su tarjeta individual del torneo (#828). Al
  -- borrar se mira la individual SIEMPRE (falla cerrado: borrar `players` arrastra sus rounds y hole_scores).
  -- Cualquier fila de hole_scores cuenta como anotación.
  v_ins_golpes := COALESCE((SELECT public.tarjeta_tiene_anotaciones(j.scores) FROM public.ronda_libre_jugadores j WHERE j.id = v_jrid), false)
    OR ((v_origen IS NULL OR v_op = 'borrar') AND EXISTS (
          SELECT 1 FROM public.hole_scores hs JOIN public.rounds r ON r.id = hs.round_id
           WHERE r.tournament_id = p_tournament_id AND r.player_id = p_player_id));

  -- GrupoEnJuego de origen y destino: miembros = aprobados del grupo; filas = de su tarjeta; golpes = los del
  -- equipo en bola compartida, los de cualquier fila (también WD/DQ) en el resto.
  IF v_origen IS NOT NULL THEN
    SELECT count(*) INTO v_o_miembros FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
     WHERE gp.group_id = v_origen AND p.status = 'approved';
    SELECT count(*) INTO v_o_filas FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_o_card;
    v_o_golpes := CASE WHEN v_compartida
      THEN EXISTS (SELECT 1 FROM public.ronda_equipos re WHERE re.ronda_id = v_o_card AND public.tarjeta_tiene_anotaciones(re.scores))
      ELSE EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_o_card AND public.tarjeta_tiene_anotaciones(j.scores)) END;
  END IF;
  IF p_grupo_destino IS NOT NULL THEN
    SELECT count(*) INTO v_d_miembros FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
     WHERE gp.group_id = p_grupo_destino AND p.status = 'approved';
    SELECT count(*) INTO v_d_filas FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_d_card;
    v_d_golpes := CASE WHEN v_compartida
      THEN EXISTS (SELECT 1 FROM public.ronda_equipos re WHERE re.ronda_id = v_d_card AND public.tarjeta_tiene_anotaciones(re.scores))
      ELSE EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_d_card AND public.tarjeta_tiene_anotaciones(j.scores)) END;
  END IF;

  -- ── Motivos: espejo de `motivoParaNoColocar`, en el mismo orden ───────────────────────────────────────────
  -- D11.
  IF v_op <> 'borrar' AND v_estado = 'retirado' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'retirado-no-se-mueve', 'ofrece_retirar', false);
  END IF;
  -- #828: sus golpes viven en su tarjeta individual.
  IF v_op = 'agregar' AND v_ins_golpes THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'agregar-con-tarjeta-individual', 'ofrece_retirar', false);
  END IF;
  IF v_op = 'borrar' AND v_estado = 'sin-aprobar' THEN
    IF v_ins_golpes THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'borrar-con-golpes', 'ofrece_retirar', false);
    END IF;
  ELSIF v_op = 'borrar' THEN
    -- D1 (en bola compartida los golpes son del equipo) y D8.
    IF v_ins_golpes OR (v_compartida AND v_o_golpes) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'borrar-con-golpes', 'ofrece_retirar', v_estado = 'compite');
    END IF;
    IF v_match AND v_o_golpes THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'borrar-match-en-juego', 'ofrece_retirar', v_estado = 'compite');
    END IF;
  END IF;

  IF NOT (v_op = 'borrar' AND v_estado = 'sin-aprobar') THEN
    IF v_match AND p_grupo_destino IS NOT NULL THEN
      IF v_d_filas + 1 > v_jpm THEN  -- D10
        RETURN jsonb_build_object('ok', false, 'motivo', 'match-play-grupo-lleno', 'ofrece_retirar', false);
      END IF;
      IF v_o_golpes OR v_d_golpes THEN  -- D6
        RETURN jsonb_build_object('ok', false, 'motivo', 'match-play-con-golpes', 'ofrece_retirar', false);
      END IF;
    END IF;
    -- D2.
    IF v_equipo AND NOT v_compartida AND v_op = 'mover' AND (v_o_golpes OR v_d_golpes) THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'mejor-bola-con-golpes', 'ofrece_retirar', false);
    END IF;

    IF v_equipo THEN
      v_sale_m := CASE WHEN v_estado = 'compite' THEN 1 ELSE 0 END;
      v_sale_f := CASE WHEN v_jrid IS NULL THEN 0 ELSE 1 END;  -- sin aprobar, o WD/DQ sin fila
      IF p_grupo_destino IS NOT NULL THEN
        v_quedan := v_d_miembros + 1;
        IF v_quedan > v_max THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'equipo-lleno', 'ofrece_retirar', false);
        END IF;
        -- `equipoAlPie` por conteos y, en mejor bola, `estadoDelEquipoMejorBola` sobre la tarjeta real: un hoyo con
        -- golpes (> 0, `hoyoConGolpes`) de un DQ que ningún compañero no-DQ cubre deja al bando DQ.
        IF v_d_golpes AND (
             (v_pie_ret AND v_d_filas > v_d_miembros)
             OR (NOT v_compartida AND v_d_miembros = 0 AND v_d_filas > 0)
             OR (NOT v_compartida AND EXISTS (
                   SELECT 1
                     FROM public.ronda_libre_jugadores dq
                     JOIN public.tournament_group_players gq ON gq.jugador_ronda_id = dq.id
                     JOIN public.players pq ON pq.id = gq.player_id AND pq.status = 'disqualified'
                     CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(dq.scores) = 'object' THEN dq.scores ELSE '{}'::jsonb END) h
                    WHERE dq.ronda_id = v_d_card
                      AND jsonb_typeof(h.value) = 'number' AND (h.value)::numeric > 0
                      AND NOT EXISTS (
                        SELECT 1 FROM public.ronda_libre_jugadores ok
                          JOIN public.tournament_group_players gk ON gk.jugador_ronda_id = ok.id
                          JOIN public.players pk ON pk.id = gk.player_id AND pk.status IS DISTINCT FROM 'disqualified'
                         WHERE ok.ronda_id = v_d_card AND jsonb_typeof(ok.scores) = 'object'
                           AND jsonb_typeof(ok.scores->h.key) = 'number' AND (ok.scores->>h.key)::numeric > 0)))) THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'equipo-al-pie', 'ofrece_retirar', false);
        END IF;
        IF v_compartida AND v_d_golpes AND v_quedan < v_min THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'equipo-con-golpes-incompleto', 'ofrece_retirar', false);
        END IF;
      END IF;
      IF v_origen IS NOT NULL THEN
        v_quedan := v_o_miembros - v_sale_m;
        v_filas_q := v_o_filas - v_sale_f;
        IF v_o_golpes AND v_sale_f > 0 AND v_filas_q <= 0 THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'equipo-con-golpes-sin-miembros', 'ofrece_retirar', false);
        END IF;
        IF v_o_golpes AND v_sale_m > 0 AND v_quedan < (CASE WHEN v_compartida THEN v_min ELSE 1 END) THEN
          RETURN jsonb_build_object('ok', false, 'motivo', 'equipo-con-golpes-incompleto', 'ofrece_retirar', false);
        END IF;
      END IF;
    END IF;
  END IF;

  -- D12: colocar a un sin aprobar lo aprueba. Ocupa cupo como un alta (`enroll_player`, "bloquear + ampliar"):
  -- sobre el cupo no entra; el organizador amplía max_players. Falla cerrado.
  IF v_op <> 'borrar' AND v_estado = 'sin-aprobar' THEN
    IF v_max_players IS NOT NULL AND v_max_players > 0
       AND (SELECT count(*) FROM public.players p WHERE p.tournament_id = p_tournament_id AND p.status = 'approved') >= v_max_players THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'cupo-lleno', 'ofrece_retirar', false);
    END IF;
  END IF;

  -- ── Escrituras ────────────────────────────────────────────────────────────────────────────────────────────
  IF v_op = 'borrar' THEN
    IF p_fila IS NOT NULL THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: borrar no lleva p_fila';
    END IF;
    DELETE FROM public.tournament_group_players gp WHERE gp.player_id = p_player_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> (CASE WHEN v_origen IS NULL THEN 0 ELSE 1 END) THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: tournament_group_players borró % filas', v_n;
    END IF;
    IF v_jrid IS NOT NULL THEN
      DELETE FROM public.ronda_libre_jugadores j WHERE j.id = v_jrid AND j.ronda_id = v_o_card;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: la fila de tarjeta borró % filas', v_n;
      END IF;
    END IF;
    DELETE FROM public.players p WHERE p.id = p_player_id AND p.tournament_id = p_tournament_id;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: players borró % filas', v_n;
    END IF;
  ELSE
    -- D12.
    IF v_estado = 'sin-aprobar' THEN
      UPDATE public.players p SET status = 'approved', status_changed_at = now()
       WHERE p.id = p_player_id AND p.status = v_status;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: la aprobación actualizó % filas', v_n;
      END IF;
      v_aprobado := true;
    END IF;

    -- D13 (solo foursome, `al_pie_con_retirado`, como dice el plan): una pareja SIN golpes que se completa suelta
    -- TODAS sus filas WD/DQ (salen del grupo y de la tarjeta; la inscripción queda, retirada y sin grupo). Si
    -- quedara alguna, `estadoDelEquipoFoursome` mandaría la pareja al pie. En scramble y mejor bola el WD/DQ
    -- conserva su fila (comportamiento de hoy; cambiarlo es decisión de producto).
    IF v_pie_ret AND NOT v_d_golpes AND v_d_miembros + 1 >= v_min THEN
      SELECT COALESCE(array_agg(gp.id), '{}'), COALESCE(array_agg(gp.jugador_ronda_id) FILTER (WHERE gp.jugador_ronda_id IS NOT NULL), '{}')
        INTO v_ret_gp, v_ret_jr
        FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
       WHERE gp.group_id = p_grupo_destino AND p.status = ANY (c_fuera);
      v_retirados := cardinality(v_ret_gp);
      -- Sin golpes en el equipo, ninguna fila WD/DQ puede tener anotaciones; si las tiene, algo no calza: aborta.
      IF EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j
                  WHERE j.id = ANY (v_ret_jr) AND public.tarjeta_tiene_anotaciones(j.scores)) THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: D13 iba a borrar una fila WD/DQ con anotaciones';
      END IF;
      IF v_retirados > 0 THEN
        DELETE FROM public.tournament_group_players gp WHERE gp.id = ANY (v_ret_gp);
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n <> v_retirados THEN
          RAISE EXCEPTION 'colocar_inscrito_en_grupo: D13 sacó % de % retirados del grupo', v_n, v_retirados;
        END IF;
        DELETE FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_d_card AND j.id = ANY (v_ret_jr);
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n <> cardinality(v_ret_jr) THEN
          RAISE EXCEPTION 'colocar_inscrito_en_grupo: D13 borró % de % filas de retirados', v_n, cardinality(v_ret_jr);
        END IF;
      END IF;
    END IF;

    -- La fila del inscrito: la suya viaja (mover); si no tiene, se crea (agregar, o D12).
    IF v_jrid IS NOT NULL THEN
      IF p_fila IS NOT NULL THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_fila para un inscrito que ya tiene fila';
      END IF;
      UPDATE public.ronda_libre_jugadores j SET ronda_id = v_d_card WHERE j.id = v_jrid AND j.ronda_id = v_o_card;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: mover la fila actualizó % filas', v_n;
      END IF;
    ELSE
      IF p_fila IS NULL THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: falta p_fila para crear la fila del inscrito';
      END IF;
      INSERT INTO public.ronda_libre_jugadores (ronda_id, nombre, user_id, handicap, handicap_de_inscripcion, scores)
      VALUES (v_d_card, btrim(p_fila->>'nombre'), v_user_id, (p_fila->>'handicap')::numeric,
              COALESCE((p_fila->>'handicap_de_inscripcion')::boolean, false), '{}'::jsonb)
      RETURNING id INTO v_jrid;
    END IF;

    IF v_origen IS NOT NULL THEN
      UPDATE public.tournament_group_players gp SET group_id = p_grupo_destino, jugador_ronda_id = v_jrid
       WHERE gp.player_id = p_player_id AND gp.group_id = v_origen;
    ELSE
      INSERT INTO public.tournament_group_players (group_id, player_id, jugador_ronda_id)
      VALUES (p_grupo_destino, p_player_id, v_jrid);
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: tournament_group_players escribió % filas', v_n;
    END IF;

    -- Equipo destino: el grupo es el equipo (`materializeGroupScorecard`); si la tarjeta no lo tenía, se crea.
    IF v_equipo THEN
      SELECT re.id INTO v_equipo_id FROM public.ronda_equipos re WHERE re.ronda_id = v_d_card;
      IF v_equipo_id IS NULL THEN
        INSERT INTO public.ronda_equipos (ronda_id, nombre, scores)
        SELECT v_d_card, g.name, '{}'::jsonb FROM public.tournament_groups g WHERE g.id = p_grupo_destino
        RETURNING id INTO v_equipo_id;
        v_eq_creado := true;
      END IF;
      DELETE FROM public.ronda_equipo_jugadores rej WHERE rej.jugador_id = v_jrid;
      INSERT INTO public.ronda_equipo_jugadores (equipo_id, jugador_id, orden)
      SELECT v_equipo_id, v_jrid, COALESCE(max(rej.orden) + 1, 0)
        FROM public.ronda_equipo_jugadores rej WHERE rej.equipo_id = v_equipo_id;
    END IF;

    -- D12: su tarjeta individual (`rounds`), como cualquier aprobado (`ensureRound1Cards`).
    IF v_aprobado THEN
      v_r := public.asegurar_tarjeta_vigente(p_tournament_id, p_player_id);
      IF (v_r->>'ok')::boolean IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: asegurar_tarjeta_vigente: %', v_r;
      END IF;
    END IF;
  END IF;

  -- Equipo de origen sin filas: si no tiene golpes se borra; con golpes no puede pasar (motivo de arriba).
  IF v_equipo AND v_o_card IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_o_card) THEN
    IF v_o_golpes THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: un equipo con golpes quedaría sin miembros';
    END IF;
    DELETE FROM public.ronda_equipos re WHERE re.ronda_id = v_o_card;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_eq_borrado := v_n > 0;
  END IF;

  -- Hándicap de los equipos que quedan con filas: exactamente los grupos tocados con filas.
  IF v_equipo THEN
    IF (SELECT count(*) FROM jsonb_array_elements(v_equipos)) <>
       (SELECT count(*) FROM unnest(v_grupos) gid
         WHERE EXISTS (SELECT 1 FROM public.tournament_groups g JOIN public.ronda_libre_jugadores j ON j.ronda_id = g.ronda_libre_id
                        WHERE g.id = gid))
       OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_equipos) e
                   WHERE NOT ((e->>'group_id')::uuid = ANY (v_grupos))) THEN
      RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_equipos no trae exactamente los equipos tocados con filas';
    END IF;
    FOR v_e IN SELECT e FROM jsonb_array_elements(v_equipos) e LOOP
      -- Bola compartida: con >= min que compiten el hándicap es obligatorio. Mejor bola: siempre null.
      SELECT count(*) INTO v_n FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
       WHERE gp.group_id = (v_e->>'group_id')::uuid AND p.status = 'approved';
      IF (v_compartida AND v_n >= v_min AND (jsonb_typeof(v_e->'handicap_equipo') = 'null' OR jsonb_typeof(v_e->'handicap_equipo_juego') = 'null'))
         OR (NOT v_compartida AND (jsonb_typeof(v_e->'handicap_equipo') <> 'null' OR jsonb_typeof(v_e->'handicap_equipo_juego') <> 'null')) THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: hándicap de equipo inválido para el grupo %', v_e->>'group_id';
      END IF;
      UPDATE public.ronda_equipos re
         SET handicap_equipo = (v_e->>'handicap_equipo')::numeric,
             handicap_equipo_juego = (v_e->>'handicap_equipo_juego')::smallint
       WHERE re.ronda_id = (SELECT g.ronda_libre_id FROM public.tournament_groups g WHERE g.id = (v_e->>'group_id')::uuid);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE EXCEPTION 'colocar_inscrito_en_grupo: el equipo del grupo % actualizó % filas', v_e->>'group_id', v_n;
      END IF;
    END LOOP;
  ELSIF jsonb_array_length(v_equipos) > 0 THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: p_equipos fuera de un formato por equipos';
  END IF;

  -- Formato de las tarjetas (match play: un par anota match, otro tamaño stroke play; espejo de
  -- `formatoDeLaTarjetaDelGrupo`). Lo decide la RPC con el conteo final de filas. Una tarjeta sin filas queda como
  -- está (nadie anota; al llegar alguien se recalcula). Una con anotaciones nunca cambia (D6/D8 lo impiden antes).
  IF v_match THEN
    FOREACH v_card IN ARRAY v_cards LOOP
      SELECT count(*) INTO v_n FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_card;
      CONTINUE WHEN v_n = 0;
      v_fmt := CASE WHEN v_n = v_jpm THEN v_formato ELSE 'stroke_play' END;
      IF (SELECT rl.formato_juego FROM public.rondas_libres rl WHERE rl.id = v_card) IS DISTINCT FROM v_fmt THEN
        IF EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_card AND public.tarjeta_tiene_anotaciones(j.scores)) THEN
          RAISE EXCEPTION 'colocar_inscrito_en_grupo: no se cambia el formato de una tarjeta con anotaciones';
        END IF;
        UPDATE public.rondas_libres rl SET formato_juego = v_fmt WHERE rl.id = v_card;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n <> 1 THEN
          RAISE EXCEPTION 'colocar_inscrito_en_grupo: no se pudo fijar el formato de la tarjeta %', v_card;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ── Invariantes de cada grupo tocado (aborta si alguna falla) ─────────────────────────────────────────────
  -- integrantes >= miembros; cada aprobado del grupo enlazado a una fila de SU tarjeta; ninguna fila suelta.
  IF EXISTS (SELECT 1 FROM public.tournament_group_players gp
               JOIN public.tournament_groups g ON g.id = gp.group_id
               JOIN public.players p ON p.id = gp.player_id
              WHERE gp.group_id = ANY (v_grupos)
                AND (p.status = 'approved' OR gp.jugador_ronda_id IS NOT NULL)
                AND NOT EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j
                                 WHERE j.id = gp.jugador_ronda_id AND j.ronda_id = g.ronda_libre_id))
     OR EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j
                 JOIN public.tournament_groups g ON g.ronda_libre_id = j.ronda_id
                WHERE j.ronda_id = ANY (v_cards)
                  AND (SELECT count(*) FROM public.tournament_group_players gp
                        WHERE gp.jugador_ronda_id = j.id AND gp.group_id = g.id) <> 1) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: quedó un inscrito o una fila sin enlazar';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_grupos) gid
              JOIN public.tournament_groups g ON g.id = gid
             WHERE (SELECT count(*) FROM public.ronda_libre_jugadores j WHERE j.ronda_id = g.ronda_libre_id)
                 < (SELECT count(*) FROM public.tournament_group_players gp JOIN public.players p ON p.id = gp.player_id
                     WHERE gp.group_id = gid AND p.status = 'approved')) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: un grupo quedó con menos filas que jugadores que compiten';
  END IF;
  IF v_equipo AND EXISTS (
       SELECT 1 FROM unnest(v_cards) c
        WHERE (SELECT count(*) FROM public.ronda_equipos re WHERE re.ronda_id = c)
              <> CASE WHEN EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = c) THEN 1 ELSE 0 END
           OR EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = c
                       AND (SELECT count(*) FROM public.ronda_equipo_jugadores rej
                              JOIN public.ronda_equipos re ON re.id = rej.equipo_id AND re.ronda_id = c
                             WHERE rej.jugador_id = j.id) <> 1)
           OR EXISTS (SELECT 1 FROM public.ronda_equipo_jugadores rej
                        JOIN public.ronda_equipos re ON re.id = rej.equipo_id AND re.ronda_id = c
                        JOIN public.ronda_libre_jugadores j ON j.id = rej.jugador_id
                       WHERE j.ronda_id IS DISTINCT FROM c)) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: un equipo quedó con miembros que no son las filas de su tarjeta';
  END IF;
  IF v_match AND v_d_card IS NOT NULL
     AND (SELECT count(*) FROM public.ronda_libre_jugadores j WHERE j.ronda_id = v_d_card) > v_jpm THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: un grupo de match play quedó con más de % jugadores', v_jpm;
  END IF;
  -- Cada tarjeta tocada con filas anota en el formato que le toca: el del torneo, o stroke play si es match play y
  -- no es un par.
  IF EXISTS (SELECT 1 FROM public.rondas_libres rl
              WHERE rl.id = ANY (v_cards)
                AND EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j WHERE j.ronda_id = rl.id)
                AND rl.formato_juego IS DISTINCT FROM
                    CASE WHEN v_match AND (SELECT count(*) FROM public.ronda_libre_jugadores j WHERE j.ronda_id = rl.id) <> v_jpm
                         THEN 'stroke_play' ELSE v_formato END) THEN
    RAISE EXCEPTION 'colocar_inscrito_en_grupo: una tarjeta tocada quedó con un formato que no es el suyo';
  END IF;

  RETURN jsonb_build_object('ok', true, 'operacion', v_op, 'jugador_ronda_id', CASE WHEN v_op = 'borrar' THEN NULL ELSE v_jrid END,
                            'aprobado', v_aprobado, 'retirados_quitados', v_retirados,
                            'equipo_creado', v_eq_creado, 'equipo_borrado', v_eq_borrado);
END;
$function$;
CREATE OR REPLACE FUNCTION public.course_name_canonical_ordered(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT array_to_string(course_name_tokens(p_name), ' ')
$function$;
CREATE OR REPLACE FUNCTION public.course_name_canonical(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT array_to_string(
    ARRAY(SELECT unnest(course_name_tokens(p_name)) ORDER BY 1), ' '
  )
$function$;
CREATE OR REPLACE FUNCTION public.course_name_tokens(p_name text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT COALESCE(array_agg(tok ORDER BY ord), ARRAY[]::text[])
  FROM (
    SELECT tok, ord
    FROM unnest(
      string_to_array(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              lower(unaccent_immutable(coalesce(p_name, ''))),
              '\y(varones|damas|caballeros)\y', ' ', 'g'  -- quitar género
            ),
            '[^a-z0-9]+', ' ', 'g'                        -- puntuación → espacio
          ),
          '\s+', ' ', 'g'
        ),
        ' '
      )
    ) WITH ORDINALITY AS u(tok, ord)
    WHERE length(tok) > 1
      AND tok NOT IN (
        'club','de','golf','las','los','la','el','del','y',
        'country','campo','and','the','links','course','cg',
        '18','9','hole','holes','hoyos'
      )
  ) t
$function$;
CREATE OR REPLACE FUNCTION public.descartar_ronda_libre(p_codigo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_creador uuid;
  v_es_demo boolean;
BEGIN
  SELECT id, creador_id, es_demo INTO v_id, v_creador, v_es_demo
  FROM public.rondas_libres
  WHERE codigo = p_codigo
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo OR auth.uid() IS NULL OR v_creador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_groups g WHERE g.ronda_libre_id = v_id) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda de torneo';
  END IF;

  BEGIN
    DELETE FROM public.rondas_libres WHERE id = v_id;
  EXCEPTION WHEN foreign_key_violation THEN
    -- p. ej. taiger_sessions (NO ACTION): la ronda tiene datos asociados.
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda con datos asociados';
  END;
END;
$function$;
CREATE OR REPLACE FUNCTION public.editar_handicap_inscrito(p_player_id uuid, p_esperado numeric, p_valor numeric, p_tocar_tarjeta boolean, p_handicap_tarjeta numeric, p_base jsonb, p_equipos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_base       jsonb := COALESCE(p_base, '[]'::jsonb);
  v_equipos    jsonb := COALESCE(p_equipos, '[]'::jsonb);
  v_ids        uuid[];
  v_bloqueados integer;
  v_torneo     uuid;
  v_esperadas  integer;
  v_n          integer;
  v_tarjetas   integer := 0;
  v_e          jsonb;
BEGIN
  -- Forma de los parámetros.
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: p_player_id es null';
  END IF;
  IF p_tocar_tarjeta IS NULL THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: p_tocar_tarjeta es null';
  END IF;
  IF NOT p_tocar_tarjeta AND p_handicap_tarjeta IS NOT NULL THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: p_handicap_tarjeta sin p_tocar_tarjeta';
  END IF;
  IF jsonb_typeof(v_base) <> 'array' OR jsonb_typeof(v_equipos) <> 'array' THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: p_base y p_equipos deben ser arrays';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_base) b
              WHERE jsonb_typeof(b) <> 'object' OR NOT (b ? 'player_id') OR NOT (b ? 'esperado')
                 OR jsonb_typeof(b->'player_id') <> 'string'
                 OR jsonb_typeof(b->'esperado') NOT IN ('number', 'null')) THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: entrada de p_base mal formada';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_equipos) e
              WHERE jsonb_typeof(e) <> 'object' OR NOT (e ? 'equipo_id') OR NOT (e ? 'handicap_equipo')
                 OR NOT (e ? 'handicap_equipo_juego')
                 OR jsonb_typeof(e->'equipo_id') <> 'string'
                 OR jsonb_typeof(e->'handicap_equipo') NOT IN ('number', 'null')
                 OR jsonb_typeof(e->'handicap_equipo_juego') NOT IN ('number', 'null')) THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: entrada de p_equipos mal formada';
  END IF;

  -- El editado más la base, sin repetidos.
  v_ids := ARRAY(SELECT (b->>'player_id')::uuid FROM jsonb_array_elements(v_base) b) || p_player_id;
  IF cardinality(v_ids) <> (SELECT count(DISTINCT x) FROM unnest(v_ids) x) THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: player repetido en p_base (o el editado está en p_base)';
  END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(v_equipos) e)
     <> (SELECT count(DISTINCT (e->>'equipo_id')::uuid) FROM jsonb_array_elements(v_equipos) e) THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: equipo repetido en p_equipos';
  END IF;

  -- Bloqueo en orden fijo (dos ediciones simultáneas de compañeros no se cruzan en deadlock).
  PERFORM 1 FROM public.players p WHERE p.id = ANY (v_ids) ORDER BY p.id FOR NO KEY UPDATE;
  GET DIAGNOSTICS v_bloqueados = ROW_COUNT;
  IF v_bloqueados <> cardinality(v_ids) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflicto');
  END IF;

  SELECT p.tournament_id INTO v_torneo FROM public.players p WHERE p.id = p_player_id;
  IF EXISTS (SELECT 1 FROM public.players p WHERE p.id = ANY (v_ids) AND p.tournament_id IS DISTINCT FROM v_torneo) THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: p_base trae un jugador de otro torneo';
  END IF;

  -- Control optimista: todo lo que el plan leyó sigue igual.
  IF NOT EXISTS (SELECT 1 FROM public.players p
                  WHERE p.id = p_player_id AND p.handicap_at_registration IS NOT DISTINCT FROM p_esperado)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_base) b
                  JOIN public.players p ON p.id = (b->>'player_id')::uuid
                 WHERE p.handicap_at_registration IS DISTINCT FROM (b->>'esperado')::numeric) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'conflicto');
  END IF;

  -- Escrituras.
  UPDATE public.players SET handicap_at_registration = p_valor WHERE id = p_player_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'editar_handicap_inscrito: players actualizó % filas (esperaba 1)', v_n;
  END IF;

  IF p_tocar_tarjeta THEN
    SELECT count(DISTINCT tgp.jugador_ronda_id) INTO v_esperadas
      FROM public.tournament_group_players tgp
     WHERE tgp.player_id = p_player_id AND tgp.jugador_ronda_id IS NOT NULL;
    IF v_esperadas = 0 THEN
      RAISE EXCEPTION 'editar_handicap_inscrito: p_tocar_tarjeta sin tarjeta enlazada';
    END IF;
    UPDATE public.ronda_libre_jugadores rlj
       SET handicap = p_handicap_tarjeta, handicap_de_inscripcion = true
     WHERE rlj.id IN (SELECT tgp.jugador_ronda_id FROM public.tournament_group_players tgp
                       WHERE tgp.player_id = p_player_id AND tgp.jugador_ronda_id IS NOT NULL);
    GET DIAGNOSTICS v_tarjetas = ROW_COUNT;
    IF v_tarjetas <> v_esperadas THEN
      RAISE EXCEPTION 'editar_handicap_inscrito: tarjeta actualizó % filas (esperaba %)', v_tarjetas, v_esperadas;
    END IF;
  END IF;

  FOR v_e IN SELECT e FROM jsonb_array_elements(v_equipos) e LOOP
    UPDATE public.ronda_equipos re
       SET handicap_equipo = (v_e->>'handicap_equipo')::numeric,
           handicap_equipo_juego = (v_e->>'handicap_equipo_juego')::smallint
     WHERE re.id = (v_e->>'equipo_id')::uuid
       AND EXISTS (SELECT 1 FROM public.tournament_groups tg
                    WHERE tg.ronda_libre_id = re.ronda_id AND tg.tournament_id = v_torneo);
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'editar_handicap_inscrito: el equipo % no es de un grupo del torneo (% filas)',
        v_e->>'equipo_id', v_n;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'tarjetas', v_tarjetas, 'equipos', jsonb_array_length(v_equipos));
END;
$function$;
CREATE OR REPLACE FUNCTION public.eliminar_cuenta(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bloqueos text[] := ARRAY[]::text[];
  c_anonimo  CONSTANT text := 'Jugador eliminado';
BEGIN
  IF NOT (COALESCE(auth.role(), '') = 'service_role' OR session_user <> 'authenticator') THEN
    RAISE EXCEPTION 'FORBIDDEN: eliminar_cuenta solo corre con service role' USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'eliminar_cuenta: p_user_id es obligatorio' USING ERRCODE = '22004';
  END IF;

  -- Idempotente: un reintento tras un éxito no es un error.
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('ok', true, 'bloqueos', '[]'::jsonb);
  END IF;

  -- Candado antes de mirar: quien se inscriba en su torneo o se una a su ronda mientras tanto toma
  -- FOR KEY SHARE sobre la misma fila y espera; al seguir, los EXISTS de abajo ya lo ven.
  PERFORM 1 FROM tournaments WHERE organizer_id = p_user_id FOR UPDATE;
  PERFORM 1 FROM rondas_libres WHERE creador_id = p_user_id FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM tournaments t
    WHERE t.organizer_id = p_user_id
      AND EXISTS (
        SELECT 1 FROM players pl
        WHERE pl.tournament_id = t.id
          AND pl.user_id IS DISTINCT FROM p_user_id
      )
  ) THEN
    v_bloqueos := v_bloqueos || 'organiza_torneos_con_otros';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM rondas_libres r
    WHERE r.creador_id = p_user_id
      AND EXISTS (
        SELECT 1 FROM ronda_libre_jugadores j
        WHERE j.ronda_id = r.id
          AND j.user_id IS NOT NULL
          AND j.user_id <> p_user_id
      )
  ) THEN
    v_bloqueos := v_bloqueos || 'creo_rondas_con_otros';
  END IF;

  IF array_length(v_bloqueos, 1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'bloqueos', to_jsonb(v_bloqueos));
  END IF;

  -- Sus sesiones del coach apuntan a sus rondas y torneos (NO ACTION).
  DELETE FROM taiger_sessions WHERE user_id = p_user_id;

  -- Sus torneos: sin otros jugadores (verificado arriba). Arrastra grupos, players, rounds y hole_scores.
  DELETE FROM tournaments WHERE organizer_id = p_user_id;

  -- Rondas ajenas que él administraba (rondas_libres.admin_user_id → auth.users es NO ACTION). Va ANTES de tocar
  -- tarjetas: la ronda antes que el jugador, el mismo orden que upsert_ronda_libre_scores (si no, deadlock con un
  -- guardado de golpes en esa ronda; migración 20261118120000).
  UPDATE rondas_libres
  SET    admin_user_id = NULL, admin_mode = false
  WHERE  admin_user_id = p_user_id
    AND  creador_id IS DISTINCT FROM p_user_id;

  -- Su inscripción en torneos ajenos (sus rounds/hole_scores sostienen el leaderboard y los premios): se
  -- desvincula y se anonimiza. Va ANTES de tocar tarjetas: players antes que ronda_libre_jugadores, el mismo orden
  -- que editar_handicap_inscrito (si no, deadlock con un cambio de hándicap del inscrito; migración 20261120100000). players exige user_id XOR pending_user_id (CHECK): queda como invitado con un id nuevo
  -- que nadie conoce, así que nadie puede reclamar esa tarjeta.
  UPDATE players
  SET    user_id = NULL, pending_user_id = gen_random_uuid(), player_name = c_anonimo
  WHERE  user_id = p_user_id OR pending_user_id = p_user_id;

  -- Su tarjeta en rondas ajenas: se desvincula y se anonimiza, no se borra (best ball, match play y el
  -- grupo de un torneo ajeno dependen de esa fila).
  UPDATE ronda_libre_jugadores j
  SET    user_id = NULL, pending_user_id = NULL, nombre = c_anonimo,
         nombre_invitado = NULL, telefono_invitado = NULL
  WHERE  j.user_id = p_user_id
    AND  NOT EXISTS (SELECT 1 FROM rondas_libres r WHERE r.id = j.ronda_id AND r.creador_id = p_user_id);

  -- Reclamos pendientes a su nombre en rondas libres (sin FK): que no apunten a una cuenta que ya no existe.
  UPDATE ronda_libre_jugadores SET pending_user_id = NULL WHERE pending_user_id = p_user_id;

  -- Tarjetas en que un creador lo eligió como rival (perfil_sugerido_id): cambia SOLO `nombre` (copiado
  -- del perfil al elegirlo en el buscador) por c_anonimo, y SOLO en filas sin cuenta vinculada (user_id y
  -- pending_user_id NULL; los reclamos a su nombre se limpiaron en el UPDATE anterior). No toca
  -- nombre_invitado, telefono_invitado, puntajes ni perfil_sugerido_id: ese lo deja en NULL el
  -- ON DELETE SET NULL cuando se borra el perfil, más abajo.
  UPDATE ronda_libre_jugadores SET nombre = c_anonimo
  WHERE  perfil_sugerido_id = p_user_id AND user_id IS NULL AND pending_user_id IS NULL;

  -- Las rondas libres que creó: sin otros usuarios (verificado arriba). Arrastra sus filas y las de
  -- sus invitados (ronda_libre_jugadores.user_id → profiles es NO ACTION).
  DELETE FROM rondas_libres WHERE creador_id = p_user_id;

  -- Arrastra profiles y todo lo que cuelga de profiles o de auth.users (CASCADE / SET NULL).
  DELETE FROM auth.users WHERE id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'bloqueos', '[]'::jsonb);
END;
$function$;
CREATE OR REPLACE FUNCTION public.enroll_player(p_tournament_id uuid, p_kind text, p_user_id uuid, p_guest_name text, p_handicap numeric, p_category_id uuid, p_genero text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max       integer;
  v_approved  integer;
  v_player_id uuid;
  v_genero    text;
BEGIN
  -- Sólo M/F entran; cualquier otra cosa se guarda como NULL (desconocido).
  v_genero := CASE WHEN p_genero IN ('M', 'F') THEN p_genero ELSE NULL END;

  -- Lock de la fila del torneo: serializa las inscripciones concurrentes del
  -- mismo torneo. Mientras esta transacción no comitee, otra alta al mismo
  -- torneo espera acá → el conteo de cupo de abajo es atómico.
  SELECT max_players INTO v_max
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_data', 'message', 'Torneo no encontrado.');
  END IF;

  -- Cupo (atómico bajo el lock). Sólo inscritos activos ('approved') ocupan cupo.
  IF v_max IS NOT NULL AND v_max > 0 THEN
    SELECT count(*) INTO v_approved
    FROM players
    WHERE tournament_id = p_tournament_id AND status = 'approved';

    IF v_approved >= v_max THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'tournament_full',
        'message', format('El torneo alcanzó su cupo máximo (%s jugadores). Amplía el cupo máximo del torneo para agregar más.', v_max)
      );
    END IF;
  END IF;

  BEGIN
    IF p_kind = 'registered' THEN
      INSERT INTO players (tournament_id, user_id, category_id, handicap_at_registration, status, genero)
      VALUES (p_tournament_id, p_user_id, p_category_id, p_handicap, 'approved', v_genero)
      RETURNING id INTO v_player_id;
    ELSE
      INSERT INTO players (tournament_id, pending_user_id, player_name, category_id, handicap_at_registration, status, genero)
      VALUES (p_tournament_id, gen_random_uuid(), p_guest_name, p_category_id, p_handicap, 'approved', v_genero)
      RETURNING id INTO v_player_id;
    END IF;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_registered', 'message', 'Ya estás inscrito en este torneo.');
    WHEN check_violation OR not_null_violation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_data', 'message', 'Faltan datos en el perfil. Verifica que haya nombre y handicap configurados.');
  END;

  -- La tarjeta de la RONDA VIGENTE en la MISMA transacción (si falla, se revierte el jugador).
  -- Antes era siempre la ronda 1: un alta con la ronda 2 en juego anotaba en la ronda 1.
  PERFORM public.asegurar_tarjeta_vigente(p_tournament_id, v_player_id);

  RETURN jsonb_build_object('ok', true, 'player_id', v_player_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.exec_sql(query text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE result json;
BEGIN
  SET LOCAL transaction_read_only = on;
  BEGIN
    EXECUTE 'SELECT json_agg(row_to_json(exec_sql_fila)) FROM (' || regexp_replace(query, '[\s;]+$', '')
      || E'\n) exec_sql_fila' INTO result;
    RETURN COALESCE(result, '[]'::json);
  EXCEPTION WHEN OTHERS THEN
    RETURN json_build_object('error', SQLERRM);
  END;
END; $function$;
CREATE OR REPLACE FUNCTION public.finalizar_ronda_libre(p_codigo text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_holes int;
  v_completa boolean;
BEGIN
  SELECT id, estado, es_demo, COALESCE(holes, 18)
    INTO v_id, v_estado, v_es_demo, v_holes
  FROM public.rondas_libres
  WHERE codigo = p_codigo
  FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado <> 'en_curso' THEN
    RETURN false;
  END IF;

  IF NOT public.puede_anotar_ronda(v_id) THEN
    -- Sin autoría sobre la ronda: solo se acepta cerrar una ronda completa.
    -- Regla espejo de `tarjetaCompleta` (src/lib/ronda/helpers.ts): claves
    -- numéricas positivas >= holes (una ronda de 9 desde el 10 usa 10..18).
    SELECT bool_and(
      (SELECT count(*) FROM jsonb_object_keys(COALESCE(j.scores, '{}'::jsonb)) k
       WHERE k ~ '^[0-9]+$' AND k::int >= 1) >= v_holes
    ) INTO v_completa
    FROM public.ronda_libre_jugadores j
    WHERE j.ronda_id = v_id;

    IF NOT COALESCE(v_completa, false) THEN
      RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
    END IF;
  END IF;

  UPDATE public.rondas_libres
  SET estado = 'finalizada'
  WHERE id = v_id AND estado = 'en_curso';

  RETURN FOUND;
END;
$function$;
CREATE OR REPLACE FUNCTION public.grupos_fijos_guard_grupo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF NOT COALESCE(public.torneo_con_grupos_fijos(OLD.tournament_id), false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.ronda_libre_id IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.tournament_group_players gp WHERE gp.group_id = OLD.id) THEN
      RAISE EXCEPTION 'El torneo ya empezó: los grupos quedan fijos'
        USING ERRCODE = 'P0001', HINT = 'grupos_fijos';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.ronda_libre_id IS DISTINCT FROM OLD.ronda_libre_id
     OR NEW.tournament_id IS DISTINCT FROM OLD.tournament_id THEN
    RAISE EXCEPTION 'El torneo ya empezó: los grupos quedan fijos'
      USING ERRCODE = 'P0001', HINT = 'grupos_fijos';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.grupos_fijos_guard_inscrito()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND COALESCE(public.torneo_con_grupos_fijos(OLD.tournament_id), false) THEN
    RAISE EXCEPTION 'El torneo ya empezó: retira al jugador con WD'
      USING ERRCODE = 'P0001', HINT = 'grupos_fijos';
  END IF;
  RETURN OLD;
END;
$function$;
CREATE OR REPLACE FUNCTION public.grupos_fijos_guard_jugadores_de_grupo()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_fijo boolean := false;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT public.torneo_con_grupos_fijos(g.tournament_id) INTO v_fijo
      FROM public.tournament_groups g WHERE g.id = OLD.group_id;
  END IF;
  IF NOT COALESCE(v_fijo, false) AND TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT public.torneo_con_grupos_fijos(g.tournament_id) INTO v_fijo
      FROM public.tournament_groups g WHERE g.id = NEW.group_id;
  END IF;

  IF COALESCE(v_fijo, false) THEN
    RAISE EXCEPTION 'El torneo ya empezó: los grupos quedan fijos'
      USING ERRCODE = 'P0001', HINT = 'grupos_fijos';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;
CREATE OR REPLACE FUNCTION public.guard_tournament_drafts_owner_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_privilegiado boolean := COALESCE(auth.role(), '') = 'service_role' OR session_user <> 'authenticator';
BEGIN
  IF NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id THEN
    RETURN NEW;
  END IF;

  IF NOT v_privilegiado THEN
    IF v_uid IS NULL OR v_uid IS DISTINCT FROM OLD.owner_id THEN
      RAISE EXCEPTION 'FORBIDDEN: solo el dueño del borrador puede transferirlo' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tournament_draft_collaborators
      WHERE draft_id = NEW.id AND user_id = NEW.owner_id
    ) THEN
      RAISE EXCEPTION 'el nuevo dueño debe ser colaborador del borrador' USING ERRCODE = '23514';
    END IF;
  END IF;

  UPDATE public.tournament_draft_collaborators
     SET role = 'collaborator'
   WHERE draft_id = NEW.id AND user_id = OLD.owner_id;

  INSERT INTO public.tournament_draft_collaborators (draft_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.owner_id, 'owner', OLD.owner_id)
  ON CONFLICT (draft_id, user_id) DO UPDATE SET role = 'owner';

  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.guardar_hole_score(p_fila jsonb, p_seq bigint DEFAULT NULL::bigint, p_dispositivo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_round_id uuid := (p_fila->>'round_id')::uuid;
  v_hole integer := (p_fila->>'hole_number')::integer;
  v_id uuid;
BEGIN
  IF v_round_id IS NULL OR v_hole IS NULL THEN
    RAISE EXCEPTION 'HOLE_SCORE_SIN_CLAVE' USING ERRCODE = '22023';
  END IF;

  IF p_seq IS NOT NULL AND p_dispositivo IS NOT NULL THEN
    INSERT INTO public.hole_scores_orden AS o (round_id, hole_number, dispositivo, seq)
    VALUES (v_round_id, v_hole, p_dispositivo, p_seq)
    ON CONFLICT (round_id, hole_number, dispositivo) DO UPDATE SET seq = EXCLUDED.seq WHERE o.seq < EXCLUDED.seq;
    -- Ese dispositivo ya guardó este hoyo con una secuencia igual o más nueva: este guardado no la pisa.
    IF NOT FOUND THEN
      SELECT hs.id INTO v_id FROM public.hole_scores hs WHERE hs.round_id = v_round_id AND hs.hole_number = v_hole;
      RETURN jsonb_build_object('aplicado', false, 'id', v_id);
    END IF;
  END IF;

  INSERT INTO public.hole_scores AS hs
    (round_id, hole_number, gross_score, source, status, net_score, points, par, putts, fairway_hit, gir)
  VALUES (
    v_round_id,
    v_hole,
    (p_fila->>'gross_score')::integer,
    COALESCE(p_fila->>'source', 'manual_player'),
    COALESCE(p_fila->>'status', 'pending'),
    (p_fila->>'net_score')::integer,
    -- Ausente en un INSERT = el default de la columna, como el upsert de PostgREST.
    CASE WHEN p_fila ? 'points' THEN (p_fila->>'points')::integer ELSE 0 END,
    (p_fila->>'par')::integer,
    (p_fila->>'putts')::integer,
    (p_fila->>'fairway_hit')::boolean,
    (p_fila->>'gir')::boolean
  )
  ON CONFLICT (round_id, hole_number) DO UPDATE SET
    gross_score = CASE WHEN p_fila ? 'gross_score' THEN EXCLUDED.gross_score ELSE hs.gross_score END,
    source      = CASE WHEN p_fila ? 'source'      THEN EXCLUDED.source      ELSE hs.source END,
    status      = CASE WHEN p_fila ? 'status'      THEN EXCLUDED.status      ELSE hs.status END,
    net_score   = CASE WHEN p_fila ? 'net_score'   THEN EXCLUDED.net_score   ELSE hs.net_score END,
    points      = CASE WHEN p_fila ? 'points'      THEN EXCLUDED.points      ELSE hs.points END,
    par         = CASE WHEN p_fila ? 'par'         THEN EXCLUDED.par         ELSE hs.par END,
    putts       = CASE WHEN p_fila ? 'putts'       THEN EXCLUDED.putts       ELSE hs.putts END,
    fairway_hit = CASE WHEN p_fila ? 'fairway_hit' THEN EXCLUDED.fairway_hit ELSE hs.fairway_hit END,
    gir         = CASE WHEN p_fila ? 'gir'         THEN EXCLUDED.gir         ELSE hs.gir END
  RETURNING hs.id INTO v_id;

  RETURN jsonb_build_object('aplicado', true, 'id', v_id);
END;
$function$;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'player'
  );
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.is_draft_collaborator(p_draft_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.tournament_draft_collaborators
    where draft_id = p_draft_id and user_id = p_user_id
  );
$function$;
CREATE OR REPLACE FUNCTION public.liberar_equipo_de_ronda(p_codigo text, p_equipo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_creador uuid;
  v_equipo_id uuid;
  v_anotador uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'sin sesión';
  END IF;

  SELECT rl.id, rl.estado, rl.es_demo, rl.creador_id
    INTO v_ronda_id, v_estado, v_es_demo, v_creador
  FROM public.rondas_libres rl
  WHERE rl.codigo = p_codigo
  FOR SHARE;

  IF v_ronda_id IS NOT NULL THEN
    SELECT re.id, re.anotador_user_id
      INTO v_equipo_id, v_anotador
    FROM public.ronda_equipos re
    WHERE re.id = p_equipo_id AND re.ronda_id = v_ronda_id
    FOR UPDATE;
  END IF;

  IF v_ronda_id IS NULL OR v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado IS DISTINCT FROM 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;
  -- IS NOT DISTINCT FROM: con anotador NULL, `=` daría NULL y el IF no cortaría.
  IF NOT (v_creador IS NOT DISTINCT FROM v_uid OR v_anotador IS NOT DISTINCT FROM v_uid) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  -- anotador_nombre lo borra el trigger.
  UPDATE public.ronda_equipos SET anotador_user_id = NULL WHERE id = v_equipo_id AND anotador_user_id IS NOT NULL;

  RETURN jsonb_build_object('estado', 'ok');
END;
$function$;
CREATE OR REPLACE FUNCTION public.log_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    BEGIN
      IF OLD.role IS DISTINCT FROM NEW.role THEN
        INSERT INTO analytics_events (event_type, user_id, event_data)
        VALUES ('role_changed', NEW.id, json_build_object(
          'old_role', OLD.role,
          'new_role', NEW.role,
          'changed_at', NOW()
        )::jsonb);
      END IF;
      RETURN NEW;
    END;
    $function$;
CREATE OR REPLACE FUNCTION public.marcar_puntito_ronda_libre(p_codigo text, p_jugador_id uuid, p_hoyo integer, p_puntito_id text, p_marcar boolean, p_seq bigint DEFAULT NULL::bigint, p_dispositivo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_reglas jsonb;
  v_holes integer;
  v_tipo text;
BEGIN
  IF p_hoyo IS NULL OR p_puntito_id IS NULL OR p_marcar IS NULL THEN
    RAISE EXCEPTION 'MARCA_INVALIDA' USING ERRCODE = '22023';
  END IF;

  SELECT t.ronda_id, t.reglas, t.holes INTO v_ronda_id, v_reglas, v_holes
  FROM public.timba_ronda_para_escribir(p_codigo, p_jugador_id) t;

  -- Hoyo de la ronda: una ronda de 9 que sale del 10 juega 10..18.
  IF p_hoyo < 1 OR p_hoyo > GREATEST(v_holes, 18) THEN
    RAISE EXCEPTION 'MARCA_INVALIDA' USING ERRCODE = '22023', DETAIL = 'hoyo fuera de la ronda';
  END IF;

  -- El tipo sale de las reglas guardadas, nunca del cliente. El birdie no se marca: sale de los golpes.
  SELECT p->>'tipo' INTO v_tipo
  FROM jsonb_array_elements(COALESCE(v_reglas->'config'->'puntitos', '[]'::jsonb)) p
  WHERE p->>'id' = p_puntito_id
  LIMIT 1;
  IF v_tipo IS NULL OR v_tipo = 'birdie' THEN
    RAISE EXCEPTION 'MARCA_INVALIDA' USING ERRCODE = '22023', DETAIL = 'punto especial inexistente o automático';
  END IF;

  -- Serializa las marcas del mismo punto en el mismo hoyo: dos teléfonos asignando el greenie a la vez
  -- borrarían "nada" los dos e insertarían dos greenies.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_ronda_id::text || ':' || p_hoyo || ':' || p_puntito_id, 0));

  -- Greenie: uno por hoyo, así que la clave es del hoyo y no del jugador.
  IF NOT public.timba_registrar_secuencia(
    v_ronda_id,
    CASE WHEN v_tipo = 'greenie' THEN 'p:' || p_hoyo || ':' || p_puntito_id
         ELSE 'p:' || p_hoyo || ':' || p_puntito_id || ':' || p_jugador_id END,
    p_seq, p_dispositivo
  ) THEN
    RETURN jsonb_build_object('aplicada', false);
  END IF;

  IF v_tipo = 'greenie' THEN
    -- Asignar reemplaza y quitar borra todos: la marca anterior nunca revive.
    DELETE FROM public.ronda_libre_puntitos
    WHERE ronda_id = v_ronda_id AND hoyo = p_hoyo AND puntito_id = p_puntito_id;
    IF p_marcar THEN
      INSERT INTO public.ronda_libre_puntitos (ronda_id, jugador_id, hoyo, puntito_id)
      VALUES (v_ronda_id, p_jugador_id, p_hoyo, p_puntito_id);
    END IF;
  ELSIF p_marcar THEN
    INSERT INTO public.ronda_libre_puntitos (ronda_id, jugador_id, hoyo, puntito_id)
    VALUES (v_ronda_id, p_jugador_id, p_hoyo, p_puntito_id)
    ON CONFLICT (ronda_id, jugador_id, hoyo, puntito_id) DO NOTHING;
  ELSE
    DELETE FROM public.ronda_libre_puntitos
    WHERE ronda_id = v_ronda_id AND jugador_id = p_jugador_id AND hoyo = p_hoyo AND puntito_id = p_puntito_id;
  END IF;

  RETURN jsonb_build_object('aplicada', true);
END;
$function$;
CREATE OR REPLACE FUNCTION public.marcar_retiro_ronda_libre(p_codigo text, p_jugador_id uuid, p_desde_hoyo integer, p_seq bigint DEFAULT NULL::bigint, p_dispositivo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_reglas jsonb;
  v_holes integer;
BEGIN
  SELECT t.ronda_id, t.reglas, t.holes INTO v_ronda_id, v_reglas, v_holes
  FROM public.timba_ronda_para_escribir(p_codigo, p_jugador_id) t;

  IF p_desde_hoyo IS NOT NULL AND (p_desde_hoyo < 1 OR p_desde_hoyo > GREATEST(v_holes, 18)) THEN
    RAISE EXCEPTION 'RETIRO_INVALIDO' USING ERRCODE = '22023', DETAIL = 'hoyo fuera de la ronda';
  END IF;

  IF NOT public.timba_registrar_secuencia(v_ronda_id, 'r:' || p_jugador_id, p_seq, p_dispositivo) THEN
    RETURN jsonb_build_object('aplicada', false);
  END IF;

  IF p_desde_hoyo IS NULL THEN
    DELETE FROM public.ronda_libre_retiros WHERE jugador_id = p_jugador_id;
  ELSE
    INSERT INTO public.ronda_libre_retiros (jugador_id, ronda_id, desde_hoyo)
    VALUES (p_jugador_id, v_ronda_id, p_desde_hoyo)
    ON CONFLICT (jugador_id) DO UPDATE SET desde_hoyo = EXCLUDED.desde_hoyo, created_at = clock_timestamp();
  END IF;

  RETURN jsonb_build_object('aplicada', true);
END;
$function$;
CREATE OR REPLACE FUNCTION public.merge_ronda_player_scores(p_jugador_id uuid, p_scores jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_merged jsonb;
BEGIN
  IF p_scores IS NULL OR jsonb_typeof(p_scores) <> 'object' THEN
    RAISE EXCEPTION 'p_scores debe ser un objeto JSONB no nulo';
  END IF;

  UPDATE ronda_libre_jugadores
  SET scores = COALESCE(scores, '{}'::jsonb) || p_scores
  WHERE id = p_jugador_id
  RETURNING scores INTO v_merged;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'jugador no encontrado o sin permiso (RLS)'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_merged;
END;
$function$;
CREATE OR REPLACE FUNCTION public.notify_cerebro_weights_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM pg_notify('cerebro_weights_updated', json_build_object(
    'parameter_type', NEW.parameter_type,
    'parameter_key', NEW.parameter_key,
    'updated_at', NEW.updated_at
  )::text);
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.protect_last_admin()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    DECLARE admin_count INTEGER;
    BEGIN
      IF OLD.role = 'admin' AND NEW.role != 'admin' THEN
        SELECT COUNT(*) INTO admin_count FROM profiles WHERE role = 'admin' AND id != OLD.id;
        IF admin_count = 0 THEN
          RAISE EXCEPTION 'No se puede quitar el ultimo admin del sistema';
        END IF;
      END IF;
      RETURN NEW;
    END;
    $function$;
CREATE OR REPLACE FUNCTION public.puede_anotar_ronda(p_ronda_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    -- creador o marcador designado (admin_mode: admin_user_id anota por todos)
    EXISTS (SELECT 1 FROM public.rondas_libres r
            WHERE r.id = p_ronda_id
              AND (r.creador_id = auth.uid() OR r.admin_user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.ronda_libre_jugadores j
               WHERE j.ronda_id = p_ronda_id AND j.user_id = auth.uid())
  );
$function$;
CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key text, p_max integer, p_window_ms integer)
 RETURNS TABLE(permitido boolean, restantes integer, reinicia_en timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_reset timestamptz;
BEGIN
  IF p_key IS NULL OR p_key = '' OR p_max IS NULL OR p_max < 1 OR p_window_ms IS NULL OR p_window_ms < 1 THEN
    RAISE EXCEPTION 'rate_limit_hit: parámetros inválidos' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.rate_limit_hits AS r (key, count, reset_at)
  VALUES (p_key, 1, now() + make_interval(secs => p_window_ms / 1000.0))
  ON CONFLICT (key) DO UPDATE SET
    count    = CASE WHEN r.reset_at <= now() THEN 1 ELSE r.count + 1 END,
    reset_at = CASE WHEN r.reset_at <= now() THEN EXCLUDED.reset_at ELSE r.reset_at END
  RETURNING r.count, r.reset_at INTO v_count, v_reset;

  -- Limpieza oportunista de ventanas vencidas hace más de un día (índice por reset_at): la tabla no
  -- crece sin techo y no hace falta un cron aparte. ~1 de cada 100 llamadas.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_hits WHERE reset_at < now() - interval '1 day';
  END IF;

  RETURN QUERY SELECT v_count <= p_max, greatest(0, p_max - v_count), v_reset;
END;
$function$;
CREATE OR REPLACE FUNCTION public.reclamar_equipo_de_ronda(p_codigo text, p_equipo_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_admin_mode boolean;
  v_equipo_id uuid;
  v_origen text;
  v_anotador uuid;
  v_anotador_nombre text;
  v_otro uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'sin sesión';
  END IF;

  -- Primero la ronda (FOR SHARE), después el equipo (FOR UPDATE), en dos sentencias.
  SELECT rl.id, rl.estado, rl.es_demo, rl.admin_mode
    INTO v_ronda_id, v_estado, v_es_demo, v_admin_mode
  FROM public.rondas_libres rl
  WHERE rl.codigo = p_codigo
  FOR SHARE;

  IF v_ronda_id IS NOT NULL THEN
    SELECT re.id, re.handicap_origen, re.anotador_user_id, re.anotador_nombre
      INTO v_equipo_id, v_origen, v_anotador, v_anotador_nombre
    FROM public.ronda_equipos re
    WHERE re.id = p_equipo_id AND re.ronda_id = v_ronda_id
    FOR UPDATE;
  END IF;

  IF v_ronda_id IS NULL OR v_equipo_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado IS DISTINCT FROM 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;
  IF v_admin_mode IS TRUE THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda de un celular';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tournament_groups tg WHERE tg.ronda_libre_id = v_ronda_id) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda de torneo';
  END IF;
  IF v_origen IS DISTINCT FROM 'club' THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'equipo no es de club';
  END IF;

  IF v_anotador IS NOT DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('estado', 'ok');
  END IF;
  IF v_anotador IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'tomado', 'anotador_nombre', v_anotador_nombre);
  END IF;

  SELECT re.id INTO v_otro
  FROM public.ronda_equipos re
  WHERE re.ronda_id = v_ronda_id AND re.anotador_user_id = v_uid
  LIMIT 1;
  IF v_otro IS NOT NULL THEN
    RETURN jsonb_build_object('estado', 'ya_tienes_equipo', 'equipo_id', v_otro);
  END IF;

  BEGIN
    -- anotador_nombre lo pone el trigger desde profiles.name.
    UPDATE public.ronda_equipos SET anotador_user_id = v_uid WHERE id = v_equipo_id;
  EXCEPTION WHEN unique_violation THEN
    -- Otro reclamo de la misma cuenta, sobre otro equipo, confirmó entre la lectura de arriba y este UPDATE.
    SELECT re.id INTO v_otro
    FROM public.ronda_equipos re
    WHERE re.ronda_id = v_ronda_id AND re.anotador_user_id = v_uid
    LIMIT 1;
    RETURN jsonb_build_object('estado', 'ya_tienes_equipo', 'equipo_id', v_otro);
  END;

  RETURN jsonb_build_object('estado', 'ok');
END;
$function$;
CREATE OR REPLACE FUNCTION public.resolve_and_link_course(p_course_name text, p_par_per_hole jsonb DEFAULT NULL::jsonb, p_similarity_threshold real DEFAULT 0.8, p_genero text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_canon text;          -- forma ordenada (primario)
  v_canon_sorted text;   -- forma alfabética (fallback)
  v_gender text;   -- 'V' | 'D' | NULL
  v_exact_order boolean := false;  -- true sólo si el match vino de A0 (orden exacto)
  v_match_id uuid;
  v_match_score real;
  v_holes_count int;
  v_par_total int;
  v_new_course_id uuid;
  v_created boolean := false;
  v_populated boolean := false;
  v_invalid_count int;
BEGIN
  IF p_course_name IS NULL
     OR trim(p_course_name) = ''
     OR lower(trim(p_course_name)) = 'cancha desconocida' THEN
    RETURN jsonb_build_object('course_id', null, 'course_created', false,
                              'holes_populated', false, 'match_score', null);
  END IF;

  -- Degradación OCR: pares no-enteros ("4.0", "null", "") → ignorar pares (match-only).
  IF p_par_per_hole IS NOT NULL THEN
    SELECT COUNT(*) INTO v_invalid_count
    FROM jsonb_each_text(p_par_per_hole) AS j(k, val)
    WHERE val IS NULL OR val !~ '^\d+$';
    IF v_invalid_count > 0 THEN
      p_par_per_hole := NULL;
    END IF;
  END IF;

  -- Género del jugador → norma del catálogo (V/D). Acepta M/F, masculino/femenino, V/D.
  v_gender := CASE upper(coalesce(p_genero, ''))
    WHEN 'M' THEN 'V' WHEN 'MASCULINO' THEN 'V' WHEN 'V' THEN 'V'
    WHEN 'F' THEN 'D' WHEN 'FEMENINO' THEN 'D' WHEN 'D' THEN 'D'
    ELSE NULL END;

  v_canon := course_name_canonical_ordered(p_course_name);
  v_canon_sorted := course_name_canonical(p_course_name);
  IF v_canon = '' THEN
    RETURN jsonb_build_object('course_id', null, 'course_created', false,
                              'holes_populated', false, 'match_score', null);
  END IF;

  -- (A0) Match primario: igualdad canónica ORDENADA (respeta orden del loop),
  --      preferir género → oficial → verificada → estable.
  SELECT id, 1.0 INTO v_match_id, v_match_score
  FROM courses
  WHERE course_name_canonical_ordered(nombre) = v_canon
  ORDER BY
    (v_gender IS NOT NULL AND genero_norm = v_gender) DESC,
    (fuente = 'fedegolf') DESC,
    (datos_verificados IS TRUE) DESC,
    id
  LIMIT 1;
  IF v_match_id IS NOT NULL THEN v_exact_order := true; END IF;

  -- (A1) Fallback insensible al orden: igualdad canónica ALFABÉTICA. Cubre
  --      convención de nombre distinta cuando el orden exacto no está en catálogo.
  IF v_match_id IS NULL THEN
    SELECT id, 0.95 INTO v_match_id, v_match_score
    FROM courses
    WHERE course_name_canonical(nombre) = v_canon_sorted
    ORDER BY
      (v_gender IS NOT NULL AND genero_norm = v_gender) DESC,
      (fuente = 'fedegolf') DESC,
      (datos_verificados IS TRUE) DESC,
      id
    LIMIT 1;
  END IF;

  -- (B) Fallback typos: similitud trigram sobre la forma alfabética.
  IF v_match_id IS NULL THEN
    SELECT id, similarity(course_name_canonical(nombre), v_canon_sorted)
    INTO v_match_id, v_match_score
    FROM courses
    WHERE similarity(course_name_canonical(nombre), v_canon_sorted) >= p_similarity_threshold
    ORDER BY
      similarity(course_name_canonical(nombre), v_canon_sorted) DESC,
      (v_gender IS NOT NULL AND genero_norm = v_gender) DESC,
      (fuente = 'fedegolf') DESC,
      id
    LIMIT 1;
  END IF;

  -- Hay match → poblar pares si la ficha estaba vacía, y devolver.
  IF v_match_id IS NOT NULL THEN
    -- Redirigir a la ficha canónica si existe (dedup).
    v_match_id := COALESCE((SELECT canonical_course_id FROM courses WHERE id = v_match_id), v_match_id);

    -- Poblar pares SÓLO en match de orden exacto (A0): un match alfabético (A1,
    -- orden de loop distinto) o trigram (B) tiene pares hoyo-a-hoyo que NO alinean
    -- con la ficha destino → poblar metería el back-9 equivocado (bug I1).
    IF v_exact_order AND p_par_per_hole IS NOT NULL THEN
      SELECT COUNT(*) INTO v_holes_count FROM course_holes WHERE course_id = v_match_id;
      IF v_holes_count = 0 THEN
        INSERT INTO course_holes (course_id, numero, par)
        SELECT v_match_id, (k::int), (val::int)
        FROM jsonb_each_text(p_par_per_hole) AS j(k, val);
        v_populated := true;
        UPDATE courses
          SET par_total = (SELECT SUM(par) FROM course_holes WHERE course_id = v_match_id)
          WHERE id = v_match_id;
      END IF;
    END IF;

    RETURN jsonb_build_object('course_id', v_match_id, 'course_created', false,
                              'holes_populated', v_populated, 'match_score', v_match_score);
  END IF;

  -- Sin match y sin pares → no se crea; la ronda queda con course_name texto.
  IF p_par_per_hole IS NULL THEN
    RETURN jsonb_build_object('course_id', null, 'course_created', false,
                              'holes_populated', false, 'match_score', v_match_score);
  END IF;

  -- Sin match y CON pares → crear cancha user_added (auto-ingesta).
  SELECT SUM((val)::int) INTO v_par_total
  FROM jsonb_each_text(p_par_per_hole) AS j(k, val);

  BEGIN
    INSERT INTO courses (nombre, par_total, fuente, activa, pais)
    VALUES (p_course_name, v_par_total, 'user_added', true, 'CL')
    RETURNING id INTO v_new_course_id;
    v_created := true;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_new_course_id FROM courses
    WHERE lower(nombre) = lower(p_course_name) AND fuente = 'user_added'
    LIMIT 1;
    IF v_new_course_id IS NULL THEN
      RAISE EXCEPTION 'resolve_and_link_course: race recovery failed for course %', p_course_name;
    END IF;
  END;

  IF v_created THEN
    INSERT INTO course_holes (course_id, numero, par)
    SELECT v_new_course_id, (k::int), (val::int)
    FROM jsonb_each_text(p_par_per_hole) AS j(k, val);
    v_populated := true;
  END IF;

  RETURN jsonb_build_object('course_id', v_new_course_id, 'course_created', v_created,
                            'holes_populated', v_populated, 'match_score', null);
END;
$function$;
CREATE OR REPLACE FUNCTION public.restamp_round_metrics_target(p_user uuid, p_target numeric)
 RETURNS void
 LANGUAGE sql
AS $function$
  UPDATE round_metrics
  SET target_at_time = p_target,
      delta_vs_target_handicap =
        round((delta_vs_handicap_expected + handicap_at_time - p_target)::numeric, 1)
  WHERE user_id = p_user
    AND handicap_at_time IS NOT NULL;
$function$;
CREATE OR REPLACE FUNCTION public.rls_write_policies_audit()
 RETURNS TABLE(tablename text, policyname text, permissive text, roles text[], cmd text, qual text, with_check text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT p.tablename::text, p.policyname::text, p.permissive::text,
         p.roles::text[], p.cmd::text, p.qual::text, p.with_check::text
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname = 'public'
  ORDER BY p.tablename, p.cmd, p.policyname;
$function$;
CREATE OR REPLACE FUNCTION public.ronda_equipos_anotador_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated')
     AND NEW.anotador_user_id IS NOT NULL
     AND NEW.anotador_user_id IS DISTINCT FROM auth.uid()
     AND (TG_OP = 'INSERT' OR NEW.anotador_user_id IS DISTINCT FROM OLD.anotador_user_id) THEN
    RAISE EXCEPTION 'ANOTADOR_AJENO' USING ERRCODE = '42501',
      DETAIL = 'un equipo se reclama con reclamar_equipo_de_ronda; desde el cliente solo puedes ponerte a ti';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.ronda_equipos_anotador_nombre()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.anotador_user_id IS NULL THEN
    NEW.anotador_nombre := NULL;
  ELSE
    NEW.anotador_nombre := (SELECT p.name FROM public.profiles p WHERE p.id = NEW.anotador_user_id);
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.ronda_equipos_scores_de_su_anotador()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  -- Mismo predicado que upsert_ronda_equipos_scores. Si RLS no deja leer la ronda, admin_mode sale NULL y bloquea.
  IF current_user IN ('anon', 'authenticated')
     AND OLD.handicap_origen = 'club'
     AND (SELECT rl.admin_mode FROM public.rondas_libres rl WHERE rl.id = OLD.ronda_id) IS NOT TRUE
     AND OLD.anotador_user_id IS NOT NULL
     AND OLD.anotador_user_id IS DISTINCT FROM auth.uid()
     AND NEW.scores IS DISTINCT FROM OLD.scores THEN
    RAISE EXCEPTION 'EQUIPO_DE_OTRO_ANOTADOR' USING ERRCODE = '42501',
      DETAIL = 'este equipo lo anota otro celular; para anotarlo tú, libéralo primero';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.search_chunks_hybrid(query_embedding public.vector, query_text text, alpha numeric DEFAULT 0.7, top_k integer DEFAULT 20, jurisdictions text[] DEFAULT NULL::text[], block_filter text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, source_id uuid, breadcrumb text, content text, vec_score numeric, bm25_score numeric, final_score numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
BEGIN
  RETURN QUERY
  WITH vec AS (
    SELECT c.id, (1 - (c.embedding <=> query_embedding))::numeric AS vs
    FROM knowledge_chunks c
    WHERE c.embedding IS NOT NULL
      AND (block_filter IS NULL OR c.block_key = block_filter)
      AND (jurisdictions IS NULL OR EXISTS (
            SELECT 1 FROM knowledge_sources s
            WHERE s.id = c.source_id AND s.jurisdiction = ANY(jurisdictions)))
    ORDER BY c.embedding <=> query_embedding
    LIMIT 50
  ),
  bm AS (
    SELECT c.id, ts_rank_cd(c.tsv, plainto_tsquery('simple', query_text))::numeric AS bs
    FROM knowledge_chunks c
    WHERE (block_filter IS NULL OR c.block_key = block_filter)
      AND (jurisdictions IS NULL OR EXISTS (
            SELECT 1 FROM knowledge_sources s
            WHERE s.id = c.source_id AND s.jurisdiction = ANY(jurisdictions)))
      AND c.tsv @@ plainto_tsquery('simple', query_text)
    ORDER BY bs DESC
    LIMIT 50
  ),
  unioned AS (
    SELECT COALESCE(vec.id, bm.id) AS id,
           COALESCE(vec.vs, 0) AS vs,
           COALESCE(bm.bs, 0) AS bs
    FROM vec FULL OUTER JOIN bm ON vec.id = bm.id
  ),
  max_bm AS (SELECT GREATEST(MAX(bs), 0.001::numeric) AS m FROM unioned)
  SELECT c.id,
         c.source_id,
         c.breadcrumb,
         c.content,
         u.vs AS vec_score,
         (u.bs / mb.m)::numeric AS bm25_score,
         (alpha * u.vs + (1 - alpha) * (u.bs / mb.m))::numeric AS final_score
  FROM unioned u
  JOIN knowledge_chunks c ON c.id = u.id
  CROSS JOIN max_bm mb
  ORDER BY final_score DESC
  LIMIT top_k;
END;
$function$;
CREATE OR REPLACE FUNCTION public.tarjeta_tiene_anotaciones(p_scores jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO ''
AS $function$
  SELECT jsonb_typeof(p_scores) = 'object'
     AND EXISTS (SELECT 1 FROM jsonb_each(p_scores) e WHERE jsonb_typeof(e.value) = 'number');
$function$;
CREATE OR REPLACE FUNCTION public.timba_registrar_secuencia(p_ronda_id uuid, p_clave text, p_seq bigint, p_dispositivo uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_seq IS NULL OR p_dispositivo IS NULL THEN
    RETURN true;
  END IF;
  INSERT INTO public.ronda_libre_juego_orden AS o (ronda_id, clave, dispositivo, seq)
  VALUES (p_ronda_id, p_clave, p_dispositivo, p_seq)
  ON CONFLICT (ronda_id, clave, dispositivo) DO UPDATE SET seq = EXCLUDED.seq WHERE o.seq < EXCLUDED.seq;
  RETURN FOUND;
END;
$function$;
CREATE OR REPLACE FUNCTION public.timba_ronda_para_escribir(p_codigo text, p_jugador_id uuid)
 RETURNS TABLE(ronda_id uuid, reglas jsonb, holes integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_formato text;
  v_reglas jsonb;
  v_holes integer;
  v_user_id uuid;
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
BEGIN
  SELECT rl.id, rl.estado, rl.es_demo, rl.formato_juego, rl.reglas_juego, rl.holes, rlj.user_id
    INTO v_ronda_id, v_estado, v_es_demo, v_formato, v_reglas, v_holes, v_user_id
  FROM public.rondas_libres rl
  INNER JOIN public.ronda_libre_jugadores rlj ON rlj.ronda_id = rl.id
  WHERE rlj.id = p_jugador_id AND rl.codigo = p_codigo
  -- Mismo lock que upsert_ronda_libre_scores: lo toma la RPC que llama (misma transacción) hasta confirmar.
  FOR SHARE OF rl;

  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado IS DISTINCT FROM 'en_curso' THEN  -- con estado NULL, <> no cortaría
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;
  IF v_formato <> 'personalizado' OR v_reglas IS NULL THEN
    RAISE EXCEPTION 'RONDA_SIN_JUEGO' USING ERRCODE = '22023';
  END IF;
  -- Siempre con sesión (nada para anon). Al invitado sin cuenta (user_id NULL) lo marca solo quien anota la
  -- ronda (creador, marcador o un jugador de ella): antes bastaba tener el código.
  IF NOT (
    v_is_service
    -- IS NOT DISTINCT FROM y no `=`: con un invitado (user_id NULL) `=` da NULL, el IF NOT (NULL) no corta y el
    -- ajeno pasaría (lo cazó la prueba SQL).
    OR (v_uid IS NOT NULL AND (v_user_id IS NOT DISTINCT FROM v_uid OR public.puede_anotar_ronda(v_ronda_id)))
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN QUERY SELECT v_ronda_id, v_reglas, v_holes;
END;
$function$;
CREATE OR REPLACE FUNCTION public.torneo_con_grupos_fijos(p_tournament_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  SELECT EXISTS (
           SELECT 1 FROM public.tournaments t
            WHERE t.id = p_tournament_id
              AND COALESCE(t.status, '') NOT IN ('draft', 'open')
         )
      OR EXISTS (
           SELECT 1 FROM public.tournament_groups g
            WHERE g.tournament_id = p_tournament_id
              AND g.ronda_libre_id IS NOT NULL
         );
$function$;
CREATE OR REPLACE FUNCTION public.touch_tournament_drafts_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin new.updated_at = now(); return new; end $function$;
CREATE OR REPLACE FUNCTION public.tournament_drafts_asegurar_dueno_colaborador()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.tournament_draft_collaborators (draft_id, user_id, role, added_by)
  VALUES (NEW.id, NEW.owner_id, 'owner', NEW.owner_id)
  ON CONFLICT (draft_id, user_id) DO UPDATE SET role = 'owner';

  RETURN NULL;
END;
$function$;
CREATE OR REPLACE FUNCTION public.unaccent_immutable(text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
BEGIN
  RETURN public.unaccent($1);
END;
$function$;
CREATE OR REPLACE FUNCTION public.update_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;
CREATE OR REPLACE FUNCTION public.upsert_ronda_equipos_scores(p_equipo_id uuid, p_codigo text, p_delta jsonb, p_seq bigint DEFAULT NULL::bigint, p_dispositivo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_scores jsonb;
  v_anotador uuid;
  v_origen text;
  v_admin_mode boolean;
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  PERFORM public.validate_score_delta(p_delta);

  IF p_delta IS NULL OR p_delta = '{}'::jsonb THEN
    RETURN NULL;
  END IF;

  SELECT rl.id, rl.estado, rl.es_demo, rl.admin_mode, re.scores, re.anotador_user_id, re.handicap_origen
    INTO v_ronda_id, v_estado, v_es_demo, v_admin_mode, v_scores, v_anotador, v_origen
  FROM public.rondas_libres rl
  INNER JOIN public.ronda_equipos re ON re.ronda_id = rl.id
  WHERE re.id = p_equipo_id AND rl.codigo = p_codigo
  FOR UPDATE OF re;

  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado <> 'en_curso' THEN
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;

  -- El anotador de un equipo (un celular por equipo) escribe SOLO ese equipo: v_anotador es el de esta fila, leído
  -- bajo su lock. puede_anotar_ronda (creador, marcador, jugadores) escribe los equipos SIN anotador (ver abajo).
  -- IS NOT DISTINCT FROM y no `=`: con el equipo sin anotador, `NULL = uid` es NULL y NOT (false OR NULL) también,
  -- y el IF no cortaría. La rama del anotador vale solo en un equipo de club de una ronda de un celular por equipo
  -- (admin_mode no TRUE). Rondas de torneo y demo no llegan acá con anotador: reclamar_equipo_de_ronda las rechaza
  -- y ronda_equipos_anotador_guard impide asignarlo desde el cliente (la demo, además, corta arriba).
  IF NOT (
    v_is_service
    OR (auth.uid() IS NOT NULL AND (
      public.puede_anotar_ronda(v_ronda_id)
      OR (v_origen = 'club' AND v_admin_mode IS NOT TRUE AND v_anotador IS NOT DISTINCT FROM auth.uid())
    ))
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  -- Un equipo con anotador lo escribe SOLO su anotador: tampoco el creador ni los jugadores (puede_anotar_ronda).
  -- Sin esto, el celular del creador y el del equipo podían pisarse el mismo hoyo (gana el último en llegar).
  -- Para anotarlo él, el creador lo libera primero (liberar_equipo_de_ronda). v_anotador se leyó bajo el FOR UPDATE.
  -- Mismo predicado que la rama del anotador de arriba (equipo de club, ronda sin admin_mode): fuera de él un
  -- anotador no da derechos, así que tampoco los quita (el creador sigue anotando, como en toda ronda de un celular).
  IF NOT v_is_service AND v_origen = 'club' AND v_admin_mode IS NOT TRUE
     AND v_anotador IS NOT NULL AND v_anotador IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'equipo_de_otro_anotador';
  END IF;

  IF p_seq IS NOT NULL AND p_dispositivo IS NOT NULL THEN
    INSERT INTO public.ronda_equipos_scores_orden AS o (equipo_id, dispositivo, seq)
    VALUES (p_equipo_id, p_dispositivo, p_seq)
    ON CONFLICT (equipo_id, dispositivo) DO UPDATE SET seq = EXCLUDED.seq WHERE o.seq < EXCLUDED.seq;
    -- Ese dispositivo ya guardó una tarjeta más nueva: ésta no la pisa.
    IF NOT FOUND THEN
      RETURN COALESCE(v_scores, '{}'::jsonb);
    END IF;
  END IF;

  UPDATE public.ronda_equipos
  SET scores = COALESCE(scores, '{}'::jsonb) || p_delta
  WHERE id = p_equipo_id
  RETURNING scores INTO v_new_scores;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN v_new_scores;
END;
$function$;
CREATE OR REPLACE FUNCTION public.upsert_ronda_libre_scores(p_jugador_id uuid, p_codigo text, p_delta jsonb, p_seq bigint DEFAULT NULL::bigint, p_dispositivo uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ronda_id uuid;
  v_estado text;
  v_es_demo boolean;
  v_formato text;
  v_user_id uuid;
  v_scores jsonb;
  v_uid uuid := auth.uid();
  v_is_service boolean := COALESCE(auth.role(), '') = 'service_role';
  v_new_scores jsonb;
BEGIN
  PERFORM public.validate_score_delta(p_delta);

  -- Primero la ronda (FOR SHARE), después el jugador (FOR UPDATE), en dos sentencias: el mismo orden que el cierre
  -- y los borrados de ronda (descartar_ronda_libre, DELETE con CASCADE), para que no se crucen en un deadlock.
  -- El cierre (finalizar_ronda_libre, FOR UPDATE; o un UPDATE directo) espera a que esta escritura confirme, y una
  -- que llega después ve el estado ya cerrado. Varias escrituras a la vez no se bloquean (SHARE con SHARE).
  SELECT rl.id, rl.estado, rl.es_demo, rl.formato_juego
    INTO v_ronda_id, v_estado, v_es_demo, v_formato
  FROM public.rondas_libres rl
  WHERE rl.codigo = p_codigo
  FOR SHARE;

  IF v_ronda_id IS NOT NULL THEN
    SELECT rlj.user_id, rlj.scores
      INTO v_user_id, v_scores
    FROM public.ronda_libre_jugadores rlj
    WHERE rlj.id = p_jugador_id AND rlj.ronda_id = v_ronda_id
    FOR UPDATE;
    IF NOT FOUND THEN
      v_ronda_id := NULL;
    END IF;
  END IF;

  IF v_ronda_id IS NULL THEN
    RAISE EXCEPTION 'RONDA_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF v_es_demo THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003', DETAIL = 'ronda demo';
  END IF;
  IF v_estado IS DISTINCT FROM 'en_curso' THEN  -- con estado NULL, <> no cortaría
    RAISE EXCEPTION 'RONDA_FINALIZED' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    v_is_service
    OR (v_uid IS NOT NULL AND (v_user_id IS NOT DISTINCT FROM v_uid OR public.puede_anotar_ronda(v_ronda_id)))
    -- Tarjeta de un invitado sin cuenta: cualquiera con el código la anota, salvo en la Timba (hay plata en juego y
    -- los ids de los jugadores salen en /juego/publico): ahí solo quien anota la ronda (rama de arriba). Decisión de
    -- Juanjo 18-nov; migración 20261121120000. IS DISTINCT FROM: formato_juego es NOT NULL, pero no se apuesta a eso.
    OR (v_user_id IS NULL AND v_formato IS DISTINCT FROM 'personalizado')
  ) THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  IF p_seq IS NOT NULL AND p_dispositivo IS NOT NULL THEN
    INSERT INTO public.ronda_libre_scores_orden AS o (jugador_id, dispositivo, seq)
    VALUES (p_jugador_id, p_dispositivo, p_seq)
    ON CONFLICT (jugador_id, dispositivo) DO UPDATE SET seq = EXCLUDED.seq WHERE o.seq < EXCLUDED.seq;
    -- Ese dispositivo ya guardó una tarjeta más nueva: ésta no la pisa.
    IF NOT FOUND THEN
      RETURN COALESCE(v_scores, '{}'::jsonb);
    END IF;
  END IF;

  UPDATE public.ronda_libre_jugadores
  SET scores = COALESCE(scores, '{}'::jsonb) || COALESCE(p_delta, '{}'::jsonb)
  WHERE id = p_jugador_id
  RETURNING scores INTO v_new_scores;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RONDA_FORBIDDEN' USING ERRCODE = 'P0003';
  END IF;

  RETURN v_new_scores;
END;
$function$;
CREATE OR REPLACE FUNCTION public.usuario_es_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin');
$function$;
CREATE OR REPLACE FUNCTION public.usuario_puede_crear_timba()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND (public.usuario_es_admin()
          OR EXISTS (SELECT 1 FROM public.timba_probadores t WHERE t.user_id = auth.uid()));
$function$;
CREATE OR REPLACE FUNCTION public.validate_score_delta(p_delta jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
DECLARE
  k text;
  v jsonb;
  hole_num int;
  score_num numeric;
BEGIN
  IF p_delta IS NULL OR p_delta = '{}'::jsonb THEN
    RETURN;
  END IF;

  IF jsonb_typeof(p_delta) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_DELTA' USING ERRCODE = 'P0004';
  END IF;

  FOR k, v IN SELECT * FROM jsonb_each(p_delta)
  LOOP
    -- Sólo la forma canónica: sin ceros a la izquierda, signos ni espacios.
    IF k !~ '^[1-9][0-9]?$' THEN
      RAISE EXCEPTION 'INVALID_DELTA: clave "%" no es un número de hoyo válido', k
        USING ERRCODE = 'P0004';
    END IF;
    hole_num := k::int;

    IF hole_num > 27 THEN
      RAISE EXCEPTION 'INVALID_DELTA: hoyo % fuera de rango 1-27', hole_num
        USING ERRCODE = 'P0004';
    END IF;

    IF jsonb_typeof(v) <> 'number' THEN
      RAISE EXCEPTION 'INVALID_DELTA: score del hoyo % no es un número', hole_num
        USING ERRCODE = 'P0004';
    END IF;

    score_num := (v#>>'{}')::numeric;
    IF score_num <> trunc(score_num) THEN
      RAISE EXCEPTION 'INVALID_DELTA: score % en hoyo % no es un número entero de golpes', score_num, hole_num
        USING ERRCODE = 'P0004';
    END IF;

    -- -1 = CONCEDE (src/golf/formats/match-play.ts): el "Conceder hoyo" del
    -- match play se guarda así. Rechazarlo hacía fallar el guardado de TODA la
    -- tarjeta (el delta va en lote). Espejo: CONCEDE en match-play.ts.
    IF score_num <> -1 AND (score_num < 1 OR score_num > 20) THEN
      RAISE EXCEPTION 'INVALID_DELTA: score % en hoyo % fuera de rango 1-20', score_num, hole_num
        USING ERRCODE = 'P0004';
    END IF;
  END LOOP;
END;
$function$;
-- ===== 6. constraints =====
alter table public."ai_usage" add constraint "ai_usage_pkey" PRIMARY KEY (id);
alter table public."analytics_events" add constraint "analytics_events_pkey" PRIMARY KEY (id);
alter table public."categories" add constraint "categories_gender_check" CHECK ((gender = ANY (ARRAY['M'::text, 'F'::text])));
alter table public."categories" add constraint "categories_pkey" PRIMARY KEY (id);
alter table public."cerebro_events" add constraint "cerebro_events_pkey" PRIMARY KEY (id);
alter table public."cerebro_weights" add constraint "cerebro_weights_current_weight_check" CHECK (((current_weight >= (0)::numeric) AND (current_weight <= (1)::numeric)));
alter table public."cerebro_weights" add constraint "cerebro_weights_parameter_type_check" CHECK ((parameter_type = ANY (ARRAY['block'::text, 'pattern'::text, 'source'::text, 'user_cluster'::text])));
alter table public."cerebro_weights" add constraint "cerebro_weights_parameter_type_parameter_key_user_cluster_i_key" UNIQUE (parameter_type, parameter_key, user_cluster_id);
alter table public."cerebro_weights" add constraint "cerebro_weights_pkey" PRIMARY KEY (id);
alter table public."cerebro_weights" add constraint "cerebro_weights_source_check" CHECK ((source = ANY (ARRAY['auto'::text, 'manual'::text, 'seed'::text])));
alter table public."coach_episodic_memory" add constraint "coach_episodic_memory_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric)));
alter table public."coach_episodic_memory" add constraint "coach_episodic_memory_pkey" PRIMARY KEY (id);
alter table public."coach_eval_traces" add constraint "coach_eval_traces_pkey" PRIMARY KEY (id);
alter table public."coach_events" add constraint "coach_events_pkey" PRIMARY KEY (id);
alter table public."coach_events" add constraint "coach_events_type_check" CHECK ((type = ANY (ARRAY['round_processed'::text, 'pattern_detected'::text, 'pattern_resolved'::text, 'plan_assigned'::text, 'plan_outcome'::text, 'plan_resolved'::text, 'plan_superseded'::text, 'plan_expired'::text, 'session_message'::text, 'tool_called'::text, 'context_built'::text, 'admin_override'::text, 'hallucination_check'::text, 'extractor_shadow'::text, 'hallucination_review'::text, 'plan_accepted_by_user'::text])));
alter table public."coach_plans" add constraint "coach_plans_assigned_by_check" CHECK ((assigned_by = ANY (ARRAY['tAIger'::text, 'admin'::text])));
alter table public."coach_plans" add constraint "coach_plans_pkey" PRIMARY KEY (id);
alter table public."coach_plans" add constraint "coach_plans_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'resolved'::text, 'expired'::text, 'superseded'::text, 'cancelled'::text])));
alter table public."coach_plans" add constraint "coach_plans_target_op_check" CHECK ((target_op = ANY (ARRAY['lte'::text, 'gte'::text, 'eq'::text])));
alter table public."collective_insights" add constraint "collective_insights_handicap_range_check" CHECK ((handicap_range = ANY (ARRAY['0-5'::text, '5-10'::text, '10-15'::text, '15-20'::text, '20-30'::text, '30+'::text])));
alter table public."collective_insights" add constraint "collective_insights_pkey" PRIMARY KEY (id);
alter table public."collective_insights" add constraint "uq_collective_insights_pattern_range" UNIQUE (pattern_type, handicap_range);
alter table public."cost_tracking" add constraint "cost_tracking_pkey" PRIMARY KEY (id);
alter table public."course_holes" add constraint "course_holes_course_recorrido_numero_key" UNIQUE (course_id, recorrido, numero);
alter table public."course_holes" add constraint "course_holes_numero_check" CHECK (((numero >= 1) AND (numero <= 18)));
alter table public."course_holes" add constraint "course_holes_par_check" CHECK ((par = ANY (ARRAY[3, 4, 5])));
alter table public."course_holes" add constraint "course_holes_pkey" PRIMARY KEY (id);
alter table public."course_holes" add constraint "course_holes_stroke_index_check" CHECK (((stroke_index >= 1) AND (stroke_index <= 18)));
alter table public."course_si_proposals" add constraint "course_si_proposals_pkey" PRIMARY KEY (id);
alter table public."course_si_proposals" add constraint "course_si_proposals_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public."course_tees" add constraint "course_tees_back_cr_range_check" CHECK (((back_course_rating IS NULL) OR ((back_course_rating >= (25)::numeric) AND (back_course_rating <= (45)::numeric))));
alter table public."course_tees" add constraint "course_tees_back_slope_range_check" CHECK (((back_slope_rating IS NULL) OR ((back_slope_rating >= 55) AND (back_slope_rating <= 155))));
alter table public."course_tees" add constraint "course_tees_course_id_nombre_key" UNIQUE (course_id, nombre);
alter table public."course_tees" add constraint "course_tees_front_cr_range_check" CHECK (((front_course_rating IS NULL) OR ((front_course_rating >= (25)::numeric) AND (front_course_rating <= (45)::numeric))));
alter table public."course_tees" add constraint "course_tees_front_slope_range_check" CHECK (((front_slope_rating IS NULL) OR ((front_slope_rating >= 55) AND (front_slope_rating <= 155))));
alter table public."course_tees" add constraint "course_tees_genero_check" CHECK ((genero = ANY (ARRAY['M'::text, 'F'::text, 'U'::text])));
alter table public."course_tees" add constraint "course_tees_pkey" PRIMARY KEY (id);
alter table public."course_tees" add constraint "course_tees_rating_range_check" CHECK (((rating IS NULL) OR ((rating >= (50)::numeric) AND (rating <= (85)::numeric))));
alter table public."course_tees" add constraint "course_tees_slope_range_check" CHECK (((slope IS NULL) OR ((slope >= 55) AND (slope <= 155))));
alter table public."courses" add constraint "courses_course_rating_range_check" CHECK (((course_rating IS NULL) OR ((course_rating >= (50)::numeric) AND (course_rating <= (85)::numeric))));
alter table public."courses" add constraint "courses_par_total_range_check" CHECK (((par_total IS NULL) OR ((par_total >= 27) AND (par_total <= 78))));
alter table public."courses" add constraint "courses_pkey" PRIMARY KEY (id);
alter table public."courses" add constraint "courses_slope_range_check" CHECK (((slope_rating IS NULL) OR ((slope_rating >= 55) AND (slope_rating <= 155))));
alter table public."courses" add constraint "courses_slope_rating_check" CHECK (((slope_rating >= 55) AND (slope_rating <= 155)));
alter table public."courses" add constraint "courses_tipo_recorrido_check" CHECK ((tipo_recorrido = ANY (ARRAY['9h'::text, '18h'::text, '27h'::text, '36h'::text])));
alter table public."dev_pendientes" add constraint "dev_pendientes_pkey" PRIMARY KEY (id);
alter table public."dev_pendientes" add constraint "dev_pendientes_prioridad_check" CHECK ((prioridad = ANY (ARRAY['alta'::text, 'media'::text, 'baja'::text])));
alter table public."e2e_runs" add constraint "e2e_runs_pkey" PRIMARY KEY (id);
alter table public."e2e_runs" add constraint "e2e_runs_size_check" CHECK ((octet_length((results)::text) < 1048576));
alter table public."e2e_runs" add constraint "e2e_runs_status_check" CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'passed'::text, 'failed'::text, 'error'::text, 'cancelled'::text, 'timeout'::text])));
alter table public."error_logs" add constraint "error_logs_level_check" CHECK ((level = ANY (ARRAY['info'::text, 'warn'::text, 'error'::text, 'fatal'::text])));
alter table public."error_logs" add constraint "error_logs_pkey" PRIMARY KEY (id);
alter table public."evaluation_runs" add constraint "evaluation_runs_pkey" PRIMARY KEY (id);
alter table public."external_priors_amateur_benchmarks" add constraint "external_priors_amateur_bench_source_id_handicap_bucket_met_key" UNIQUE (source_id, handicap_bucket, metric_key, percentile);
alter table public."external_priors_amateur_benchmarks" add constraint "external_priors_amateur_benchmarks_percentile_check" CHECK (((percentile >= 0) AND (percentile <= 100)));
alter table public."external_priors_amateur_benchmarks" add constraint "external_priors_amateur_benchmarks_pkey" PRIMARY KEY (id);
alter table public."external_priors_course_norms" add constraint "external_priors_course_norms_pkey" PRIMARY KEY (id);
alter table public."external_priors_course_norms" add constraint "external_priors_course_norms_source_id_course_external_id_key" UNIQUE (source_id, course_external_id);
alter table public."external_priors_handicap_dist" add constraint "external_priors_handicap_dist_pkey" PRIMARY KEY (id);
alter table public."external_priors_handicap_dist" add constraint "external_priors_handicap_dist_proportion_check" CHECK (((proportion >= (0)::numeric) AND (proportion <= (1)::numeric)));
alter table public."external_priors_handicap_dist" add constraint "external_priors_handicap_dist_source_id_region_gender_age_b_key" UNIQUE (source_id, region, gender, age_bucket, handicap_bin, year);
alter table public."fedegolf_credentials" add constraint "fedegolf_credentials_pkey" PRIMARY KEY (id);
alter table public."fedegolf_credentials" add constraint "fedegolf_credentials_user_id_key" UNIQUE (user_id);
alter table public."flights" add constraint "flights_pkey" PRIMARY KEY (id);
alter table public."garmin_connections" add constraint "garmin_connections_pkey" PRIMARY KEY (id);
alter table public."garmin_connections" add constraint "garmin_connections_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text, 'expired'::text, 'revoked'::text])));
alter table public."garmin_connections" add constraint "garmin_connections_user_id_key" UNIQUE (user_id);
alter table public."golf_rules" add constraint "golf_rules_pkey" PRIMARY KEY (id);
alter table public."golf_rules" add constraint "golf_rules_rule_key_key" UNIQUE (rule_key);
alter table public."handicap_history" add constraint "handicap_history_pkey" PRIMARY KEY (id);
alter table public."handicap_history" add constraint "handicap_history_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'calculated'::text, 'garmin'::text])));
alter table public."historical_rounds" add constraint "historical_rounds_formato_check" CHECK ((formato_juego = ANY (ARRAY['stroke_play'::text, 'stableford'::text, 'match_play'::text, 'best_ball'::text, 'scramble'::text, 'foursome'::text, 'personalizado'::text])));
alter table public."historical_rounds" add constraint "historical_rounds_modo_check" CHECK ((modo_juego = ANY (ARRAY['gross'::text, 'neto'::text])));
alter table public."historical_rounds" add constraint "historical_rounds_pkey" PRIMARY KEY (id);
alter table public."hole_scores" add constraint "hole_scores_gross_score_range" CHECK (((gross_score IS NULL) OR ((gross_score >= 1) AND (gross_score <= 19))));
alter table public."hole_scores" add constraint "hole_scores_hole_number_check" CHECK (((hole_number >= 1) AND (hole_number <= 18)));
alter table public."hole_scores" add constraint "hole_scores_par_check" CHECK ((par = ANY (ARRAY[3, 4, 5])));
alter table public."hole_scores" add constraint "hole_scores_pkey" PRIMARY KEY (id);
alter table public."hole_scores" add constraint "hole_scores_round_id_hole_number_key" UNIQUE (round_id, hole_number);
alter table public."hole_scores" add constraint "hole_scores_source_check" CHECK ((source = ANY (ARRAY['manual_player'::text, 'manual_organizer'::text, 'garmin'::text, 'garmin_provisional'::text])));
alter table public."hole_scores" add constraint "hole_scores_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'loaded'::text, 'confirmed'::text, 'corrected'::text, 'provisional'::text])));
alter table public."hole_scores_orden" add constraint "hole_scores_orden_pkey" PRIMARY KEY (round_id, hole_number, dispositivo);
alter table public."import_jobs" add constraint "import_jobs_pkey" PRIMARY KEY (id);
alter table public."inbox_reports" add constraint "inbox_reports_pkey" PRIMARY KEY (id);
alter table public."inbox_reports" add constraint "inbox_reports_prioridad_check" CHECK ((prioridad = ANY (ARRAY['critico'::text, 'alto'::text, 'medio'::text, 'bajo'::text])));
alter table public."inbox_reports" add constraint "inbox_reports_status_check" CHECK ((status = ANY (ARRAY['nuevo'::text, 'triaged'::text, 'en_progreso'::text, 'resuelto'::text, 'descartado'::text, 'error'::text])));
alter table public."inbox_reports" add constraint "inbox_reports_telegram_message_id_telegram_chat_id_key" UNIQUE (telegram_message_id, telegram_chat_id);
alter table public."indice_historial" add constraint "indice_historial_fuente_check" CHECK ((fuente = ANY (ARRAY['manual'::text, 'fedegolf_sync'::text, 'import'::text])));
alter table public."indice_historial" add constraint "indice_historial_pkey" PRIMARY KEY (id);
alter table public."indice_historial" add constraint "indice_historial_user_id_fecha_fuente_key" UNIQUE (user_id, fecha, fuente);
alter table public."knowledge_chunks" add constraint "knowledge_chunks_pkey" PRIMARY KEY (id);
alter table public."knowledge_chunks" add constraint "knowledge_chunks_source_id_chunk_hash_key" UNIQUE (source_id, chunk_hash);
alter table public."knowledge_sources" add constraint "knowledge_sources_jurisdiction_check" CHECK ((jurisdiction = ANY (ARRAY['usga'::text, 'randa'::text, 'usga_committee'::text, 'whs_global'::text, 'fedegolf_chile'::text, 'external_prior'::text, 'coaching'::text])));
alter table public."knowledge_sources" add constraint "knowledge_sources_pkey" PRIMARY KEY (id);
alter table public."knowledge_sources" add constraint "knowledge_sources_slug_key" UNIQUE (slug);
alter table public."knowledge_sources" add constraint "knowledge_sources_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'ingesting'::text, 'ready'::text, 'stale'::text, 'error'::text, 'unavailable'::text])));
alter table public."llm_models" add constraint "llm_models_model_id_key" UNIQUE (model_id);
alter table public."llm_models" add constraint "llm_models_pkey" PRIMARY KEY (id);
alter table public."llm_models" add constraint "llm_models_role_check" CHECK ((role = ANY (ARRAY['primary_chat'::text, 'reasoning'::text, 'evaluator'::text, 'embedding'::text, 'rerank'::text])));
alter table public."llm_models" add constraint "llm_models_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'fallback'::text, 'deprecated'::text, 'retired'::text])));
alter table public."match_pairings" add constraint "match_pairings_pkey" PRIMARY KEY (id);
alter table public."match_pairings" add constraint "match_pairings_ronda_id_jugador_a_id_jugador_b_id_key" UNIQUE (ronda_id, jugador_a_id, jugador_b_id);
alter table public."notification_preferences" add constraint "notification_preferences_pkey" PRIMARY KEY (id);
alter table public."notification_preferences" add constraint "notification_preferences_user_id_key" UNIQUE (user_id);
alter table public."pattern_definitions" add constraint "pattern_definitions_formula_kind_check" CHECK ((formula_kind = ANY (ARRAY['aggregate'::text, 'intra_round'::text, 'cross_round'::text, 'multivariate'::text])));
alter table public."pattern_definitions" add constraint "pattern_definitions_pattern_key_key" UNIQUE (pattern_key);
alter table public."pattern_definitions" add constraint "pattern_definitions_pkey" PRIMARY KEY (id);
alter table public."pattern_definitions" add constraint "pattern_definitions_source_check" CHECK ((source = ANY (ARRAY['seed'::text, 'admin'::text, 'discovered'::text, 'imported'::text])));
alter table public."pattern_definitions" add constraint "pattern_definitions_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'validating'::text])));
alter table public."pattern_observations" add constraint "pattern_observations_pattern_id_round_id_key" UNIQUE (pattern_id, round_id);
alter table public."pattern_observations" add constraint "pattern_observations_pkey" PRIMARY KEY (id);
alter table public."plan_outcomes" add constraint "plan_outcomes_compliance_check" CHECK ((compliance = ANY (ARRAY['full'::text, 'partial'::text, 'none'::text, 'unknown'::text])));
alter table public."plan_outcomes" add constraint "plan_outcomes_one_round_source" CHECK (((historical_round_id IS NOT NULL) OR (ronda_libre_id IS NOT NULL)));
alter table public."plan_outcomes" add constraint "plan_outcomes_pkey" PRIMARY KEY (id);
alter table public."player_patterns" add constraint "player_patterns_pkey" PRIMARY KEY (id);
alter table public."player_patterns" add constraint "player_patterns_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'improving'::text, 'resolved'::text])));
alter table public."player_patterns" add constraint "player_patterns_user_id_pattern_type_key" UNIQUE (user_id, pattern_type);
alter table public."player_psych_profile" add constraint "player_psych_profile_motivation_type_check" CHECK ((motivation_type = ANY (ARRAY['competitivo'::text, 'disfrute'::text, 'social'::text])));
alter table public."player_psych_profile" add constraint "player_psych_profile_pkey" PRIMARY KEY (id);
alter table public."player_psych_profile" add constraint "player_psych_profile_pressure_response_check" CHECK ((pressure_response = ANY (ARRAY['activacion'::text, 'paralisis'::text, 'mixto'::text])));
alter table public."player_psych_profile" add constraint "player_psych_profile_user_id_key" UNIQUE (user_id);
alter table public."players" add constraint "players_genero_check" CHECK ((genero = ANY (ARRAY['M'::text, 'F'::text])));
alter table public."players" add constraint "players_identity_check" CHECK ((((user_id IS NOT NULL) AND (pending_user_id IS NULL)) OR ((user_id IS NULL) AND (pending_user_id IS NOT NULL))));
alter table public."players" add constraint "players_pkey" PRIMARY KEY (id);
alter table public."players" add constraint "players_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'waitlist'::text, 'withdrawn'::text, 'disqualified'::text])));
alter table public."players" add constraint "players_tournament_id_user_id_key" UNIQUE (tournament_id, user_id);
alter table public."profiles" add constraint "profiles_pkey" PRIMARY KEY (id);
alter table public."profiles" add constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['player'::text, 'organizer'::text, 'admin'::text])));
alter table public."push_subscriptions" add constraint "push_subscriptions_endpoint_key" UNIQUE (endpoint);
alter table public."push_subscriptions" add constraint "push_subscriptions_pkey" PRIMARY KEY (id);
alter table public."rag_query_log" add constraint "rag_query_log_pkey" PRIMARY KEY (id);
alter table public."rate_limit_hits" add constraint "rate_limit_hits_pkey" PRIMARY KEY (key);
alter table public."ronda_equipo_jugadores" add constraint "ronda_equipo_jugadores_equipo_id_jugador_id_key" UNIQUE (equipo_id, jugador_id);
alter table public."ronda_equipo_jugadores" add constraint "ronda_equipo_jugadores_pkey" PRIMARY KEY (id);
alter table public."ronda_equipos" add constraint "ronda_equipos_anotador_nombre_check" CHECK (((anotador_user_id IS NOT NULL) OR (anotador_nombre IS NULL)));
alter table public."ronda_equipos" add constraint "ronda_equipos_handicap_origen_check" CHECK ((handicap_origen = ANY (ARRAY['calculado'::text, 'club'::text])));
alter table public."ronda_equipos" add constraint "ronda_equipos_pkey" PRIMARY KEY (id);
alter table public."ronda_equipos_scores_orden" add constraint "ronda_equipos_scores_orden_pkey" PRIMARY KEY (equipo_id, dispositivo);
alter table public."ronda_libre_juego_orden" add constraint "ronda_libre_juego_orden_pkey" PRIMARY KEY (ronda_id, clave, dispositivo);
alter table public."ronda_libre_jugadores" add constraint "ronda_libre_jugadores_pkey" PRIMARY KEY (id);
alter table public."ronda_libre_puntitos" add constraint "ronda_libre_puntitos_hoyo_check" CHECK (((hoyo >= 1) AND (hoyo <= 27)));
alter table public."ronda_libre_puntitos" add constraint "ronda_libre_puntitos_pkey" PRIMARY KEY (id);
alter table public."ronda_libre_puntitos" add constraint "ronda_libre_puntitos_puntito_id_check" CHECK (((char_length(puntito_id) >= 1) AND (char_length(puntito_id) <= 40)));
alter table public."ronda_libre_puntitos" add constraint "ronda_libre_puntitos_unica" UNIQUE (ronda_id, jugador_id, hoyo, puntito_id);
alter table public."ronda_libre_retiros" add constraint "ronda_libre_retiros_desde_hoyo_check" CHECK (((desde_hoyo >= 1) AND (desde_hoyo <= 27)));
alter table public."ronda_libre_retiros" add constraint "ronda_libre_retiros_pkey" PRIMARY KEY (jugador_id);
alter table public."ronda_libre_scores_orden" add constraint "ronda_libre_scores_orden_pkey" PRIMARY KEY (jugador_id, dispositivo);
alter table public."rondas_libres" add constraint "rondas_libres_codigo_key" UNIQUE (codigo);
alter table public."rondas_libres" add constraint "rondas_libres_estado_check" CHECK ((estado = ANY (ARRAY['en_curso'::text, 'finalizada'::text])));
alter table public."rondas_libres" add constraint "rondas_libres_formato_juego_check" CHECK ((formato_juego = ANY (ARRAY['stroke_play'::text, 'stableford'::text, 'match_play'::text, 'best_ball'::text, 'scramble'::text, 'foursome'::text, 'personalizado'::text])));
alter table public."rondas_libres" add constraint "rondas_libres_hcp_pct_check" CHECK (((hcp_pct >= 50) AND (hcp_pct <= 100)));
alter table public."rondas_libres" add constraint "rondas_libres_hoyo_inicio_check" CHECK (((hoyo_inicio >= 1) AND (hoyo_inicio <= 18)));
alter table public."rondas_libres" add constraint "rondas_libres_modo_juego_check" CHECK ((modo_juego = ANY (ARRAY['gross'::text, 'neto'::text])));
alter table public."rondas_libres" add constraint "rondas_libres_pkey" PRIMARY KEY (id);
alter table public."rondas_libres" add constraint "rondas_libres_reglas_juego_check" CHECK ((((reglas_juego IS NULL) OR (jsonb_typeof(reglas_juego) = 'object'::text)) AND ((formato_juego <> 'personalizado'::text) OR (reglas_juego IS NOT NULL))));
alter table public."round_metrics" add constraint "delta_vs_target_consistency" CHECK ((((target_at_time IS NULL) AND (delta_vs_target_handicap IS NULL)) OR ((target_at_time IS NOT NULL) AND (delta_vs_target_handicap IS NOT NULL))));
alter table public."round_metrics" add constraint "round_metrics_pkey" PRIMARY KEY (id);
alter table public."round_metrics" add constraint "round_metrics_round_id_key" UNIQUE (round_id);
alter table public."round_watchers" add constraint "round_watchers_identity_chk" CHECK (((user_id IS NOT NULL) OR (push_subscription_id IS NOT NULL)));
alter table public."round_watchers" add constraint "round_watchers_pkey" PRIMARY KEY (id);
alter table public."round_watchers" add constraint "round_watchers_sub_ronda_key" UNIQUE (push_subscription_id, ronda_codigo);
alter table public."round_watchers" add constraint "round_watchers_user_id_ronda_codigo_key" UNIQUE (user_id, ronda_codigo);
alter table public."rounds" add constraint "rounds_pkey" PRIMARY KEY (id);
alter table public."rounds" add constraint "rounds_status_check" CHECK ((status = ANY (ARRAY['in_progress'::text, 'closed'::text, 'official'::text])));
alter table public."rounds" add constraint "rounds_tournament_player_round_key" UNIQUE (tournament_id, player_id, round_number);
alter table public."score_audit_log" add constraint "score_audit_log_pkey" PRIMARY KEY (id);
alter table public."taiger_feedback" add constraint "taiger_feedback_pkey" PRIMARY KEY (id);
alter table public."taiger_feedback" add constraint "taiger_feedback_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));
alter table public."taiger_message_feedback" add constraint "taiger_message_feedback_message_key_check" CHECK (((char_length(message_key) >= 1) AND (char_length(message_key) <= 64)));
alter table public."taiger_message_feedback" add constraint "taiger_message_feedback_pkey" PRIMARY KEY (id);
alter table public."taiger_message_feedback" add constraint "taiger_message_feedback_vote_check" CHECK ((vote = ANY (ARRAY['-1'::integer, 1])));
alter table public."taiger_message_feedback" add constraint "uq_taiger_message_feedback_session_msg" UNIQUE (session_id, message_key);
alter table public."taiger_recommendations" add constraint "taiger_recommendations_category_check" CHECK ((category = ANY (ARRAY['technique'::text, 'mental'::text, 'practice'::text, 'strategy'::text])));
alter table public."taiger_recommendations" add constraint "taiger_recommendations_focus_area_check" CHECK ((focus_area = ANY (ARRAY['driving'::text, 'approach'::text, 'short_game'::text, 'putting'::text, 'mental'::text, 'course_management'::text])));
alter table public."taiger_recommendations" add constraint "taiger_recommendations_pkey" PRIMARY KEY (id);
alter table public."taiger_recommendations" add constraint "taiger_recommendations_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'improving'::text, 'resolved'::text, 'ineffective'::text])));
alter table public."taiger_sessions" add constraint "taiger_sessions_pkey" PRIMARY KEY (id);
alter table public."taiger_sessions" add constraint "taiger_sessions_rating_check" CHECK (((rating >= 1) AND (rating <= 5)));
alter table public."taiger_sessions" add constraint "taiger_sessions_session_type_check" CHECK ((session_type = ANY (ARRAY['continuous'::text, 'post_round'::text, 'weekly_plan'::text, 'pre_tournament'::text, 'onboarding'::text, 'free'::text])));
alter table public."timba_probadores" add constraint "timba_probadores_pkey" PRIMARY KEY (user_id);
alter table public."tournament_draft_collaborators" add constraint "tournament_draft_collaborators_pkey" PRIMARY KEY (draft_id, user_id);
alter table public."tournament_draft_collaborators" add constraint "tournament_draft_collaborators_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'collaborator'::text])));
alter table public."tournament_draft_events" add constraint "tournament_draft_events_pkey" PRIMARY KEY (id);
alter table public."tournament_draft_events" add constraint "tournament_draft_events_source_check" CHECK ((source = ANY (ARRAY['manual'::text, 'ai'::text])));
alter table public."tournament_draft_share_tokens" add constraint "tournament_draft_share_tokens_pkey" PRIMARY KEY (token);
alter table public."tournament_drafts" add constraint "tournament_drafts_pkey" PRIMARY KEY (id);
alter table public."tournament_drafts" add constraint "tournament_drafts_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'creating'::text, 'created'::text, 'archived'::text])));
alter table public."tournament_group_players" add constraint "tournament_group_players_group_id_player_id_key" UNIQUE (group_id, player_id);
alter table public."tournament_group_players" add constraint "tournament_group_players_pkey" PRIMARY KEY (id);
alter table public."tournament_groups" add constraint "tournament_groups_pkey" PRIMARY KEY (id);
alter table public."tournament_prizes" add constraint "tournament_prizes_kind_check" CHECK ((kind = ANY (ARRAY['gross'::text, 'neto'::text])));
alter table public."tournament_prizes" add constraint "tournament_prizes_pkey" PRIMARY KEY (id);
alter table public."tournament_rounds" add constraint "tournament_rounds_hole_count_check" CHECK ((hole_count = ANY (ARRAY[9, 18])));
alter table public."tournament_rounds" add constraint "tournament_rounds_pkey" PRIMARY KEY (id);
alter table public."tournament_rounds" add constraint "tournament_rounds_round_number_check" CHECK ((round_number >= 2));
alter table public."tournament_rounds" add constraint "tournament_rounds_tournament_id_round_number_key" UNIQUE (tournament_id, round_number);
alter table public."tournament_templates" add constraint "tournament_templates_pkey" PRIMARY KEY (id);
alter table public."tournaments" add constraint "tournaments_codigo_key" UNIQUE (codigo);
alter table public."tournaments" add constraint "tournaments_format_check" CHECK ((format = ANY (ARRAY['stroke_play'::text, 'stableford'::text, 'match_play'::text, 'best_ball'::text, 'scramble'::text, 'foursome'::text])));
alter table public."tournaments" add constraint "tournaments_formato_juego_check" CHECK ((formato_juego = ANY (ARRAY['stroke_play'::text, 'stableford'::text, 'match_play'::text, 'best_ball'::text, 'scramble'::text, 'foursome'::text])));
alter table public."tournaments" add constraint "tournaments_hcp_calc_mode_check" CHECK ((hcp_calc_mode = ANY (ARRAY['raw'::text, 'whs'::text])));
alter table public."tournaments" add constraint "tournaments_hcp_pct_check" CHECK (((hcp_pct >= 50) AND (hcp_pct <= 100)));
alter table public."tournaments" add constraint "tournaments_hole_count_check" CHECK ((hole_count = ANY (ARRAY[9, 18])));
alter table public."tournaments" add constraint "tournaments_modo_juego_check" CHECK ((modo_juego = ANY (ARRAY['gross'::text, 'neto'::text])));
alter table public."tournaments" add constraint "tournaments_pkey" PRIMARY KEY (id);
alter table public."tournaments" add constraint "tournaments_slope_rating_check" CHECK (((slope_rating >= 55) AND (slope_rating <= 155)));
alter table public."tournaments" add constraint "tournaments_slug_key" UNIQUE (slug);
alter table public."tournaments" add constraint "tournaments_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'in_progress'::text, 'closed'::text, 'published'::text])));
alter table public."analytics_events" add constraint "analytics_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public."categories" add constraint "categories_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
alter table public."cerebro_events" add constraint "cerebro_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public."coach_episodic_memory" add constraint "coach_episodic_memory_superseded_by_fkey" FOREIGN KEY (superseded_by) REFERENCES public.coach_episodic_memory(id);
alter table public."coach_episodic_memory" add constraint "coach_episodic_memory_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."coach_events" add constraint "coach_events_related_plan_id_fkey" FOREIGN KEY (related_plan_id) REFERENCES public.coach_plans(id) ON DELETE SET NULL;
alter table public."coach_events" add constraint "coach_events_related_session_id_fkey" FOREIGN KEY (related_session_id) REFERENCES public.taiger_sessions(id) ON DELETE SET NULL;
alter table public."coach_events" add constraint "coach_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."coach_plans" add constraint "coach_plans_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.taiger_sessions(id) ON DELETE SET NULL;
alter table public."coach_plans" add constraint "coach_plans_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."cost_tracking" add constraint "cost_tracking_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public."course_holes" add constraint "course_holes_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
alter table public."course_si_proposals" add constraint "course_si_proposals_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
alter table public."course_si_proposals" add constraint "course_si_proposals_proposed_by_fkey" FOREIGN KEY (proposed_by) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."course_tees" add constraint "course_tees_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;
alter table public."courses" add constraint "courses_canonical_course_id_fkey" FOREIGN KEY (canonical_course_id) REFERENCES public.courses(id);
alter table public."courses" add constraint "courses_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES public.courses(id) ON DELETE SET NULL;
alter table public."e2e_runs" add constraint "e2e_runs_triggered_by_fkey" FOREIGN KEY (triggered_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public."external_priors_amateur_benchmarks" add constraint "external_priors_amateur_benchmarks_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.knowledge_sources(id) ON DELETE CASCADE;
alter table public."external_priors_course_norms" add constraint "external_priors_course_norms_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.knowledge_sources(id) ON DELETE CASCADE;
alter table public."external_priors_handicap_dist" add constraint "external_priors_handicap_dist_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.knowledge_sources(id) ON DELETE CASCADE;
alter table public."fedegolf_credentials" add constraint "fedegolf_credentials_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."flights" add constraint "flights_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
alter table public."garmin_connections" add constraint "garmin_connections_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."handicap_history" add constraint "handicap_history_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."historical_rounds" add constraint "historical_rounds_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE SET NULL;
alter table public."historical_rounds" add constraint "historical_rounds_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."hole_scores" add constraint "hole_scores_round_id_fkey" FOREIGN KEY (round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;
alter table public."hole_scores_orden" add constraint "hole_scores_orden_round_id_fkey" FOREIGN KEY (round_id) REFERENCES public.rounds(id) ON DELETE CASCADE;
alter table public."import_jobs" add constraint "import_jobs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."inbox_reports" add constraint "inbox_reports_reply_to_report_id_fkey" FOREIGN KEY (reply_to_report_id) REFERENCES public.inbox_reports(id) ON DELETE SET NULL;
alter table public."indice_historial" add constraint "indice_historial_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."knowledge_chunks" add constraint "knowledge_chunks_source_id_fkey" FOREIGN KEY (source_id) REFERENCES public.knowledge_sources(id) ON DELETE CASCADE;
alter table public."match_pairings" add constraint "match_pairings_jugador_a_id_fkey" FOREIGN KEY (jugador_a_id) REFERENCES public.ronda_libre_jugadores(id) ON DELETE CASCADE;
alter table public."match_pairings" add constraint "match_pairings_jugador_b_id_fkey" FOREIGN KEY (jugador_b_id) REFERENCES public.ronda_libre_jugadores(id) ON DELETE CASCADE;
alter table public."match_pairings" add constraint "match_pairings_ronda_id_fkey" FOREIGN KEY (ronda_id) REFERENCES public.rondas_libres(id) ON DELETE CASCADE;
alter table public."notification_preferences" add constraint "notification_preferences_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."pattern_observations" add constraint "pattern_observations_pattern_id_fkey" FOREIGN KEY (pattern_id) REFERENCES public.pattern_definitions(id) ON DELETE CASCADE;
alter table public."pattern_observations" add constraint "pattern_observations_round_id_fkey" FOREIGN KEY (round_id) REFERENCES public.historical_rounds(id) ON DELETE CASCADE;
alter table public."pattern_observations" add constraint "pattern_observations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."plan_outcomes" add constraint "plan_outcomes_historical_round_id_fkey" FOREIGN KEY (historical_round_id) REFERENCES public.historical_rounds(id) ON DELETE SET NULL;
alter table public."plan_outcomes" add constraint "plan_outcomes_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.coach_plans(id) ON DELETE CASCADE;
alter table public."plan_outcomes" add constraint "plan_outcomes_ronda_libre_id_fkey" FOREIGN KEY (ronda_libre_id) REFERENCES public.rondas_libres(id) ON DELETE SET NULL;
alter table public."plan_outcomes" add constraint "plan_outcomes_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."player_patterns" add constraint "player_patterns_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."player_psych_profile" add constraint "player_psych_profile_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."players" add constraint "players_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id);
alter table public."players" add constraint "players_flight_id_fkey" FOREIGN KEY (flight_id) REFERENCES public.flights(id);
alter table public."players" add constraint "players_tee_id_fkey" FOREIGN KEY (tee_id) REFERENCES public.course_tees(id) ON DELETE SET NULL;
alter table public."players" add constraint "players_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
alter table public."players" add constraint "players_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."push_subscriptions" add constraint "push_subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."rag_query_log" add constraint "rag_query_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."ronda_equipo_jugadores" add constraint "ronda_equipo_jugadores_equipo_id_fkey" FOREIGN KEY (equipo_id) REFERENCES public.ronda_equipos(id) ON DELETE CASCADE;
alter table public."ronda_equipo_jugadores" add constraint "ronda_equipo_jugadores_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.ronda_libre_jugadores(id) ON DELETE CASCADE;
alter table public."ronda_equipos" add constraint "ronda_equipos_anotador_user_id_fkey" FOREIGN KEY (anotador_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public."ronda_equipos" add constraint "ronda_equipos_ronda_id_fkey" FOREIGN KEY (ronda_id) REFERENCES public.rondas_libres(id) ON DELETE CASCADE;
alter table public."ronda_equipos_scores_orden" add constraint "ronda_equipos_scores_orden_equipo_id_fkey" FOREIGN KEY (equipo_id) REFERENCES public.ronda_equipos(id) ON DELETE CASCADE;
alter table public."ronda_libre_juego_orden" add constraint "ronda_libre_juego_orden_ronda_id_fkey" FOREIGN KEY (ronda_id) REFERENCES public.rondas_libres(id) ON DELETE CASCADE;
alter table public."ronda_libre_jugadores" add constraint "ronda_libre_jugadores_perfil_sugerido_id_fkey" FOREIGN KEY (perfil_sugerido_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public."ronda_libre_jugadores" add constraint "ronda_libre_jugadores_ronda_id_fkey" FOREIGN KEY (ronda_id) REFERENCES public.rondas_libres(id) ON DELETE CASCADE;
alter table public."ronda_libre_jugadores" add constraint "ronda_libre_jugadores_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id);
alter table public."ronda_libre_puntitos" add constraint "ronda_libre_puntitos_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.ronda_libre_jugadores(id) ON DELETE CASCADE;
alter table public."ronda_libre_puntitos" add constraint "ronda_libre_puntitos_ronda_id_fkey" FOREIGN KEY (ronda_id) REFERENCES public.rondas_libres(id) ON DELETE CASCADE;
alter table public."ronda_libre_retiros" add constraint "ronda_libre_retiros_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.ronda_libre_jugadores(id) ON DELETE CASCADE;
alter table public."ronda_libre_retiros" add constraint "ronda_libre_retiros_ronda_id_fkey" FOREIGN KEY (ronda_id) REFERENCES public.rondas_libres(id) ON DELETE CASCADE;
alter table public."ronda_libre_scores_orden" add constraint "ronda_libre_scores_orden_jugador_id_fkey" FOREIGN KEY (jugador_id) REFERENCES public.ronda_libre_jugadores(id) ON DELETE CASCADE;
alter table public."rondas_libres" add constraint "rondas_libres_admin_user_id_fkey" FOREIGN KEY (admin_user_id) REFERENCES auth.users(id);
alter table public."rondas_libres" add constraint "rondas_libres_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
alter table public."rondas_libres" add constraint "rondas_libres_creador_id_fkey" FOREIGN KEY (creador_id) REFERENCES public.profiles(id);
alter table public."round_metrics" add constraint "round_metrics_round_id_fkey" FOREIGN KEY (round_id) REFERENCES public.historical_rounds(id) ON DELETE CASCADE;
alter table public."round_metrics" add constraint "round_metrics_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."round_watchers" add constraint "round_watchers_push_subscription_id_fkey" FOREIGN KEY (push_subscription_id) REFERENCES public.push_subscriptions(id) ON DELETE CASCADE;
alter table public."round_watchers" add constraint "round_watchers_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."rounds" add constraint "rounds_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public."rounds" add constraint "rounds_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
alter table public."score_audit_log" add constraint "score_audit_log_changed_by_fkey" FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
alter table public."score_audit_log" add constraint "score_audit_log_hole_score_id_fkey" FOREIGN KEY (hole_score_id) REFERENCES public.hole_scores(id) ON DELETE CASCADE;
alter table public."taiger_feedback" add constraint "taiger_feedback_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.taiger_sessions(id) ON DELETE CASCADE;
alter table public."taiger_feedback" add constraint "taiger_feedback_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."taiger_message_feedback" add constraint "taiger_message_feedback_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.taiger_sessions(id) ON DELETE CASCADE;
alter table public."taiger_message_feedback" add constraint "taiger_message_feedback_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."taiger_recommendations" add constraint "taiger_recommendations_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.taiger_sessions(id) ON DELETE SET NULL;
alter table public."taiger_recommendations" add constraint "taiger_recommendations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."taiger_sessions" add constraint "taiger_sessions_ronda_libre_id_fkey" FOREIGN KEY (ronda_libre_id) REFERENCES public.rondas_libres(id);
alter table public."taiger_sessions" add constraint "taiger_sessions_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id);
alter table public."taiger_sessions" add constraint "taiger_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter table public."timba_probadores" add constraint "timba_probadores_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."tournament_draft_collaborators" add constraint "tournament_draft_collaborators_added_by_fkey" FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."tournament_draft_collaborators" add constraint "tournament_draft_collaborators_draft_id_fkey" FOREIGN KEY (draft_id) REFERENCES public.tournament_drafts(id) ON DELETE CASCADE;
alter table public."tournament_draft_collaborators" add constraint "tournament_draft_collaborators_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."tournament_draft_events" add constraint "tournament_draft_events_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."tournament_draft_events" add constraint "tournament_draft_events_draft_id_fkey" FOREIGN KEY (draft_id) REFERENCES public.tournament_drafts(id) ON DELETE CASCADE;
alter table public."tournament_draft_share_tokens" add constraint "tournament_draft_share_tokens_consumed_by_fkey" FOREIGN KEY (consumed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."tournament_draft_share_tokens" add constraint "tournament_draft_share_tokens_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."tournament_draft_share_tokens" add constraint "tournament_draft_share_tokens_draft_id_fkey" FOREIGN KEY (draft_id) REFERENCES public.tournament_drafts(id) ON DELETE CASCADE;
alter table public."tournament_drafts" add constraint "tournament_drafts_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."tournament_drafts" add constraint "tournament_drafts_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE SET NULL;
alter table public."tournament_group_players" add constraint "tournament_group_players_group_id_fkey" FOREIGN KEY (group_id) REFERENCES public.tournament_groups(id) ON DELETE CASCADE;
alter table public."tournament_group_players" add constraint "tournament_group_players_jugador_ronda_id_fkey" FOREIGN KEY (jugador_ronda_id) REFERENCES public.ronda_libre_jugadores(id);
alter table public."tournament_group_players" add constraint "tournament_group_players_player_id_fkey" FOREIGN KEY (player_id) REFERENCES public.players(id) ON DELETE CASCADE;
alter table public."tournament_groups" add constraint "tournament_groups_ronda_libre_id_fkey" FOREIGN KEY (ronda_libre_id) REFERENCES public.rondas_libres(id);
alter table public."tournament_groups" add constraint "tournament_groups_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
alter table public."tournament_prizes" add constraint "tournament_prizes_awarded_to_fkey" FOREIGN KEY (awarded_to) REFERENCES public.players(id) ON DELETE SET NULL;
alter table public."tournament_prizes" add constraint "tournament_prizes_category_id_fkey" FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE SET NULL;
alter table public."tournament_prizes" add constraint "tournament_prizes_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
alter table public."tournament_rounds" add constraint "tournament_rounds_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE RESTRICT;
alter table public."tournament_rounds" add constraint "tournament_rounds_tournament_id_fkey" FOREIGN KEY (tournament_id) REFERENCES public.tournaments(id) ON DELETE CASCADE;
alter table public."tournament_templates" add constraint "tournament_templates_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."tournaments" add constraint "tournaments_course_id_fkey" FOREIGN KEY (course_id) REFERENCES public.courses(id);
alter table public."tournaments" add constraint "tournaments_organizer_id_fkey" FOREIGN KEY (organizer_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
alter sequence public."cerebro_events_id_seq" owned by public."cerebro_events"."id";
alter sequence public."coach_events_id_seq" owned by public."coach_events"."id";
alter sequence public."cost_tracking_id_seq" owned by public."cost_tracking"."id";
-- ===== 7. índices =====
CREATE INDEX coach_eval_traces_case_idx ON public.coach_eval_traces USING btree (case_id, created_at DESC);
CREATE INDEX coach_eval_traces_run_idx ON public.coach_eval_traces USING btree (run_id, created_at DESC);
CREATE UNIQUE INDEX coach_plans_one_active_per_user ON public.coach_plans USING btree (user_id) WHERE (status = 'active'::text);
CREATE INDEX e2e_runs_created_at_desc_idx ON public.e2e_runs USING btree (created_at DESC);
CREATE INDEX e2e_runs_status_created_idx ON public.e2e_runs USING btree (status, created_at DESC);
CREATE INDEX e2e_runs_status_idx ON public.e2e_runs USING btree (status);
CREATE INDEX e2e_runs_triggered_by_idx ON public.e2e_runs USING btree (triggered_by);
CREATE INDEX idx_ai_usage_created ON public.ai_usage USING btree (created_at DESC);
CREATE INDEX idx_ai_usage_problems ON public.ai_usage USING btree (created_at DESC) WHERE ((status <> 'ok'::text) OR (fallback_used = true));
CREATE INDEX idx_ai_usage_surface_created ON public.ai_usage USING btree (surface, created_at DESC);
CREATE INDEX idx_ai_usage_user_created ON public.ai_usage USING btree (user_id, created_at DESC);
CREATE INDEX idx_amateur_bench_lookup ON public.external_priors_amateur_benchmarks USING btree (handicap_bucket, metric_key, percentile);
CREATE INDEX idx_analytics_type_date ON public.analytics_events USING btree (event_type, created_at DESC);
CREATE INDEX idx_analytics_user ON public.analytics_events USING btree (user_id, created_at DESC);
CREATE INDEX idx_cerebro_events_type_time ON public.cerebro_events USING btree (event_type, created_at DESC);
CREATE INDEX idx_cerebro_events_user_time ON public.cerebro_events USING btree (user_id, created_at DESC);
CREATE INDEX idx_cerebro_weights_lookup ON public.cerebro_weights USING btree (parameter_type, parameter_key) WHERE (user_cluster_id IS NULL);
CREATE INDEX idx_coach_events_type ON public.coach_events USING btree (type, created_at DESC);
CREATE INDEX idx_coach_events_user_created ON public.coach_events USING btree (user_id, created_at DESC);
CREATE INDEX idx_coach_plans_pattern ON public.coach_plans USING btree (pattern_id);
CREATE INDEX idx_coach_plans_status ON public.coach_plans USING btree (status);
CREATE INDEX idx_coach_plans_user ON public.coach_plans USING btree (user_id);
CREATE INDEX idx_collective_insights_range ON public.collective_insights USING btree (handicap_range);
CREATE INDEX idx_cost_user_day ON public.cost_tracking USING btree (user_id, created_at);
CREATE INDEX idx_course_holes_course ON public.course_holes USING btree (course_id);
CREATE INDEX idx_course_tees_course ON public.course_tees USING btree (course_id);
CREATE INDEX idx_courses_ciudad ON public.courses USING btree (ciudad);
CREATE INDEX idx_courses_nombre_trgm ON public.courses USING gin (public.unaccent_immutable(lower(nombre)) public.gin_trgm_ops);
CREATE INDEX idx_courses_pais ON public.courses USING btree (pais);
CREATE INDEX idx_courses_parent ON public.courses USING btree (parent_id);
CREATE INDEX idx_courses_tipo ON public.courses USING btree (tipo_recorrido);
CREATE INDEX idx_episodic_user_active ON public.coach_episodic_memory USING btree (user_id, category) WHERE (superseded_by IS NULL);
CREATE INDEX idx_error_logs_created ON public.error_logs USING btree (created_at DESC);
CREATE INDEX idx_error_logs_resolved ON public.error_logs USING btree (resolved, created_at DESC);
CREATE INDEX idx_golf_rules_category ON public.golf_rules USING btree (category);
CREATE INDEX idx_golf_rules_key ON public.golf_rules USING btree (rule_key);
CREATE INDEX idx_handicap_dist_lookup ON public.external_priors_handicap_dist USING btree (region, gender, handicap_bin);
CREATE INDEX idx_historical_rounds_con_diferencial ON public.historical_rounds USING btree (user_id, played_at DESC) WHERE ((slope_rating IS NOT NULL) AND (course_rating IS NOT NULL));
CREATE INDEX idx_historical_rounds_course ON public.historical_rounds USING btree (course_id);
CREATE INDEX idx_historical_rounds_diferencial ON public.historical_rounds USING btree (user_id, diferencial) WHERE (diferencial IS NOT NULL);
CREATE INDEX idx_historical_rounds_formato ON public.historical_rounds USING btree (formato_juego);
CREATE INDEX idx_historical_rounds_user ON public.historical_rounds USING btree (user_id, played_at DESC);
CREATE INDEX idx_historical_rounds_user_played ON public.historical_rounds USING btree (user_id, played_at DESC);
CREATE INDEX idx_hole_scores_round ON public.hole_scores USING btree (round_id);
CREATE INDEX idx_import_jobs_user ON public.import_jobs USING btree (user_id);
CREATE INDEX idx_inbox_media_group ON public.inbox_reports USING btree (telegram_media_group_id, telegram_msg_date DESC) WHERE (telegram_media_group_id IS NOT NULL);
CREATE INDEX idx_inbox_msgid_chat ON public.inbox_reports USING btree (telegram_message_id, telegram_chat_id);
CREATE INDEX idx_inbox_status_nuevo ON public.inbox_reports USING btree (recibido_en DESC) WHERE (status = 'nuevo'::text);
CREATE INDEX idx_knowledge_chunks_block ON public.knowledge_chunks USING btree (block_key);
CREATE INDEX idx_knowledge_chunks_embedding ON public.knowledge_chunks USING ivfflat (embedding public.vector_cosine_ops) WITH (lists='100');
CREATE INDEX idx_knowledge_chunks_source ON public.knowledge_chunks USING btree (source_id);
CREATE INDEX idx_knowledge_chunks_tsv ON public.knowledge_chunks USING gin (tsv);
CREATE INDEX idx_knowledge_sources_block ON public.knowledge_sources USING btree (block_key);
CREATE INDEX idx_knowledge_sources_jurisdiction ON public.knowledge_sources USING btree (jurisdiction);
CREATE INDEX idx_knowledge_sources_status ON public.knowledge_sources USING btree (status);
CREATE INDEX idx_match_pairings_ronda ON public.match_pairings USING btree (ronda_id);
CREATE INDEX idx_pattern_obs_round ON public.pattern_observations USING btree (round_id);
CREATE INDEX idx_pattern_obs_user_key ON public.pattern_observations USING btree (user_id, pattern_key, computed_at DESC);
CREATE INDEX idx_plan_outcomes_plan ON public.plan_outcomes USING btree (plan_id);
CREATE INDEX idx_plan_outcomes_played ON public.plan_outcomes USING btree (played_at DESC);
CREATE INDEX idx_plan_outcomes_user ON public.plan_outcomes USING btree (user_id);
CREATE INDEX idx_player_patterns_user ON public.player_patterns USING btree (user_id);
CREATE INDEX idx_players_pending_user_id ON public.players USING btree (pending_user_id) WHERE (pending_user_id IS NOT NULL);
CREATE INDEX idx_players_tournament ON public.players USING btree (tournament_id);
CREATE INDEX idx_players_tournament_status ON public.players USING btree (tournament_id, status);
CREATE INDEX idx_profiles_email ON public.profiles USING btree (email);
CREATE INDEX idx_profiles_nivel ON public.profiles USING btree (nivel);
CREATE INDEX idx_push_sub_endpoint ON public.push_subscriptions USING btree (endpoint);
CREATE INDEX idx_push_sub_user ON public.push_subscriptions USING btree (user_id);
CREATE INDEX idx_rag_query_log_created ON public.rag_query_log USING btree (created_at DESC);
CREATE INDEX idx_rag_query_log_errors ON public.rag_query_log USING btree (error_code) WHERE (error_code IS NOT NULL);
CREATE INDEX idx_rag_query_log_user ON public.rag_query_log USING btree (user_id);
CREATE INDEX idx_ronda_equipo_jugadores_equipo ON public.ronda_equipo_jugadores USING btree (equipo_id);
CREATE INDEX idx_ronda_equipos_ronda ON public.ronda_equipos USING btree (ronda_id);
CREATE INDEX idx_ronda_libre_jugadores_perfil_sugerido_id ON public.ronda_libre_jugadores USING btree (perfil_sugerido_id) WHERE (perfil_sugerido_id IS NOT NULL);
CREATE INDEX idx_ronda_libre_jugadores_ronda_id ON public.ronda_libre_jugadores USING btree (ronda_id);
CREATE INDEX idx_ronda_libre_jugadores_user_id ON public.ronda_libre_jugadores USING btree (user_id);
CREATE INDEX idx_ronda_libre_puntitos_jugador ON public.ronda_libre_puntitos USING btree (jugador_id);
CREATE INDEX idx_ronda_libre_puntitos_orden ON public.ronda_libre_puntitos USING btree (ronda_id, created_at, id);
CREATE INDEX idx_ronda_libre_retiros_ronda ON public.ronda_libre_retiros USING btree (ronda_id);
CREATE INDEX idx_rondas_libres_es_demo ON public.rondas_libres USING btree (codigo) WHERE (es_demo = true);
CREATE INDEX idx_rondas_libres_estado ON public.rondas_libres USING btree (estado);
CREATE INDEX idx_rondas_libres_estado_fecha ON public.rondas_libres USING btree (estado, fecha DESC);
CREATE INDEX idx_rondas_libres_fecha_desc ON public.rondas_libres USING btree (fecha DESC);
CREATE INDEX idx_rondas_libres_formato ON public.rondas_libres USING btree (formato_juego);
CREATE INDEX idx_round_metrics_user_time ON public.round_metrics USING btree (user_id, computed_at DESC);
CREATE INDEX idx_round_watchers_ronda ON public.round_watchers USING btree (ronda_codigo);
CREATE INDEX idx_round_watchers_sub ON public.round_watchers USING btree (push_subscription_id);
CREATE INDEX idx_round_watchers_user ON public.round_watchers USING btree (user_id);
CREATE INDEX idx_rounds_tournament ON public.rounds USING btree (tournament_id);
CREATE INDEX idx_taiger_feedback_session ON public.taiger_feedback USING btree (session_id);
CREATE INDEX idx_taiger_feedback_user ON public.taiger_feedback USING btree (user_id);
CREATE INDEX idx_taiger_message_feedback_session ON public.taiger_message_feedback USING btree (session_id);
CREATE INDEX idx_taiger_message_feedback_user ON public.taiger_message_feedback USING btree (user_id);
CREATE INDEX idx_taiger_recommendations_user ON public.taiger_recommendations USING btree (user_id, status);
CREATE INDEX idx_taiger_sessions_user ON public.taiger_sessions USING btree (user_id, created_at DESC);
CREATE INDEX idx_tdc_user ON public.tournament_draft_collaborators USING btree (user_id);
CREATE INDEX idx_tde_draft ON public.tournament_draft_events USING btree (draft_id, created_at);
CREATE INDEX idx_tdst_draft ON public.tournament_draft_share_tokens USING btree (draft_id);
CREATE INDEX idx_tdst_expires ON public.tournament_draft_share_tokens USING btree (expires_at) WHERE (consumed_at IS NULL);
CREATE INDEX idx_tournament_drafts_owner ON public.tournament_drafts USING btree (owner_id);
CREATE INDEX idx_tournament_drafts_status ON public.tournament_drafts USING btree (status);
CREATE INDEX idx_tournament_drafts_updated ON public.tournament_drafts USING btree (updated_at);
CREATE INDEX idx_tournament_group_players_group ON public.tournament_group_players USING btree (group_id);
CREATE INDEX idx_tournament_groups_tournament ON public.tournament_groups USING btree (tournament_id);
CREATE INDEX idx_tournament_rounds_course ON public.tournament_rounds USING btree (course_id);
CREATE INDEX idx_tournament_rounds_tournament ON public.tournament_rounds USING btree (tournament_id);
CREATE INDEX idx_tournaments_codigo ON public.tournaments USING btree (codigo) WHERE (codigo IS NOT NULL);
CREATE INDEX idx_tournaments_course ON public.tournaments USING btree (course_id);
CREATE INDEX idx_tournaments_es_demo ON public.tournaments USING btree (slug) WHERE (es_demo = true);
CREATE INDEX idx_tournaments_formato ON public.tournaments USING btree (formato_juego);
CREATE INDEX idx_tournaments_organizer ON public.tournaments USING btree (organizer_id);
CREATE INDEX idx_tournaments_slug ON public.tournaments USING btree (slug);
CREATE INDEX idx_tp_tournament ON public.tournament_prizes USING btree (tournament_id);
CREATE INDEX players_tee_id_idx ON public.players USING btree (tee_id) WHERE (tee_id IS NOT NULL);
CREATE UNIQUE INDEX players_tournament_id_pending_user_id_key ON public.players USING btree (tournament_id, pending_user_id) WHERE (pending_user_id IS NOT NULL);
CREATE INDEX rate_limit_hits_reset_at_idx ON public.rate_limit_hits USING btree (reset_at);
CREATE UNIQUE INDEX ronda_equipos_un_equipo_por_anotador ON public.ronda_equipos USING btree (ronda_id, anotador_user_id) WHERE (anotador_user_id IS NOT NULL);
CREATE UNIQUE INDEX taiger_sessions_user_primary_unique ON public.taiger_sessions USING btree (user_id) WHERE (is_primary = true);
CREATE UNIQUE INDEX uq_course_tees_identity ON public.course_tees USING btree (course_id, lower(nombre), COALESCE(genero, ''::text));
CREATE UNIQUE INDEX uq_courses_fedegolf_natural ON public.courses USING btree (fedegolf_club_id, fedegolf_cancha_id);
CREATE UNIQUE INDEX uq_courses_user_added_nombre ON public.courses USING btree (lower(nombre)) WHERE (fuente = 'user_added'::text);
CREATE UNIQUE INDEX uq_historical_user_date_course_gross ON public.historical_rounds USING btree (user_id, played_at, course_id, total_gross) WHERE ((course_id IS NOT NULL) AND (NOT COALESCE(((metadata ? 'ronda_libre_jugador_id'::text) OR (metadata ? 'tournament_round_id'::text)), false)));
CREATE UNIQUE INDEX ux_historical_rounds_garmin_scorecard ON public.historical_rounds USING btree (user_id, garmin_scorecard_id) WHERE (garmin_scorecard_id IS NOT NULL);
CREATE UNIQUE INDEX ux_historical_rounds_ronda_libre_jugador ON public.historical_rounds USING btree (((metadata ->> 'ronda_libre_jugador_id'::text))) WHERE (metadata ? 'ronda_libre_jugador_id'::text);
CREATE UNIQUE INDEX ux_historical_rounds_tournament_round ON public.historical_rounds USING btree (((metadata ->> 'tournament_round_id'::text))) WHERE (metadata ? 'tournament_round_id'::text);
CREATE UNIQUE INDEX ux_historical_rounds_user_ticket ON public.historical_rounds USING btree (user_id, fedegolf_ticket);
-- ===== 8. triggers =====
drop trigger if exists "on_auth_user_created" on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER trg_cerebro_weights_notify AFTER INSERT OR UPDATE ON public.cerebro_weights FOR EACH ROW EXECUTE FUNCTION public.notify_cerebro_weights_change();
CREATE TRIGGER update_courses_updated_at BEFORE UPDATE ON public.courses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_hole_scores_updated_at BEFORE UPDATE ON public.hole_scores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_knowledge_sources_updated_at BEFORE UPDATE ON public.knowledge_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER aprobar_en_juego BEFORE UPDATE OF status, tournament_id ON public.players FOR EACH ROW EXECUTE FUNCTION public.aprobar_en_juego_guard();
CREATE TRIGGER grupos_fijos_inscrito BEFORE DELETE ON public.players FOR EACH ROW EXECUTE FUNCTION public.grupos_fijos_guard_inscrito();
CREATE TRIGGER trigger_log_role_change BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.log_role_change();
CREATE TRIGGER trigger_protect_last_admin BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_last_admin();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER ronda_equipos_anotador_guard BEFORE INSERT OR UPDATE OF anotador_user_id ON public.ronda_equipos FOR EACH ROW EXECUTE FUNCTION public.ronda_equipos_anotador_guard();
CREATE TRIGGER ronda_equipos_anotador_nombre BEFORE INSERT OR UPDATE OF anotador_user_id, anotador_nombre ON public.ronda_equipos FOR EACH ROW EXECUTE FUNCTION public.ronda_equipos_anotador_nombre();
CREATE TRIGGER ronda_equipos_scores_de_su_anotador BEFORE UPDATE OF scores ON public.ronda_equipos FOR EACH ROW EXECUTE FUNCTION public.ronda_equipos_scores_de_su_anotador();
CREATE TRIGGER update_ronda_equipos_updated_at BEFORE UPDATE ON public.ronda_equipos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_ronda_libre_jugadores_updated_at BEFORE UPDATE ON public.ronda_libre_jugadores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_taiger_sessions_updated_at BEFORE UPDATE ON public.taiger_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_tournament_drafts_dueno_colaborador AFTER INSERT ON public.tournament_drafts FOR EACH ROW EXECUTE FUNCTION public.tournament_drafts_asegurar_dueno_colaborador();
CREATE TRIGGER trg_tournament_drafts_owner_change BEFORE UPDATE OF owner_id ON public.tournament_drafts FOR EACH ROW EXECUTE FUNCTION public.guard_tournament_drafts_owner_change();
CREATE TRIGGER trg_tournament_drafts_updated_at BEFORE UPDATE ON public.tournament_drafts FOR EACH ROW EXECUTE FUNCTION public.touch_tournament_drafts_updated_at();
CREATE TRIGGER grupos_fijos_jugadores_de_grupo BEFORE INSERT OR DELETE OR UPDATE ON public.tournament_group_players FOR EACH ROW EXECUTE FUNCTION public.grupos_fijos_guard_jugadores_de_grupo();
CREATE TRIGGER grupos_fijos_grupo BEFORE DELETE OR UPDATE ON public.tournament_groups FOR EACH ROW EXECUTE FUNCTION public.grupos_fijos_guard_grupo();
CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON public.tournaments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
-- ===== 9. RLS =====
alter table public."ai_usage" enable row level security;
alter table public."analytics_events" enable row level security;
alter table public."categories" enable row level security;
alter table public."cerebro_events" enable row level security;
alter table public."cerebro_weights" enable row level security;
alter table public."coach_episodic_memory" enable row level security;
alter table public."coach_eval_traces" enable row level security;
alter table public."coach_events" enable row level security;
alter table public."coach_plans" enable row level security;
alter table public."collective_insights" enable row level security;
alter table public."cost_tracking" enable row level security;
alter table public."course_holes" enable row level security;
alter table public."course_si_proposals" enable row level security;
alter table public."course_tees" enable row level security;
alter table public."courses" enable row level security;
alter table public."dev_pendientes" enable row level security;
alter table public."e2e_runs" enable row level security;
alter table public."error_logs" enable row level security;
alter table public."evaluation_runs" enable row level security;
alter table public."external_priors_amateur_benchmarks" enable row level security;
alter table public."external_priors_course_norms" enable row level security;
alter table public."external_priors_handicap_dist" enable row level security;
alter table public."fedegolf_credentials" enable row level security;
alter table public."flights" enable row level security;
alter table public."garmin_connections" enable row level security;
alter table public."golf_rules" enable row level security;
alter table public."handicap_history" enable row level security;
alter table public."historical_rounds" enable row level security;
alter table public."hole_scores" enable row level security;
alter table public."hole_scores_orden" enable row level security;
alter table public."import_jobs" enable row level security;
alter table public."inbox_reports" enable row level security;
alter table public."indice_historial" enable row level security;
alter table public."knowledge_chunks" enable row level security;
alter table public."knowledge_sources" enable row level security;
alter table public."llm_models" enable row level security;
alter table public."match_pairings" enable row level security;
alter table public."notification_preferences" enable row level security;
alter table public."pattern_definitions" enable row level security;
alter table public."pattern_observations" enable row level security;
alter table public."plan_outcomes" enable row level security;
alter table public."player_patterns" enable row level security;
alter table public."player_psych_profile" enable row level security;
alter table public."players" enable row level security;
alter table public."profiles" enable row level security;
alter table public."push_subscriptions" enable row level security;
alter table public."rag_query_log" enable row level security;
alter table public."rate_limit_hits" enable row level security;
alter table public."ronda_equipo_jugadores" enable row level security;
alter table public."ronda_equipos" enable row level security;
alter table public."ronda_equipos_scores_orden" enable row level security;
alter table public."ronda_libre_juego_orden" enable row level security;
alter table public."ronda_libre_jugadores" enable row level security;
alter table public."ronda_libre_puntitos" enable row level security;
alter table public."ronda_libre_retiros" enable row level security;
alter table public."ronda_libre_scores_orden" enable row level security;
alter table public."rondas_libres" enable row level security;
alter table public."round_metrics" enable row level security;
alter table public."round_watchers" enable row level security;
alter table public."rounds" enable row level security;
alter table public."score_audit_log" enable row level security;
alter table public."taiger_feedback" enable row level security;
alter table public."taiger_message_feedback" enable row level security;
alter table public."taiger_recommendations" enable row level security;
alter table public."taiger_sessions" enable row level security;
alter table public."timba_probadores" enable row level security;
alter table public."tournament_draft_collaborators" enable row level security;
alter table public."tournament_draft_events" enable row level security;
alter table public."tournament_draft_share_tokens" enable row level security;
alter table public."tournament_drafts" enable row level security;
alter table public."tournament_group_players" enable row level security;
alter table public."tournament_groups" enable row level security;
alter table public."tournament_prizes" enable row level security;
alter table public."tournament_rounds" enable row level security;
alter table public."tournament_templates" enable row level security;
alter table public."tournaments" enable row level security;
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname='storage'
    loop execute format('drop policy if exists %I on storage.%I', r.policyname, r.tablename); end loop;
end $$;
create policy "ai_usage_admin_read" on "public"."ai_usage" as permissive for select to public using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "ai_usage_service_all" on "public"."ai_usage" as permissive for all to "service_role" using (true) with check (true);
create policy "admin_read_analytics" on "public"."analytics_events" as permissive for select to public using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "analytics_insert_constrained" on "public"."analytics_events" as permissive for insert to public with check (((event_type IS NOT NULL) AND (length(event_type) > 0) AND (length(event_type) <= 100) AND ((session_id IS NULL) OR (length(session_id) <= 200)) AND ((device_type IS NULL) OR (length(device_type) <= 50)) AND ((event_data IS NULL) OR (length((event_data)::text) <= 5000))));
create policy "Categorias visibles" on "public"."categories" as permissive for select to public using (true);
create policy "Organizador gestiona categorias" on "public"."categories" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM public.tournaments
  WHERE ((tournaments.id = categories.tournament_id) AND (tournaments.organizer_id = auth.uid())))));
create policy "cerebro_events_insert_service" on "public"."cerebro_events" as permissive for insert to "service_role" with check (true);
create policy "cerebro_events_read_admin" on "public"."cerebro_events" as permissive for select to "authenticated" using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "cerebro_weights_read_public" on "public"."cerebro_weights" as permissive for select to public using (true);
create policy "cerebro_weights_write_admin" on "public"."cerebro_weights" as permissive for all to "authenticated" using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "episodic_owner_read" on "public"."coach_episodic_memory" as permissive for select to public using ((auth.uid() = user_id));
create policy "episodic_service_write" on "public"."coach_episodic_memory" as permissive for all to "service_role" using (true) with check (true);
create policy "coach_eval_traces_no_anon" on "public"."coach_eval_traces" as permissive for select to public using (false);
create policy "coach_events_select_admin" on "public"."coach_events" as permissive for select to public using (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
create policy "coach_plans_insert_own" on "public"."coach_plans" as permissive for insert to public with check (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
create policy "coach_plans_select_own" on "public"."coach_plans" as permissive for select to public using (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
create policy "coach_plans_update_own" on "public"."coach_plans" as permissive for update to public using (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
create policy "Authenticated users can read collective insights" on "public"."collective_insights" as permissive for select to public using ((auth.role() = 'authenticated'::text));
create policy "authenticated_read_collective_insights" on "public"."collective_insights" as permissive for select to "authenticated" using (true);
create policy "service_role_manage_collective_insights" on "public"."collective_insights" as permissive for all to "service_role" using (true) with check (true);
create policy "cost_tracking_read_admin" on "public"."cost_tracking" as permissive for select to "authenticated" using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "Hoyos visibles publicamente" on "public"."course_holes" as permissive for select to public using (true);
create policy "Solo admin gestiona hoyos" on "public"."course_holes" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "own_si_proposals" on "public"."course_si_proposals" as permissive for all to public using ((auth.uid() = proposed_by));
create policy "course_tees_select_public" on "public"."course_tees" as permissive for select to public using (true);
create policy "course_tees_write_admin" on "public"."course_tees" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "Canchas visibles publicamente" on "public"."courses" as permissive for select to public using (true);
create policy "Solo admin crea canchas" on "public"."courses" as permissive for insert to public with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "admin_dev_pendientes" on "public"."dev_pendientes" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "e2e_runs_insert_admin" on "public"."e2e_runs" as permissive for insert to public with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "e2e_runs_select_admin" on "public"."e2e_runs" as permissive for select to public using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "e2e_runs_update_admin" on "public"."e2e_runs" as permissive for update to public using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "error_logs_insert_constrained" on "public"."error_logs" as permissive for insert to "anon", "authenticated" with check (((message IS NOT NULL) AND (length(message) > 0) AND (length(message) <= 1000) AND (level IS NOT NULL) AND (level = ANY (ARRAY['error'::text, 'warn'::text, 'warning'::text, 'info'::text, 'debug'::text, 'fatal'::text])) AND ((source IS NULL) OR (length(source) <= 200)) AND ((page IS NULL) OR (length(page) <= 500)) AND ((metadata IS NULL) OR (length((metadata)::text) <= 5000))));
create policy "evaluation_runs_admin" on "public"."evaluation_runs" as permissive for all to "authenticated" using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "external_priors_amateur_benchmarks_public_read" on "public"."external_priors_amateur_benchmarks" as permissive for select to public using (true);
create policy "external_priors_amateur_benchmarks_service_write" on "public"."external_priors_amateur_benchmarks" as permissive for all to "service_role" using (true) with check (true);
create policy "external_priors_course_norms_public_read" on "public"."external_priors_course_norms" as permissive for select to public using (true);
create policy "external_priors_course_norms_service_write" on "public"."external_priors_course_norms" as permissive for all to "service_role" using (true) with check (true);
create policy "external_priors_handicap_dist_public_read" on "public"."external_priors_handicap_dist" as permissive for select to public using (true);
create policy "external_priors_handicap_dist_service_write" on "public"."external_priors_handicap_dist" as permissive for all to "service_role" using (true) with check (true);
create policy "Usuarios actualizan sus propias credenciales FedeGolf" on "public"."fedegolf_credentials" as permissive for update to "authenticated" using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Usuarios eliminan sus propias credenciales FedeGolf" on "public"."fedegolf_credentials" as permissive for delete to "authenticated" using ((auth.uid() = user_id));
create policy "Usuarios insertan sus propias credenciales FedeGolf" on "public"."fedegolf_credentials" as permissive for insert to "authenticated" with check ((auth.uid() = user_id));
create policy "Usuarios leen sus propias credenciales FedeGolf" on "public"."fedegolf_credentials" as permissive for select to "authenticated" using ((auth.uid() = user_id));
create policy "Flights visibles" on "public"."flights" as permissive for select to public using (true);
create policy "Organizador gestiona flights" on "public"."flights" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = flights.tournament_id) AND (t.organizer_id = auth.uid())))));
create policy "own_garmin" on "public"."garmin_connections" as permissive for all to public using ((auth.uid() = user_id));
create policy "Public read golf_rules" on "public"."golf_rules" as permissive for select to public using (true);
create policy "own_handicap" on "public"."handicap_history" as permissive for all to public using ((auth.uid() = user_id));
create policy "own_rounds" on "public"."historical_rounds" as permissive for all to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "public_rounds" on "public"."historical_rounds" as permissive for select to public using ((privacy = 'public'::text));
create policy "Scores visibles" on "public"."hole_scores" as permissive for select to public using (true);
create policy "import_jobs_insert_own" on "public"."import_jobs" as permissive for insert to public with check ((auth.uid() = user_id));
create policy "import_jobs_select_own" on "public"."import_jobs" as permissive for select to public using ((auth.uid() = user_id));
create policy "import_jobs_update_own" on "public"."import_jobs" as permissive for update to public using ((auth.uid() = user_id));
create policy "Usuarios insertan su propio historial de índice" on "public"."indice_historial" as permissive for insert to "authenticated" with check ((auth.uid() = user_id));
create policy "Usuarios leen su propio historial de índice" on "public"."indice_historial" as permissive for select to "authenticated" using ((auth.uid() = user_id));
create policy "knowledge_chunks_service_write" on "public"."knowledge_chunks" as permissive for all to "service_role" using (true) with check (true);
create policy "knowledge_sources_service_write" on "public"."knowledge_sources" as permissive for all to "service_role" using (true) with check (true);
create policy "llm_models_write_admin" on "public"."llm_models" as permissive for all to "authenticated" using ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))) with check ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text)))));
create policy "manage_match_pairings" on "public"."match_pairings" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM public.rondas_libres r
  WHERE ((r.id = match_pairings.ronda_id) AND (r.creador_id = auth.uid())))));
create policy "notif_prefs_all" on "public"."notification_preferences" as permissive for all to public using ((user_id = auth.uid()));
create policy "notif_prefs_insert" on "public"."notification_preferences" as permissive for insert to public with check ((user_id = auth.uid()));
create policy "pattern_definitions_read" on "public"."pattern_definitions" as permissive for select to "authenticated" using (true);
create policy "pattern_definitions_service_write" on "public"."pattern_definitions" as permissive for all to "service_role" using (true) with check (true);
create policy "pattern_obs_owner_read" on "public"."pattern_observations" as permissive for select to public using ((auth.uid() = user_id));
create policy "pattern_obs_service_write" on "public"."pattern_observations" as permissive for all to "service_role" using (true) with check (true);
create policy "plan_outcomes_select_own" on "public"."plan_outcomes" as permissive for select to public using (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::text))))));
create policy "own_patterns" on "public"."player_patterns" as permissive for all to public using ((auth.uid() = user_id));
create policy "own_psych" on "public"."player_psych_profile" as permissive for all to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Inscripciones visibles" on "public"."players" as permissive for select to public using (true);
create policy "Organizador actualiza jugador" on "public"."players" as permissive for update to public using ((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = players.tournament_id) AND (t.organizer_id = auth.uid())))));
create policy "Organizador elimina jugador" on "public"."players" as permissive for delete to public using ((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = players.tournament_id) AND (t.organizer_id = auth.uid())))));
create policy "Organizador inscribe jugador" on "public"."players" as permissive for insert to public with check ((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = players.tournament_id) AND (t.organizer_id = auth.uid())))));
create policy "Profiles solo autenticados" on "public"."profiles" as permissive for select to "authenticated" using (true);
create policy "Usuario edita perfil" on "public"."profiles" as permissive for update to public using ((auth.uid() = id));
create policy "push_sub_delete_own" on "public"."push_subscriptions" as permissive for delete to "authenticated" using ((user_id = auth.uid()));
create policy "push_sub_insert" on "public"."push_subscriptions" as permissive for insert to "authenticated" with check ((user_id = auth.uid()));
create policy "push_sub_select_own" on "public"."push_subscriptions" as permissive for select to "authenticated" using ((user_id = auth.uid()));
create policy "push_sub_update_own" on "public"."push_subscriptions" as permissive for update to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "rag_query_log_service_all" on "public"."rag_query_log" as permissive for all to "service_role" using (true) with check (true);
create policy "rag_query_log_user_read" on "public"."rag_query_log" as permissive for select to public using ((auth.uid() = user_id));
create policy "manage_ronda_equipo_jugadores" on "public"."ronda_equipo_jugadores" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM (public.ronda_equipos e
     JOIN public.rondas_libres r ON ((r.id = e.ronda_id)))
  WHERE ((e.id = ronda_equipo_jugadores.equipo_id) AND (r.creador_id = auth.uid())))));
create policy "read_ronda_equipo_jugadores" on "public"."ronda_equipo_jugadores" as permissive for select to public using (true);
create policy "manage_ronda_equipos" on "public"."ronda_equipos" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM public.rondas_libres r
  WHERE ((r.id = ronda_equipos.ronda_id) AND (r.creador_id = auth.uid())))));
create policy "read_ronda_equipos" on "public"."ronda_equipos" as permissive for select to public using (true);
create policy "gestionar_jugadores" on "public"."ronda_libre_jugadores" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM public.rondas_libres r
  WHERE ((r.id = ronda_libre_jugadores.ronda_id) AND (r.creador_id = auth.uid())))));
create policy "rlj_demo_readonly_delete" on "public"."ronda_libre_jugadores" as restrictive for delete to public using ((NOT (EXISTS ( SELECT 1
   FROM public.rondas_libres r
  WHERE ((r.id = ronda_libre_jugadores.ronda_id) AND (r.es_demo = true))))));
create policy "rlj_demo_readonly_update" on "public"."ronda_libre_jugadores" as restrictive for update to public using ((NOT (EXISTS ( SELECT 1
   FROM public.rondas_libres r
  WHERE ((r.id = ronda_libre_jugadores.ronda_id) AND (r.es_demo = true))))));
create policy "ver_jugadores" on "public"."ronda_libre_jugadores" as permissive for select to public using (true);
create policy "actualizar_ronda" on "public"."rondas_libres" as permissive for update to public using ((auth.uid() = creador_id));
create policy "crear_ronda" on "public"."rondas_libres" as permissive for insert to public with check ((auth.uid() = creador_id));
create policy "eliminar_ronda" on "public"."rondas_libres" as permissive for delete to "authenticated" using ((auth.uid() = creador_id));
create policy "rondas_libres_demo_readonly_delete" on "public"."rondas_libres" as restrictive for delete to public using ((es_demo = false));
create policy "rondas_libres_demo_readonly_update" on "public"."rondas_libres" as restrictive for update to public using ((es_demo = false)) with check ((es_demo = false));
create policy "rondas_libres_personalizado_solo_admin_insert" on "public"."rondas_libres" as restrictive for insert to public with check (((formato_juego <> 'personalizado'::text) OR public.usuario_puede_crear_timba()));
create policy "rondas_libres_personalizado_solo_admin_update" on "public"."rondas_libres" as restrictive for update to public using (true) with check (((formato_juego <> 'personalizado'::text) OR public.usuario_puede_crear_timba()));
create policy "ver_rondas" on "public"."rondas_libres" as permissive for select to public using (true);
create policy "round_metrics_owner_read" on "public"."round_metrics" as permissive for select to public using ((auth.uid() = user_id));
create policy "round_metrics_service_write" on "public"."round_metrics" as permissive for all to "service_role" using (true) with check (true);
create policy "watcher_delete_own" on "public"."round_watchers" as permissive for delete to "authenticated" using ((user_id = auth.uid()));
create policy "watcher_insert_own" on "public"."round_watchers" as permissive for insert to "authenticated" with check (((user_id = auth.uid()) AND (push_subscription_id IS NULL)));
create policy "watcher_select_own" on "public"."round_watchers" as permissive for select to "authenticated" using ((user_id = auth.uid()));
create policy "watcher_update_own" on "public"."round_watchers" as permissive for update to "authenticated" using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Rondas visibles" on "public"."rounds" as permissive for select to public using (true);
create policy "Audit visible" on "public"."score_audit_log" as permissive for select to public using ((auth.uid() = changed_by));
create policy "Sistema inserta audit" on "public"."score_audit_log" as permissive for insert to public with check ((auth.uid() = changed_by));
create policy "Users can insert own feedback" on "public"."taiger_feedback" as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can read own feedback" on "public"."taiger_feedback" as permissive for select to public using ((auth.uid() = user_id));
create policy "Users can delete own message feedback" on "public"."taiger_message_feedback" as permissive for delete to public using ((auth.uid() = user_id));
create policy "Users can insert own message feedback" on "public"."taiger_message_feedback" as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can read own message feedback" on "public"."taiger_message_feedback" as permissive for select to public using ((auth.uid() = user_id));
create policy "Users can update own message feedback" on "public"."taiger_message_feedback" as permissive for update to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can insert own recommendations" on "public"."taiger_recommendations" as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can read own recommendations" on "public"."taiger_recommendations" as permissive for select to public using ((auth.uid() = user_id));
create policy "Users can update own recommendations" on "public"."taiger_recommendations" as permissive for update to public using ((auth.uid() = user_id));
create policy "own_sessions" on "public"."taiger_sessions" as permissive for all to public using ((auth.uid() = user_id));
create policy "tdc_delete" on "public"."tournament_draft_collaborators" as permissive for delete to public using ((draft_id IN ( SELECT tournament_drafts.id
   FROM public.tournament_drafts
  WHERE (tournament_drafts.owner_id = auth.uid()))));
create policy "tdc_insert" on "public"."tournament_draft_collaborators" as permissive for insert to public with check ((draft_id IN ( SELECT tournament_drafts.id
   FROM public.tournament_drafts
  WHERE (tournament_drafts.owner_id = auth.uid()))));
create policy "tdc_select" on "public"."tournament_draft_collaborators" as permissive for select to public using (((user_id = auth.uid()) OR (draft_id IN ( SELECT tournament_drafts.id
   FROM public.tournament_drafts
  WHERE (tournament_drafts.owner_id = auth.uid())))));
create policy "tde_select" on "public"."tournament_draft_events" as permissive for select to public using ((EXISTS ( SELECT 1
   FROM public.tournament_drafts d
  WHERE ((d.id = tournament_draft_events.draft_id) AND ((d.owner_id = auth.uid()) OR public.is_draft_collaborator(d.id, auth.uid()))))));
create policy "tdst_insert" on "public"."tournament_draft_share_tokens" as permissive for insert to public with check ((created_by = auth.uid()));
create policy "tdst_select" on "public"."tournament_draft_share_tokens" as permissive for select to public using (((created_by = auth.uid()) OR (draft_id IN ( SELECT tournament_drafts.id
   FROM public.tournament_drafts
  WHERE (tournament_drafts.owner_id = auth.uid())))));
create policy "tournament_drafts_delete" on "public"."tournament_drafts" as permissive for delete to public using ((owner_id = auth.uid()));
create policy "tournament_drafts_insert" on "public"."tournament_drafts" as permissive for insert to public with check ((owner_id = auth.uid()));
create policy "tournament_drafts_select" on "public"."tournament_drafts" as permissive for select to public using (((owner_id = auth.uid()) OR public.is_draft_collaborator(id, auth.uid())));
create policy "tournament_drafts_update" on "public"."tournament_drafts" as permissive for update to public using (((owner_id = auth.uid()) OR public.is_draft_collaborator(id, auth.uid())));
create policy "Organizer manage tournament_group_players" on "public"."tournament_group_players" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM (public.tournament_groups tg
     JOIN public.tournaments t ON ((t.id = tg.tournament_id)))
  WHERE ((tg.id = tournament_group_players.group_id) AND (t.organizer_id = auth.uid())))));
create policy "Public read tournament_group_players" on "public"."tournament_group_players" as permissive for select to public using (true);
create policy "Organizer manage tournament_groups" on "public"."tournament_groups" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = tournament_groups.tournament_id) AND (t.organizer_id = auth.uid())))));
create policy "Public read tournament_groups" on "public"."tournament_groups" as permissive for select to public using (true);
create policy "tp_select" on "public"."tournament_prizes" as permissive for select to public using (((tournament_id IN ( SELECT tournaments.id
   FROM public.tournaments
  WHERE (tournaments.organizer_id = auth.uid()))) OR (tournament_id IN ( SELECT players.tournament_id
   FROM public.players
  WHERE (players.user_id = auth.uid())))));
create policy "tournament_rounds_organizer_all" on "public"."tournament_rounds" as permissive for all to public using ((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = tournament_rounds.tournament_id) AND (t.organizer_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE ((t.id = tournament_rounds.tournament_id) AND (t.organizer_id = auth.uid())))));
create policy "tournament_rounds_select" on "public"."tournament_rounds" as permissive for select to public using ((EXISTS ( SELECT 1
   FROM public.tournaments t
  WHERE (t.id = tournament_rounds.tournament_id))));
create policy "tt_insert" on "public"."tournament_templates" as permissive for insert to public with check ((owner_id = auth.uid()));
create policy "tt_select" on "public"."tournament_templates" as permissive for select to public using ((is_global OR (owner_id = auth.uid())));
create policy "Organizador crea torneos" on "public"."tournaments" as permissive for insert to public with check ((auth.uid() = organizer_id));
create policy "Organizador edita torneos" on "public"."tournaments" as permissive for update to public using ((auth.uid() = organizer_id));
create policy "Organizador ve sus torneos" on "public"."tournaments" as permissive for select to public using ((auth.uid() = organizer_id));
create policy "Torneos publicos" on "public"."tournaments" as permissive for select to public using ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'closed'::text, 'published'::text])));
create policy "tournaments_demo_readonly_delete" on "public"."tournaments" as restrictive for delete to public using ((es_demo = false));
create policy "tournaments_demo_readonly_update" on "public"."tournaments" as restrictive for update to public using ((es_demo = false)) with check ((es_demo = false));
-- ===== 10. privilegios =====
revoke all on table public."ai_usage" from public, anon, authenticated, service_role, postgres;
revoke all on table public."analytics_events" from public, anon, authenticated, service_role, postgres;
revoke all on table public."categories" from public, anon, authenticated, service_role, postgres;
revoke all on table public."cerebro_events" from public, anon, authenticated, service_role, postgres;
revoke all on table public."cerebro_weights" from public, anon, authenticated, service_role, postgres;
revoke all on table public."coach_episodic_memory" from public, anon, authenticated, service_role, postgres;
revoke all on table public."coach_eval_traces" from public, anon, authenticated, service_role, postgres;
revoke all on table public."coach_events" from public, anon, authenticated, service_role, postgres;
revoke all on table public."coach_plans" from public, anon, authenticated, service_role, postgres;
revoke all on table public."collective_insights" from public, anon, authenticated, service_role, postgres;
revoke all on table public."cost_tracking" from public, anon, authenticated, service_role, postgres;
revoke all on table public."course_holes" from public, anon, authenticated, service_role, postgres;
revoke all on table public."course_si_proposals" from public, anon, authenticated, service_role, postgres;
revoke all on table public."course_tees" from public, anon, authenticated, service_role, postgres;
revoke all on table public."courses" from public, anon, authenticated, service_role, postgres;
revoke all on table public."dev_pendientes" from public, anon, authenticated, service_role, postgres;
revoke all on table public."e2e_runs" from public, anon, authenticated, service_role, postgres;
revoke all on table public."error_logs" from public, anon, authenticated, service_role, postgres;
revoke all on table public."evaluation_runs" from public, anon, authenticated, service_role, postgres;
revoke all on table public."external_priors_amateur_benchmarks" from public, anon, authenticated, service_role, postgres;
revoke all on table public."external_priors_course_norms" from public, anon, authenticated, service_role, postgres;
revoke all on table public."external_priors_handicap_dist" from public, anon, authenticated, service_role, postgres;
revoke all on table public."fedegolf_credentials" from public, anon, authenticated, service_role, postgres;
revoke all on table public."flights" from public, anon, authenticated, service_role, postgres;
revoke all on table public."garmin_connections" from public, anon, authenticated, service_role, postgres;
revoke all on table public."golf_rules" from public, anon, authenticated, service_role, postgres;
revoke all on table public."handicap_history" from public, anon, authenticated, service_role, postgres;
revoke all on table public."historical_rounds" from public, anon, authenticated, service_role, postgres;
revoke all on table public."hole_scores" from public, anon, authenticated, service_role, postgres;
revoke all on table public."hole_scores_orden" from public, anon, authenticated, service_role, postgres;
revoke all on table public."import_jobs" from public, anon, authenticated, service_role, postgres;
revoke all on table public."inbox_reports" from public, anon, authenticated, service_role, postgres;
revoke all on table public."indice_historial" from public, anon, authenticated, service_role, postgres;
revoke all on table public."knowledge_chunks" from public, anon, authenticated, service_role, postgres;
revoke all on table public."knowledge_sources" from public, anon, authenticated, service_role, postgres;
revoke all on table public."llm_models" from public, anon, authenticated, service_role, postgres;
revoke all on table public."match_pairings" from public, anon, authenticated, service_role, postgres;
revoke all on table public."notification_preferences" from public, anon, authenticated, service_role, postgres;
revoke all on table public."pattern_definitions" from public, anon, authenticated, service_role, postgres;
revoke all on table public."pattern_observations" from public, anon, authenticated, service_role, postgres;
revoke all on table public."plan_outcomes" from public, anon, authenticated, service_role, postgres;
revoke all on table public."player_patterns" from public, anon, authenticated, service_role, postgres;
revoke all on table public."player_psych_profile" from public, anon, authenticated, service_role, postgres;
revoke all on table public."players" from public, anon, authenticated, service_role, postgres;
revoke all on table public."profiles" from public, anon, authenticated, service_role, postgres;
revoke all on table public."push_subscriptions" from public, anon, authenticated, service_role, postgres;
revoke all on table public."rag_query_log" from public, anon, authenticated, service_role, postgres;
revoke all on table public."rate_limit_hits" from public, anon, authenticated, service_role, postgres;
revoke all on table public."ronda_equipo_jugadores" from public, anon, authenticated, service_role, postgres;
revoke all on table public."ronda_equipos" from public, anon, authenticated, service_role, postgres;
revoke all on table public."ronda_equipos_scores_orden" from public, anon, authenticated, service_role, postgres;
revoke all on table public."ronda_libre_juego_orden" from public, anon, authenticated, service_role, postgres;
revoke all on table public."ronda_libre_jugadores" from public, anon, authenticated, service_role, postgres;
revoke all on table public."ronda_libre_puntitos" from public, anon, authenticated, service_role, postgres;
revoke all on table public."ronda_libre_retiros" from public, anon, authenticated, service_role, postgres;
revoke all on table public."ronda_libre_scores_orden" from public, anon, authenticated, service_role, postgres;
revoke all on table public."rondas_libres" from public, anon, authenticated, service_role, postgres;
revoke all on table public."round_metrics" from public, anon, authenticated, service_role, postgres;
revoke all on table public."round_watchers" from public, anon, authenticated, service_role, postgres;
revoke all on table public."rounds" from public, anon, authenticated, service_role, postgres;
revoke all on table public."score_audit_log" from public, anon, authenticated, service_role, postgres;
revoke all on table public."taiger_feedback" from public, anon, authenticated, service_role, postgres;
revoke all on table public."taiger_message_feedback" from public, anon, authenticated, service_role, postgres;
revoke all on table public."taiger_recommendations" from public, anon, authenticated, service_role, postgres;
revoke all on table public."taiger_sessions" from public, anon, authenticated, service_role, postgres;
revoke all on table public."timba_probadores" from public, anon, authenticated, service_role, postgres;
revoke all on table public."tournament_draft_collaborators" from public, anon, authenticated, service_role, postgres;
revoke all on table public."tournament_draft_events" from public, anon, authenticated, service_role, postgres;
revoke all on table public."tournament_draft_share_tokens" from public, anon, authenticated, service_role, postgres;
revoke all on table public."tournament_drafts" from public, anon, authenticated, service_role, postgres;
revoke all on table public."tournament_group_players" from public, anon, authenticated, service_role, postgres;
revoke all on table public."tournament_groups" from public, anon, authenticated, service_role, postgres;
revoke all on table public."tournament_prizes" from public, anon, authenticated, service_role, postgres;
revoke all on table public."tournament_rounds" from public, anon, authenticated, service_role, postgres;
revoke all on table public."tournament_templates" from public, anon, authenticated, service_role, postgres;
revoke all on table public."tournaments" from public, anon, authenticated, service_role, postgres;
revoke all on sequence public."cerebro_events_id_seq" from public, anon, authenticated, service_role, postgres;
revoke all on sequence public."coach_events_id_seq" from public, anon, authenticated, service_role, postgres;
revoke all on sequence public."cost_tracking_id_seq" from public, anon, authenticated, service_role, postgres;
revoke all on sequence public."external_priors_amateur_benchmarks_id_seq" from public, anon, authenticated, service_role, postgres;
revoke all on sequence public."external_priors_course_norms_id_seq" from public, anon, authenticated, service_role, postgres;
revoke all on sequence public."external_priors_handicap_dist_id_seq" from public, anon, authenticated, service_role, postgres;
revoke all on sequence public."pattern_observations_id_seq" from public, anon, authenticated, service_role, postgres;
revoke all on function public.aprobar_en_juego_guard() from public, anon, authenticated, service_role, postgres;
revoke all on function public.asegurar_tarjeta_vigente(uuid,uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.backfill_handicap_de_inscripcion() from public, anon, authenticated, service_role, postgres;
revoke all on function public.calcular_indice_golfers(uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.cleanup_old_e2e_runs() from public, anon, authenticated, service_role, postgres;
revoke all on function public.colocar_inscrito_en_grupo(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,boolean) from public, anon, authenticated, service_role, postgres;
revoke all on function public.course_name_canonical_ordered(text) from public, anon, authenticated, service_role, postgres;
revoke all on function public.course_name_canonical(text) from public, anon, authenticated, service_role, postgres;
revoke all on function public.course_name_tokens(text) from public, anon, authenticated, service_role, postgres;
revoke all on function public.descartar_ronda_libre(text) from public, anon, authenticated, service_role, postgres;
revoke all on function public.editar_handicap_inscrito(uuid,numeric,numeric,boolean,numeric,jsonb,jsonb) from public, anon, authenticated, service_role, postgres;
revoke all on function public.eliminar_cuenta(uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.enroll_player(uuid,text,uuid,text,numeric,uuid,text) from public, anon, authenticated, service_role, postgres;
revoke all on function public.exec_sql(text) from public, anon, authenticated, service_role, postgres;
revoke all on function public.finalizar_ronda_libre(text) from public, anon, authenticated, service_role, postgres;
revoke all on function public.grupos_fijos_guard_grupo() from public, anon, authenticated, service_role, postgres;
revoke all on function public.grupos_fijos_guard_inscrito() from public, anon, authenticated, service_role, postgres;
revoke all on function public.grupos_fijos_guard_jugadores_de_grupo() from public, anon, authenticated, service_role, postgres;
revoke all on function public.guard_tournament_drafts_owner_change() from public, anon, authenticated, service_role, postgres;
revoke all on function public.guardar_hole_score(jsonb,bigint,uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role, postgres;
revoke all on function public.is_draft_collaborator(uuid,uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.liberar_equipo_de_ronda(text,uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.log_role_change() from public, anon, authenticated, service_role, postgres;
revoke all on function public.marcar_puntito_ronda_libre(text,uuid,integer,text,boolean,bigint,uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.marcar_retiro_ronda_libre(text,uuid,integer,bigint,uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.merge_ronda_player_scores(uuid,jsonb) from public, anon, authenticated, service_role, postgres;
revoke all on function public.notify_cerebro_weights_change() from public, anon, authenticated, service_role, postgres;
revoke all on function public.protect_last_admin() from public, anon, authenticated, service_role, postgres;
revoke all on function public.puede_anotar_ronda(uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.rate_limit_hit(text,integer,integer) from public, anon, authenticated, service_role, postgres;
revoke all on function public.reclamar_equipo_de_ronda(text,uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.resolve_and_link_course(text,jsonb,real,text) from public, anon, authenticated, service_role, postgres;
revoke all on function public.restamp_round_metrics_target(uuid,numeric) from public, anon, authenticated, service_role, postgres;
revoke all on function public.rls_write_policies_audit() from public, anon, authenticated, service_role, postgres;
revoke all on function public.ronda_equipos_anotador_guard() from public, anon, authenticated, service_role, postgres;
revoke all on function public.ronda_equipos_anotador_nombre() from public, anon, authenticated, service_role, postgres;
revoke all on function public.ronda_equipos_scores_de_su_anotador() from public, anon, authenticated, service_role, postgres;
revoke all on function public.search_chunks_hybrid(public.vector,text,numeric,integer,text[],text) from public, anon, authenticated, service_role, postgres;
revoke all on function public.tarjeta_tiene_anotaciones(jsonb) from public, anon, authenticated, service_role, postgres;
revoke all on function public.timba_registrar_secuencia(uuid,text,bigint,uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.timba_ronda_para_escribir(text,uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.torneo_con_grupos_fijos(uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.touch_tournament_drafts_updated_at() from public, anon, authenticated, service_role, postgres;
revoke all on function public.tournament_drafts_asegurar_dueno_colaborador() from public, anon, authenticated, service_role, postgres;
revoke all on function public.unaccent_immutable(text) from public, anon, authenticated, service_role, postgres;
revoke all on function public.update_updated_at() from public, anon, authenticated, service_role, postgres;
revoke all on function public.upsert_ronda_equipos_scores(uuid,text,jsonb,bigint,uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.upsert_ronda_libre_scores(uuid,text,jsonb,bigint,uuid) from public, anon, authenticated, service_role, postgres;
revoke all on function public.usuario_es_admin() from public, anon, authenticated, service_role, postgres;
revoke all on function public.usuario_puede_crear_timba() from public, anon, authenticated, service_role, postgres;
revoke all on function public.validate_score_delta(jsonb) from public, anon, authenticated, service_role, postgres;
grant DELETE, INSERT, SELECT, UPDATE on table public."ai_usage" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_usage" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ai_usage" to service_role;
grant INSERT on table public."analytics_events" to anon;
grant DELETE, INSERT, SELECT, UPDATE on table public."analytics_events" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."analytics_events" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."analytics_events" to service_role;
grant SELECT on table public."categories" to anon;
grant DELETE, INSERT, SELECT, UPDATE on table public."categories" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."categories" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."categories" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."cerebro_events" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cerebro_events" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cerebro_events" to service_role;
grant SELECT, UPDATE, USAGE on sequence public."cerebro_events_id_seq" to authenticated;
grant SELECT, UPDATE, USAGE on sequence public."cerebro_events_id_seq" to postgres;
grant SELECT, UPDATE, USAGE on sequence public."cerebro_events_id_seq" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."cerebro_weights" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cerebro_weights" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cerebro_weights" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."coach_episodic_memory" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."coach_episodic_memory" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."coach_episodic_memory" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."coach_eval_traces" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."coach_eval_traces" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."coach_eval_traces" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."coach_events" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."coach_events" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."coach_events" to service_role;
grant SELECT, UPDATE, USAGE on sequence public."coach_events_id_seq" to authenticated;
grant SELECT, UPDATE, USAGE on sequence public."coach_events_id_seq" to postgres;
grant SELECT, UPDATE, USAGE on sequence public."coach_events_id_seq" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."coach_plans" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."coach_plans" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."coach_plans" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."collective_insights" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."collective_insights" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."collective_insights" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."cost_tracking" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cost_tracking" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."cost_tracking" to service_role;
grant SELECT, UPDATE, USAGE on sequence public."cost_tracking_id_seq" to authenticated;
grant SELECT, UPDATE, USAGE on sequence public."cost_tracking_id_seq" to postgres;
grant SELECT, UPDATE, USAGE on sequence public."cost_tracking_id_seq" to service_role;
grant SELECT on table public."course_holes" to anon;
grant DELETE, INSERT, SELECT, UPDATE on table public."course_holes" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."course_holes" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."course_holes" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."course_si_proposals" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."course_si_proposals" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."course_si_proposals" to service_role;
grant SELECT on table public."course_tees" to anon;
grant DELETE, INSERT, SELECT, UPDATE on table public."course_tees" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."course_tees" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."course_tees" to service_role;
grant SELECT on table public."courses" to anon;
grant DELETE, INSERT, SELECT, UPDATE on table public."courses" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."courses" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."courses" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."dev_pendientes" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."dev_pendientes" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."dev_pendientes" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."e2e_runs" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."e2e_runs" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."e2e_runs" to service_role;
grant INSERT on table public."error_logs" to anon;
grant DELETE, INSERT, SELECT, UPDATE on table public."error_logs" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."error_logs" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."error_logs" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."evaluation_runs" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."evaluation_runs" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."evaluation_runs" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."external_priors_amateur_benchmarks" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."external_priors_amateur_benchmarks" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."external_priors_amateur_benchmarks" to service_role;
grant SELECT, UPDATE, USAGE on sequence public."external_priors_amateur_benchmarks_id_seq" to authenticated;
grant SELECT, UPDATE, USAGE on sequence public."external_priors_amateur_benchmarks_id_seq" to postgres;
grant SELECT, UPDATE, USAGE on sequence public."external_priors_amateur_benchmarks_id_seq" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."external_priors_course_norms" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."external_priors_course_norms" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."external_priors_course_norms" to service_role;
grant SELECT, UPDATE, USAGE on sequence public."external_priors_course_norms_id_seq" to authenticated;
grant SELECT, UPDATE, USAGE on sequence public."external_priors_course_norms_id_seq" to postgres;
grant SELECT, UPDATE, USAGE on sequence public."external_priors_course_norms_id_seq" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."external_priors_handicap_dist" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."external_priors_handicap_dist" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."external_priors_handicap_dist" to service_role;
grant SELECT, UPDATE, USAGE on sequence public."external_priors_handicap_dist_id_seq" to authenticated;
grant SELECT, UPDATE, USAGE on sequence public."external_priors_handicap_dist_id_seq" to postgres;
grant SELECT, UPDATE, USAGE on sequence public."external_priors_handicap_dist_id_seq" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."fedegolf_credentials" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."fedegolf_credentials" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."fedegolf_credentials" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."flights" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."flights" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."flights" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."garmin_connections" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."garmin_connections" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."garmin_connections" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."golf_rules" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."golf_rules" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."golf_rules" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."handicap_history" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."handicap_history" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."handicap_history" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."historical_rounds" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."historical_rounds" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."historical_rounds" to service_role;
grant SELECT on table public."hole_scores" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."hole_scores" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."hole_scores" to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."hole_scores_orden" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."hole_scores_orden" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."import_jobs" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."import_jobs" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."import_jobs" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."inbox_reports" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."inbox_reports" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."inbox_reports" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."indice_historial" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."indice_historial" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."indice_historial" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."knowledge_chunks" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."knowledge_chunks" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."knowledge_chunks" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."knowledge_sources" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."knowledge_sources" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."knowledge_sources" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."llm_models" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."llm_models" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."llm_models" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."match_pairings" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."match_pairings" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."match_pairings" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."notification_preferences" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."notification_preferences" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."notification_preferences" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."pattern_definitions" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."pattern_definitions" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."pattern_definitions" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."pattern_observations" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."pattern_observations" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."pattern_observations" to service_role;
grant SELECT, UPDATE, USAGE on sequence public."pattern_observations_id_seq" to authenticated;
grant SELECT, UPDATE, USAGE on sequence public."pattern_observations_id_seq" to postgres;
grant SELECT, UPDATE, USAGE on sequence public."pattern_observations_id_seq" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."plan_outcomes" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."plan_outcomes" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."plan_outcomes" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."player_patterns" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."player_patterns" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."player_patterns" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."player_psych_profile" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."player_psych_profile" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."player_psych_profile" to service_role;
grant DELETE, INSERT, UPDATE on table public."players" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."players" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."players" to service_role;
grant DELETE, INSERT on table public."profiles" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."profiles" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."profiles" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."push_subscriptions" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."push_subscriptions" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."push_subscriptions" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."rag_query_log" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rag_query_log" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rag_query_log" to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rate_limit_hits" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rate_limit_hits" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."ronda_equipo_jugadores" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_equipo_jugadores" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_equipo_jugadores" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."ronda_equipos" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_equipos" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_equipos" to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_equipos_scores_orden" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_equipos_scores_orden" to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_libre_juego_orden" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_libre_juego_orden" to service_role;
grant DELETE, INSERT, UPDATE on table public."ronda_libre_jugadores" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_libre_jugadores" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_libre_jugadores" to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_libre_puntitos" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_libre_puntitos" to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_libre_retiros" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_libre_retiros" to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_libre_scores_orden" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."ronda_libre_scores_orden" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."rondas_libres" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rondas_libres" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rondas_libres" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."round_metrics" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."round_metrics" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."round_metrics" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."round_watchers" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."round_watchers" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."round_watchers" to service_role;
grant SELECT on table public."rounds" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rounds" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."rounds" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."score_audit_log" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."score_audit_log" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."score_audit_log" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."taiger_feedback" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."taiger_feedback" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."taiger_feedback" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."taiger_message_feedback" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."taiger_message_feedback" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."taiger_message_feedback" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."taiger_recommendations" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."taiger_recommendations" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."taiger_recommendations" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."taiger_sessions" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."taiger_sessions" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."taiger_sessions" to service_role;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."timba_probadores" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."timba_probadores" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."tournament_draft_collaborators" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_draft_collaborators" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_draft_collaborators" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."tournament_draft_events" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_draft_events" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_draft_events" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."tournament_draft_share_tokens" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_draft_share_tokens" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_draft_share_tokens" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."tournament_drafts" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_drafts" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_drafts" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."tournament_group_players" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_group_players" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_group_players" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."tournament_groups" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_groups" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_groups" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."tournament_prizes" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_prizes" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_prizes" to service_role;
grant SELECT on table public."tournament_rounds" to anon;
grant DELETE, INSERT, SELECT, UPDATE on table public."tournament_rounds" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_rounds" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_rounds" to service_role;
grant DELETE, INSERT, SELECT, UPDATE on table public."tournament_templates" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_templates" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournament_templates" to service_role;
grant SELECT on table public."tournaments" to anon;
grant DELETE, INSERT, SELECT, UPDATE on table public."tournaments" to authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournaments" to postgres;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public."tournaments" to service_role;
grant SELECT ("course_id", "course_name", "formato_juego", "holes_played", "id", "modo_juego", "par_per_hole", "played_at", "privacy", "scores", "tee_color", "total_gross", "user_id") on table public."historical_rounds" to anon;
grant SELECT ("fairway_hit", "gir", "gross_score", "hole_number", "id", "net_score", "par", "points", "putts", "round_id") on table public."hole_scores" to anon;
grant SELECT ("category_id", "created_at", "genero", "handicap_at_registration", "id", "player_name", "status", "status_reason", "tee_id", "tournament_id", "user_id") on table public."players" to anon;
grant SELECT ("category_id", "created_at", "flight_id", "genero", "handicap_at_registration", "id", "player_name", "status", "status_changed_at", "status_reason", "tee_id", "tees", "tournament_id", "user_id") on table public."players" to authenticated;
grant SELECT ("analysis_level", "avatar_url", "cerebro_v3_enabled", "coach_access_enabled", "cpi_score", "cpi_status", "cpi_trend", "cpi_updated_at", "created_at", "default_tee_color", "founding_member_at", "genero", "golf_goals", "id", "indice", "indice_golfers", "indice_golfers_updated_at", "is_founding_member", "name", "nivel", "nivel_expires_at", "nivel_updated_at", "patterns_need_recalc", "role", "subscription_status", "subscription_tier", "target_deadline", "target_handicap", "target_set_at", "trial_ends_at", "trial_rounds_remaining", "updated_at") on table public."profiles" to authenticated;
grant UPDATE ("analysis_level", "avatar_url", "default_tee_color", "fecha_nacimiento", "genero", "golf_goals", "indice", "name", "nivel", "nivel_expires_at", "nivel_updated_at", "patterns_need_recalc", "target_deadline", "target_handicap", "target_set_at", "updated_at") on table public."profiles" to authenticated;
grant SELECT ("avatar_url", "id", "indice", "indice_golfers", "name", "nivel") on table public."profiles" to anon;
grant SELECT ("equipo_id", "jugador_id", "orden") on table public."ronda_equipo_jugadores" to anon;
grant SELECT ("created_at", "handicap_equipo", "handicap_equipo_juego", "handicap_origen", "id", "nombre", "ronda_id", "scores") on table public."ronda_equipos" to anon;
grant SELECT ("created_at", "handicap", "handicap_de_inscripcion", "id", "is_guest", "nombre", "nombre_invitado", "pending_user_id", "ronda_id", "scores", "tarjeta_aceptada", "tees", "user_id") on table public."ronda_libre_jugadores" to authenticated;
grant SELECT ("handicap", "handicap_de_inscripcion", "id", "nombre", "ronda_id", "scores", "tees", "user_id") on table public."ronda_libre_jugadores" to anon;
grant SELECT ("admin_mode", "admin_user_id", "codigo", "course_id", "course_name", "creador_id", "created_at", "es_demo", "estado", "fecha", "formato_juego", "hcp_pct", "holes", "hoyo_inicio", "id", "modo_juego", "recorridos", "tees") on table public."rondas_libres" to anon;
grant SELECT ("closed_at", "id", "player_id", "round_number", "status", "total_gross", "total_net", "total_points", "tournament_id") on table public."rounds" to anon;
grant SELECT ("group_id", "id", "jugador_ronda_id", "player_id") on table public."tournament_group_players" to anon;
grant SELECT ("id", "name", "ronda_libre_id", "sort_order", "tee_time", "tournament_id") on table public."tournament_groups" to anon;
grant EXECUTE on function public.aprobar_en_juego_guard() to postgres;
grant EXECUTE on function public.asegurar_tarjeta_vigente(uuid,uuid) to postgres;
grant EXECUTE on function public.asegurar_tarjeta_vigente(uuid,uuid) to service_role;
grant EXECUTE on function public.backfill_handicap_de_inscripcion() to postgres;
grant EXECUTE on function public.calcular_indice_golfers(uuid) to authenticated;
grant EXECUTE on function public.calcular_indice_golfers(uuid) to postgres;
grant EXECUTE on function public.calcular_indice_golfers(uuid) to service_role;
grant EXECUTE on function public.cleanup_old_e2e_runs() to postgres;
grant EXECUTE on function public.cleanup_old_e2e_runs() to service_role;
grant EXECUTE on function public.colocar_inscrito_en_grupo(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,boolean) to postgres;
grant EXECUTE on function public.colocar_inscrito_en_grupo(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,boolean) to service_role;
grant EXECUTE on function public.course_name_canonical_ordered(text) to anon;
grant EXECUTE on function public.course_name_canonical_ordered(text) to authenticated;
grant EXECUTE on function public.course_name_canonical_ordered(text) to postgres;
grant EXECUTE on function public.course_name_canonical_ordered(text) to public;
grant EXECUTE on function public.course_name_canonical_ordered(text) to service_role;
grant EXECUTE on function public.course_name_canonical(text) to anon;
grant EXECUTE on function public.course_name_canonical(text) to authenticated;
grant EXECUTE on function public.course_name_canonical(text) to postgres;
grant EXECUTE on function public.course_name_canonical(text) to public;
grant EXECUTE on function public.course_name_canonical(text) to service_role;
grant EXECUTE on function public.course_name_tokens(text) to anon;
grant EXECUTE on function public.course_name_tokens(text) to authenticated;
grant EXECUTE on function public.course_name_tokens(text) to postgres;
grant EXECUTE on function public.course_name_tokens(text) to public;
grant EXECUTE on function public.course_name_tokens(text) to service_role;
grant EXECUTE on function public.descartar_ronda_libre(text) to authenticated;
grant EXECUTE on function public.descartar_ronda_libre(text) to postgres;
grant EXECUTE on function public.descartar_ronda_libre(text) to service_role;
grant EXECUTE on function public.editar_handicap_inscrito(uuid,numeric,numeric,boolean,numeric,jsonb,jsonb) to postgres;
grant EXECUTE on function public.editar_handicap_inscrito(uuid,numeric,numeric,boolean,numeric,jsonb,jsonb) to service_role;
grant EXECUTE on function public.eliminar_cuenta(uuid) to postgres;
grant EXECUTE on function public.eliminar_cuenta(uuid) to service_role;
grant EXECUTE on function public.enroll_player(uuid,text,uuid,text,numeric,uuid,text) to postgres;
grant EXECUTE on function public.enroll_player(uuid,text,uuid,text,numeric,uuid,text) to service_role;
grant EXECUTE on function public.exec_sql(text) to postgres;
grant EXECUTE on function public.exec_sql(text) to service_role;
grant EXECUTE on function public.finalizar_ronda_libre(text) to anon;
grant EXECUTE on function public.finalizar_ronda_libre(text) to authenticated;
grant EXECUTE on function public.finalizar_ronda_libre(text) to postgres;
grant EXECUTE on function public.finalizar_ronda_libre(text) to service_role;
grant EXECUTE on function public.grupos_fijos_guard_grupo() to postgres;
grant EXECUTE on function public.grupos_fijos_guard_grupo() to service_role;
grant EXECUTE on function public.grupos_fijos_guard_inscrito() to postgres;
grant EXECUTE on function public.grupos_fijos_guard_inscrito() to service_role;
grant EXECUTE on function public.grupos_fijos_guard_jugadores_de_grupo() to postgres;
grant EXECUTE on function public.grupos_fijos_guard_jugadores_de_grupo() to service_role;
grant EXECUTE on function public.guard_tournament_drafts_owner_change() to postgres;
grant EXECUTE on function public.guard_tournament_drafts_owner_change() to service_role;
grant EXECUTE on function public.guardar_hole_score(jsonb,bigint,uuid) to postgres;
grant EXECUTE on function public.guardar_hole_score(jsonb,bigint,uuid) to service_role;
grant EXECUTE on function public.handle_new_user() to postgres;
grant EXECUTE on function public.handle_new_user() to service_role;
grant EXECUTE on function public.is_draft_collaborator(uuid,uuid) to anon;
grant EXECUTE on function public.is_draft_collaborator(uuid,uuid) to authenticated;
grant EXECUTE on function public.is_draft_collaborator(uuid,uuid) to postgres;
grant EXECUTE on function public.is_draft_collaborator(uuid,uuid) to service_role;
grant EXECUTE on function public.liberar_equipo_de_ronda(text,uuid) to authenticated;
grant EXECUTE on function public.liberar_equipo_de_ronda(text,uuid) to postgres;
grant EXECUTE on function public.liberar_equipo_de_ronda(text,uuid) to service_role;
grant EXECUTE on function public.log_role_change() to postgres;
grant EXECUTE on function public.log_role_change() to service_role;
grant EXECUTE on function public.marcar_puntito_ronda_libre(text,uuid,integer,text,boolean,bigint,uuid) to authenticated;
grant EXECUTE on function public.marcar_puntito_ronda_libre(text,uuid,integer,text,boolean,bigint,uuid) to postgres;
grant EXECUTE on function public.marcar_puntito_ronda_libre(text,uuid,integer,text,boolean,bigint,uuid) to service_role;
grant EXECUTE on function public.marcar_retiro_ronda_libre(text,uuid,integer,bigint,uuid) to authenticated;
grant EXECUTE on function public.marcar_retiro_ronda_libre(text,uuid,integer,bigint,uuid) to postgres;
grant EXECUTE on function public.marcar_retiro_ronda_libre(text,uuid,integer,bigint,uuid) to service_role;
grant EXECUTE on function public.merge_ronda_player_scores(uuid,jsonb) to postgres;
grant EXECUTE on function public.merge_ronda_player_scores(uuid,jsonb) to service_role;
grant EXECUTE on function public.notify_cerebro_weights_change() to anon;
grant EXECUTE on function public.notify_cerebro_weights_change() to authenticated;
grant EXECUTE on function public.notify_cerebro_weights_change() to postgres;
grant EXECUTE on function public.notify_cerebro_weights_change() to public;
grant EXECUTE on function public.notify_cerebro_weights_change() to service_role;
grant EXECUTE on function public.protect_last_admin() to anon;
grant EXECUTE on function public.protect_last_admin() to authenticated;
grant EXECUTE on function public.protect_last_admin() to postgres;
grant EXECUTE on function public.protect_last_admin() to public;
grant EXECUTE on function public.protect_last_admin() to service_role;
grant EXECUTE on function public.puede_anotar_ronda(uuid) to authenticated;
grant EXECUTE on function public.puede_anotar_ronda(uuid) to postgres;
grant EXECUTE on function public.puede_anotar_ronda(uuid) to service_role;
grant EXECUTE on function public.rate_limit_hit(text,integer,integer) to postgres;
grant EXECUTE on function public.rate_limit_hit(text,integer,integer) to service_role;
grant EXECUTE on function public.reclamar_equipo_de_ronda(text,uuid) to authenticated;
grant EXECUTE on function public.reclamar_equipo_de_ronda(text,uuid) to postgres;
grant EXECUTE on function public.reclamar_equipo_de_ronda(text,uuid) to service_role;
grant EXECUTE on function public.resolve_and_link_course(text,jsonb,real,text) to authenticated;
grant EXECUTE on function public.resolve_and_link_course(text,jsonb,real,text) to postgres;
grant EXECUTE on function public.resolve_and_link_course(text,jsonb,real,text) to service_role;
grant EXECUTE on function public.restamp_round_metrics_target(uuid,numeric) to postgres;
grant EXECUTE on function public.restamp_round_metrics_target(uuid,numeric) to service_role;
grant EXECUTE on function public.rls_write_policies_audit() to postgres;
grant EXECUTE on function public.rls_write_policies_audit() to service_role;
grant EXECUTE on function public.ronda_equipos_anotador_guard() to postgres;
grant EXECUTE on function public.ronda_equipos_anotador_nombre() to postgres;
grant EXECUTE on function public.ronda_equipos_scores_de_su_anotador() to postgres;
grant EXECUTE on function public.search_chunks_hybrid(public.vector,text,numeric,integer,text[],text) to postgres;
grant EXECUTE on function public.search_chunks_hybrid(public.vector,text,numeric,integer,text[],text) to service_role;
grant EXECUTE on function public.tarjeta_tiene_anotaciones(jsonb) to postgres;
grant EXECUTE on function public.tarjeta_tiene_anotaciones(jsonb) to service_role;
grant EXECUTE on function public.timba_registrar_secuencia(uuid,text,bigint,uuid) to postgres;
grant EXECUTE on function public.timba_registrar_secuencia(uuid,text,bigint,uuid) to service_role;
grant EXECUTE on function public.timba_ronda_para_escribir(text,uuid) to postgres;
grant EXECUTE on function public.timba_ronda_para_escribir(text,uuid) to service_role;
grant EXECUTE on function public.torneo_con_grupos_fijos(uuid) to authenticated;
grant EXECUTE on function public.torneo_con_grupos_fijos(uuid) to postgres;
grant EXECUTE on function public.torneo_con_grupos_fijos(uuid) to service_role;
grant EXECUTE on function public.touch_tournament_drafts_updated_at() to anon;
grant EXECUTE on function public.touch_tournament_drafts_updated_at() to authenticated;
grant EXECUTE on function public.touch_tournament_drafts_updated_at() to postgres;
grant EXECUTE on function public.touch_tournament_drafts_updated_at() to public;
grant EXECUTE on function public.touch_tournament_drafts_updated_at() to service_role;
grant EXECUTE on function public.tournament_drafts_asegurar_dueno_colaborador() to postgres;
grant EXECUTE on function public.tournament_drafts_asegurar_dueno_colaborador() to service_role;
grant EXECUTE on function public.unaccent_immutable(text) to anon;
grant EXECUTE on function public.unaccent_immutable(text) to authenticated;
grant EXECUTE on function public.unaccent_immutable(text) to postgres;
grant EXECUTE on function public.unaccent_immutable(text) to public;
grant EXECUTE on function public.unaccent_immutable(text) to service_role;
grant EXECUTE on function public.update_updated_at() to postgres;
grant EXECUTE on function public.update_updated_at() to service_role;
grant EXECUTE on function public.upsert_ronda_equipos_scores(uuid,text,jsonb,bigint,uuid) to authenticated;
grant EXECUTE on function public.upsert_ronda_equipos_scores(uuid,text,jsonb,bigint,uuid) to postgres;
grant EXECUTE on function public.upsert_ronda_equipos_scores(uuid,text,jsonb,bigint,uuid) to service_role;
grant EXECUTE on function public.upsert_ronda_libre_scores(uuid,text,jsonb,bigint,uuid) to anon;
grant EXECUTE on function public.upsert_ronda_libre_scores(uuid,text,jsonb,bigint,uuid) to authenticated;
grant EXECUTE on function public.upsert_ronda_libre_scores(uuid,text,jsonb,bigint,uuid) to postgres;
grant EXECUTE on function public.upsert_ronda_libre_scores(uuid,text,jsonb,bigint,uuid) to service_role;
grant EXECUTE on function public.usuario_es_admin() to anon;
grant EXECUTE on function public.usuario_es_admin() to authenticated;
grant EXECUTE on function public.usuario_es_admin() to postgres;
grant EXECUTE on function public.usuario_es_admin() to service_role;
grant EXECUTE on function public.usuario_puede_crear_timba() to anon;
grant EXECUTE on function public.usuario_puede_crear_timba() to authenticated;
grant EXECUTE on function public.usuario_puede_crear_timba() to postgres;
grant EXECUTE on function public.usuario_puede_crear_timba() to service_role;
grant EXECUTE on function public.validate_score_delta(jsonb) to anon;
grant EXECUTE on function public.validate_score_delta(jsonb) to authenticated;
grant EXECUTE on function public.validate_score_delta(jsonb) to postgres;
grant EXECUTE on function public.validate_score_delta(jsonb) to public;
grant EXECUTE on function public.validate_score_delta(jsonb) to service_role;
-- ===== 11. default ACL =====
alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated, service_role, postgres;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated, service_role, postgres;
alter default privileges for role postgres in schema public revoke all on functions from public, anon, authenticated, service_role, postgres;
alter default privileges for role postgres in schema public revoke all on types from public, anon, authenticated, service_role, postgres;
alter default privileges for role postgres in schema public grant SELECT, UPDATE, USAGE on sequences to postgres;
alter default privileges for role postgres in schema public grant SELECT, UPDATE, USAGE on sequences to service_role;
alter default privileges for role postgres in schema public grant EXECUTE on functions to postgres;
alter default privileges for role postgres in schema public grant EXECUTE on functions to service_role;
alter default privileges for role postgres in schema public grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on tables to postgres;
alter default privileges for role postgres in schema public grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on tables to service_role;
-- ===== 12. storage =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('inbox-photos', 'inbox-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'audio/ogg', 'audio/mpeg']::text[])
  on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('tournament-covers', 'tournament-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']::text[])
  on conflict (id) do update set name=excluded.name, public=excluded.public, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
-- ===== 13. esquema public =====
revoke all on schema public from public, anon, authenticated, service_role, postgres;
grant USAGE on schema public to anon;
grant USAGE on schema public to authenticated;
grant USAGE on schema public to postgres;
grant USAGE on schema public to public;
grant USAGE on schema public to service_role;
notify pgrst, 'reload schema';
