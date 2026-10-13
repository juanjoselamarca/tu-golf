-- 018: Fix RLS policy en ronda_libre_jugadores
-- Problema: La policy anterior permitía que CUALQUIER usuario autenticado
-- actualizara scores de jugadores con user_id IS NULL (invitados).
-- Fix: Solo el propio jugador O el creador de la ronda pueden actualizar scores.

DROP POLICY IF EXISTS "jugador_update_scores" ON ronda_libre_jugadores;

CREATE POLICY "jugador_update_scores" ON ronda_libre_jugadores
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM rondas_libres r
      WHERE r.id = ronda_id AND r.creador_id = auth.uid()
    )
  );
