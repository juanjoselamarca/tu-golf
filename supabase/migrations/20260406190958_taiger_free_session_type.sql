-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 016 — Agregar 'free' como session_type válido en taiger_sessions
-- Ejecutar en: https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- Reemplazar el CHECK constraint para incluir 'free'
ALTER TABLE taiger_sessions DROP CONSTRAINT IF EXISTS taiger_sessions_session_type_check;
ALTER TABLE taiger_sessions ADD CONSTRAINT taiger_sessions_session_type_check
  CHECK (session_type IN ('post_round', 'weekly_plan', 'pre_tournament', 'onboarding', 'free'));
