-- ============================================================
-- RLS FIXES — Ejecutar en Supabase Dashboard > SQL Editor
-- Fecha: 24 Mar 2026
-- ============================================================

-- FIX 1: ronda_libre_jugadores — solo el creador de la ronda
-- o el propio jugador pueden editar scores
-- ANTES: cualquier usuario autenticado podia editar si user_id=null
-- ============================================================
DROP POLICY IF EXISTS "jugador_update_scores" ON ronda_libre_jugadores;
CREATE POLICY "jugador_update_scores" ON ronda_libre_jugadores
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM rondas_libres r
      WHERE r.id = ronda_id AND r.creador_id = auth.uid()
    )
  );

-- FIX 2: hole_scores — no se pueden editar scores si la ronda
-- del torneo ya esta cerrada/oficial
-- ANTES: solo chequeaba hole_score.status, no round.status
-- ============================================================
DROP POLICY IF EXISTS "Jugador edita sus scores no cerrados" ON hole_scores;
CREATE POLICY "Jugador edita sus scores no cerrados" ON hole_scores
  FOR UPDATE USING (
    status NOT IN ('confirmed', 'corrected')
    AND EXISTS (
      SELECT 1 FROM rounds r
      JOIN players p ON p.id = r.player_id
      WHERE r.id = round_id
        AND p.user_id = auth.uid()
        AND r.status NOT IN ('closed', 'official')
    )
  );

-- FIX 3: players — solo el propio jugador o el organizador
-- del torneo pueden actualizar datos del jugador
-- ANTES: no habia policy de UPDATE (default DENY, pero no explicito)
-- ============================================================
DROP POLICY IF EXISTS "Organizador actualiza jugadores" ON players;
CREATE POLICY "Organizador actualiza jugadores" ON players
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id AND t.organizer_id = auth.uid()
    )
  );

-- BONUS: Crear funcion exec_sql para que el admin pueda
-- ejecutar queries desde el SQL Console del admin panel
-- ============================================================
CREATE OR REPLACE FUNCTION exec_sql(sql text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE result json;
BEGIN
  EXECUTE 'SELECT json_agg(row_to_json(t)) FROM (' || sql || ') t' INTO result;
  RETURN COALESCE(result, '[]'::json);
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('error', SQLERRM);
END;
$$;
