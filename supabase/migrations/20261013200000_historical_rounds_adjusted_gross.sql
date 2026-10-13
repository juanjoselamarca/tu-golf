-- ============================================================================
-- historical_rounds.adjusted_gross — Adjusted Gross Score (WHS 2024, Regla 3.1)
-- ============================================================================
-- Issue #545. El diferencial de cada tarjeta sale del gross AJUSTADO (cada hoyo
-- topado en doble bogey neto con el course handicap, o par + 5 sin índice), no del
-- bruto. `total_gross` sigue siendo el bruto (lo que se muestra); `adjusted_gross`
-- es el número con el que se calculó `diferencial`. El detalle (course handicap,
-- índice, fuente del SI, hoyos topados) va en `metadata.ajuste_whs`.
--
-- NULL = tarjeta sin ajuste calculado (legacy, bola compartida, FedeGolf: su
-- diferencial es el oficial). Ningún lector depende de la columna todavía; el RPC
-- `calcular_indice_golfers` sigue promediando `diferencial` y no se toca.
--
-- historical_rounds no tiene GRANT por columna (sólo RLS por fila), así que la
-- columna nueva queda legible para el dueño sin GRANT adicional.
--
-- Rollback: supabase/migrations/rollback/20261013_historical_rounds_adjusted_gross_rollback.sql

ALTER TABLE public.historical_rounds
  ADD COLUMN IF NOT EXISTS adjusted_gross integer;

COMMENT ON COLUMN public.historical_rounds.adjusted_gross IS
  'Adjusted Gross Score WHS 2024 Regla 3.1 (doble bogey neto / par+5 sin índice). El diferencial sale de este valor; total_gross es el bruto. NULL = sin ajuste (legacy, bola compartida, FedeGolf). Detalle en metadata.ajuste_whs. Issue #545.';
