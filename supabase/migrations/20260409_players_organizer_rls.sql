-- Organizers need to inscribe/update/remove players in their tournaments.
-- The existing INSERT policy only allowed auth.uid() = user_id (self-enrollment).

CREATE POLICY "Organizador inscribe jugador"
  ON players FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id
        AND t.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizador actualiza jugador"
  ON players FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id
        AND t.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Organizador elimina jugador"
  ON players FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM tournaments t
      WHERE t.id = tournament_id
        AND t.organizer_id = auth.uid()
    )
  );
