-- Rollback de 20261030120000_jugador_no_edita_su_fila_del_scorer.
-- Devuelve el hueco: el jugador vuelve a poder hacer PATCH de su fila de ronda_libre_jugadores (handicap, scores,
-- ronda_id). Usar solo si algo que no vimos dependía de la policy; avisar en el PR antes de correrlo.

CREATE POLICY "jugador_update_scores" ON public.ronda_libre_jugadores
  AS PERMISSIVE FOR UPDATE TO public
  USING (((user_id = auth.uid()) OR (EXISTS ( SELECT 1
     FROM public.rondas_libres r
    WHERE ((r.id = ronda_libre_jugadores.ronda_id) AND (r.creador_id = auth.uid()))))));

GRANT INSERT, UPDATE, DELETE ON public.rounds TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hole_scores TO authenticated;
