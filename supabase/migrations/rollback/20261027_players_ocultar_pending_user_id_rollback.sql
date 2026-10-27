-- ROLLBACK de 20261027220000_players_ocultar_pending_user_id.sql: devuelve el estado previo medido en prod el
-- 27-oct-2026 — anon con las 12 columnas de 20261027120000 (pending_user_id incluida) y authenticated con el
-- SELECT de tabla del baseline.
--
-- Vive en rollback/ para que el CLI de Supabase NUNCA lo tome como migración.
REVOKE SELECT ON public.players FROM anon;
GRANT SELECT (id, tournament_id, user_id, category_id, handicap_at_registration, status, created_at, status_reason,
              pending_user_id, player_name, tee_id, genero)
  ON public.players TO anon;

GRANT SELECT ON public.players TO authenticated;
