-- 20260616_cerebro_v3_ola1b_handicap_dist_year_notnull.sql
-- Fix de code-review (I1): la clave única de capa B incluye `year`, que era
-- nullable. Un NULL en columna de ON CONFLICT reproduce el bug 42P10
-- (reference_partial_index_onconflict_42p10): en Postgres los NULL son distintos
-- entre sí, así que un re-ingest con year NULL NO matchearía la fila existente y
-- DUPLICARÍA en vez de actualizar — rompiendo la idempotencia que el ingestor
-- promete. Espejo de lo ya hecho con gender/age_bucket (NOT NULL DEFAULT).
-- Idempotente: SET NOT NULL solo procede si no hay NULLs (los normalizamos antes).

UPDATE external_priors_handicap_dist SET year = 0 WHERE year IS NULL;
ALTER TABLE external_priors_handicap_dist ALTER COLUMN year SET DEFAULT 0;
ALTER TABLE external_priors_handicap_dist ALTER COLUMN year SET NOT NULL;
