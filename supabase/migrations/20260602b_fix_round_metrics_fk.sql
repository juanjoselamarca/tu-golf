-- 20260602b_fix_round_metrics_fk.sql
-- FIX: round_metrics.round_id referenciaba `rounds` (rondas de TORNEO, 67 filas)
-- pero las métricas relativas se computan sobre `historical_rounds` (el historial
-- con scores/par/diferencial, 414 filas). La FK original habría hecho fallar todo
-- INSERT. La tabla está vacía → el cambio es seguro y aditivo.
ALTER TABLE round_metrics DROP CONSTRAINT IF EXISTS round_metrics_round_id_fkey;
ALTER TABLE round_metrics
  ADD CONSTRAINT round_metrics_round_id_fkey
  FOREIGN KEY (round_id) REFERENCES historical_rounds(id) ON DELETE CASCADE;
