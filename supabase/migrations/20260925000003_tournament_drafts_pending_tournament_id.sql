-- ============================================================
-- Golfers+ — Migración: tournament_drafts.pending_tournament_id
-- (re-review Opus del PR #421, CR-1)
--
-- La publicación idempotente de un draft anota el id que va a tener el
-- torneo ANTES de insertarlo, para que un reintento pueda encontrarlo. Se
-- escribía en `tournament_id`, que tiene FK a tournaments(id) no diferible
-- → 23503 en el lock → el wizard no podía crear NINGÚN torneo.
--
-- Decisión: columna propia SIN FK para el lock. La alternativa (RPC
-- transaccional lock + inserts + cierre) obligaba a portar a plpgsql los 4
-- mapeos wizard→tabla que ya viven testeados en TS (tournaments, categories,
-- prizes, tournament_rounds): una segunda fuente del mismo contrato. Con la
-- columna, la orquestación sigue en un solo lugar (`publishDraft.ts`) y la
-- compensación ya existente cubre los fallos parciales.
--
-- `tournament_id` (con FK) se escribe SOLO al pasar a 'created'.
-- ============================================================
ALTER TABLE public.tournament_drafts ADD COLUMN IF NOT EXISTS pending_tournament_id UUID;

COMMENT ON COLUMN public.tournament_drafts.pending_tournament_id IS
  'Id reservado para el torneo mientras el draft está en creating (sin FK: el torneo todavía no existe). Un reintento lo usa para encontrar/cerrar el torneo en vez de duplicarlo. Se limpia al pasar a created o al volver a draft.';
