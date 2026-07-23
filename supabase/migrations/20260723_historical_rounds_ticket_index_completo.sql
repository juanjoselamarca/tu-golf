-- Fix C1 (code review Release 1): el índice único de tarjetas FedeGolf era
-- PARCIAL (WHERE fedegolf_ticket IS NOT NULL). supabase-js emite el upsert como
-- `ON CONFLICT (user_id, fedegolf_ticket)` SIN repetir el predicado, y Postgres
-- NO puede inferir un índice parcial sin su WHERE → falla 42P10 y el write-path
-- muere en silencio (lo traga el try/catch fail-soft). Gotcha ya documentado:
-- memoria `reference_partial_index_onconflict_42p10` (mismo bug que
-- uq_courses_fedegolf_natural en import-hardening).
--
-- Fix: índice único COMPLETO (sin WHERE) → inferible por el upsert. Los NULL son
-- distintos entre sí (NULLS DISTINCT por defecto) → las rondas no-FedeGolf
-- (fedegolf_ticket IS NULL) conviven sin chocar y las tarjetas quedan únicas por
-- (user_id, fedegolf_ticket).

DROP INDEX IF EXISTS ux_historical_rounds_user_ticket;

CREATE UNIQUE INDEX IF NOT EXISTS ux_historical_rounds_user_ticket
  ON historical_rounds (user_id, fedegolf_ticket);
