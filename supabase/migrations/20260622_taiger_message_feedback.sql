-- 👍/👎 por mensaje del coach tAIger+ (PR2 del rediseño del chat, enmienda E2).
--
-- POR QUÉ UNA TABLA NUEVA y no reusar taiger_feedback / taiger_sessions.rating:
-- esos tienen CHECK (rating 1..5) NOT NULL y unicidad POR SESIÓN (un rating por
-- sesión, consumido por los dashboards de learning). Mapear pulgares a 5/1
-- rompería esa semántica. El voto por-mensaje es otra cosa: -1/+1 por cada
-- respuesta del coach dentro de una sesión. Las estrellas se retiran de la UI
-- pero la columna/tabla histórica queda intacta.
--
-- Idempotente (CREATE ... IF NOT EXISTS + DO blocks para policies).

CREATE TABLE IF NOT EXISTS taiger_message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES taiger_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Índice (posición) del mensaje del assistant dentro del array messages de la
  -- sesión. El chat es append-only, así que la posición es estable.
  message_index INTEGER NOT NULL CHECK (message_index >= 0),
  -- -1 = no me sirvió, +1 = me sirvió. Sin fila = sin voto (toggle = DELETE).
  vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un voto por (sesión, mensaje). La sesión es de un solo dueño, así que esto es
-- efectivamente un voto por usuario por mensaje. Constraint COMPLETA (no parcial)
-- → upsert con onConflict funciona sin 42P10.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_taiger_message_feedback_session_msg'
  ) THEN
    ALTER TABLE taiger_message_feedback ADD CONSTRAINT uq_taiger_message_feedback_session_msg
      UNIQUE (session_id, message_index);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_taiger_message_feedback_session
  ON taiger_message_feedback (session_id);

CREATE INDEX IF NOT EXISTS idx_taiger_message_feedback_user
  ON taiger_message_feedback (user_id);

ALTER TABLE taiger_message_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'taiger_message_feedback' AND policyname = 'Users can read own message feedback'
  ) THEN
    CREATE POLICY "Users can read own message feedback"
      ON taiger_message_feedback FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'taiger_message_feedback' AND policyname = 'Users can insert own message feedback'
  ) THEN
    CREATE POLICY "Users can insert own message feedback"
      ON taiger_message_feedback FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'taiger_message_feedback' AND policyname = 'Users can update own message feedback'
  ) THEN
    CREATE POLICY "Users can update own message feedback"
      ON taiger_message_feedback FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'taiger_message_feedback' AND policyname = 'Users can delete own message feedback'
  ) THEN
    CREATE POLICY "Users can delete own message feedback"
      ON taiger_message_feedback FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
