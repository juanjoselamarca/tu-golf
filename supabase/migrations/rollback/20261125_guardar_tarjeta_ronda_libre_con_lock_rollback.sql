-- Rollback de 20261125120000_guardar_tarjeta_ronda_libre_con_lock: borra guardar_tarjeta_ronda_libre.
-- Antes, revertir el código que la llama (guardarTarjeta en src/lib/data/ronda-libre-finalizar.ts) al INSERT directo
-- en historical_rounds: sin la función, ese guardado falla. Solo si la migración rompe algo.

DROP FUNCTION IF EXISTS public.guardar_tarjeta_ronda_libre(jsonb);
