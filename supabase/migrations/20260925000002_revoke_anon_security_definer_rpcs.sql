-- 20260925c — Cierra RPCs SECURITY DEFINER ejecutables sin sesión.
--
-- Supabase otorga EXECUTE explícito a anon/authenticated en funciones nuevas;
-- `REVOKE ... FROM public` no los quita. Auditoría del 25-sep-2026 (review de
-- #421) encontró que con la anon key se podía:
--   - enroll_player: inscribir a cualquier usuario (p_user_id ajeno) en cualquier
--     torneo, con el handicap/género que quisiera, saltándose el gate de status.
--   - cleanup_old_e2e_runs: borrar corridas E2E.
--   - resolve_and_link_course: crear canchas user_added y poblar course_holes.
-- La app llama enroll_player y cleanup_old_e2e_runs solo con service role
-- (enrollPlayer.ts, api/admin/e2e/cleanup). resolve_and_link_course la usa la
-- importación de rondas con sesión → se mantiene para authenticated.
-- Aplicado en prod el 25-sep-2026 antes de este archivo (hueco activo).

REVOKE EXECUTE ON FUNCTION public.enroll_player(uuid, text, uuid, text, numeric, uuid, text) FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.enroll_player(uuid, text, uuid, text, numeric, uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cleanup_old_e2e_runs() FROM anon, authenticated, public;
GRANT  EXECUTE ON FUNCTION public.cleanup_old_e2e_runs() TO service_role;

REVOKE EXECUTE ON FUNCTION public.resolve_and_link_course(text, jsonb, real, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.resolve_and_link_course(text, jsonb, real, text) TO authenticated, service_role;
