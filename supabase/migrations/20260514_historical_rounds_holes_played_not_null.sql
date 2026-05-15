-- 20260514_historical_rounds_holes_played_not_null.sql
--
-- Backfill de holes_played en historical_rounds + constraint NOT NULL.
--
-- Diagnóstico (2026-05-14):
--   - 260 filas con holes_played NULL, TODAS import_source = 'manual' de marzo 2026
--     (seed/bulk antiguo que nunca seteaba la columna).
--   - Distribución de shape de scores en esas 260:
--       210 → object con 18 keys                → 18 holes
--        33 → array length 18                    → 18 holes
--         6 → array length 9                     → 9 holes (verificado: 6 rondas)
--         1 → array length 17 (DNF último hoyo)  → 18 holes
--        10 → array length 0 (vacío, total_gross OK) → 18 holes (default histórico)
--   - 0 nulls con metadata, par_per_hole, garmin_scorecard_id útil.
--
-- Heurística aplicada:
--   array length = 9                  → 9
--   array length ∈ [10..18]           → 18
--   object (object keys)              → 18 (todos los del seed tienen 18 keys)
--   array length = 0 / fallback       → 18 (default histórico, 97% de la masa)
--
-- Code paths que insertan en historical_rounds — verificados en este mismo PR
-- para que TODOS seteen holes_played (sin esto el NOT NULL rompe prod):
--   - src/app/perfil/historial/page.tsx (entrada manual) ✓ fixed
--   - src/app/api/game/actions.ts (finalización torneo) ✓ fixed
--   - src/app/ronda-libre/[codigo]/score/page.tsx        ✓ ya seteaba
--   - src/app/ronda-libre/[codigo]/score-grupo/page.tsx  ✓ ya seteaba
--   - src/app/api/import/confirm/route.ts                ✓ ya seteaba
--   - src/scripts/seed-demo-data.ts                      ✓ fixed
--   - src/scripts/seed-demo-profile.ts                   ✓ fixed
--   - src/scripts/simulate-user-journey.ts               ✓ fixed
--
-- NO se agrega DEFAULT 18 a la columna a propósito: queremos que el código
-- siempre setee holes_played explícito. Si en el futuro alguien agrega un
-- INSERT que lo omita, el constraint NOT NULL hará fallar ruidosamente en
-- lugar de quedarse con 18 silencioso.

BEGIN;

UPDATE historical_rounds
SET holes_played = CASE
  WHEN jsonb_typeof(scores) = 'array' AND jsonb_array_length(scores) = 9
    THEN 9
  ELSE 18
END
WHERE holes_played IS NULL;

-- Sanity check inline: si quedara algún NULL después del UPDATE, abortamos.
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT count(*) INTO remaining FROM historical_rounds WHERE holes_played IS NULL;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'Aborto: aún quedan % filas con holes_played NULL', remaining;
  END IF;
END $$;

ALTER TABLE historical_rounds
  ALTER COLUMN holes_played SET NOT NULL;

COMMIT;
