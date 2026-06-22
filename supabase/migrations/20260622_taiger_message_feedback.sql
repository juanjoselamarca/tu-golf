-- 👍/👎 por mensaje del coach tAIger+ (PR2 del rediseño del chat, enmienda E2).
--
-- POR QUÉ UNA TABLA NUEVA y no reusar taiger_feedback / taiger_sessions.rating:
-- esos tienen CHECK (rating 1..5) NOT NULL y unicidad POR SESIÓN (un rating por
-- sesión, consumido por los dashboards de learning). Mapear pulgares a 5/1
-- rompería esa semántica. El voto por-mensaje es otra cosa: -1/+1 por cada
-- respuesta del coach dentro de una sesión. Las estrellas se retiran de la UI
-- pero la columna/tabla histórica queda intacta.
--
-- POR QUÉ message_key (hash del contenido) y NO el índice del mensaje:
-- el array messages que se persiste NO es el mismo que el del cliente en vivo —
-- el backend hace slice(-20) y descarta el saludo proactivo (opener) con un
-- shift() de los mensajes que no arrancan en 'user' (chat/route.ts:71-78). Así
-- que la POSICIÓN del mensaje del coach cambia entre la vista en vivo y la
-- recarga, pero su CONTENIDO se persiste verbatim (chat-engine.ts:365-367). El
-- hash del contenido es la identidad estable: el voto reaparece en el mensaje
-- correcto tras recargar, inmune al reslicing del backend.
--
-- Idempotente. La tabla es nueva en este PR (sin data productiva), así que se
-- recrea para garantizar el shape final con message_key.

DROP TABLE IF EXISTS taiger_message_feedback;

CREATE TABLE taiger_message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES taiger_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Hash estable del contenido del mensaje del coach (lo calcula el cliente).
  -- Opaco para el server; identidad del mensaje resistente al reslicing.
  message_key TEXT NOT NULL CHECK (char_length(message_key) BETWEEN 1 AND 64),
  -- -1 = no me sirvió, +1 = me sirvió. Sin fila = sin voto (toggle = DELETE).
  vote SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un voto por (sesión, mensaje). La sesión es de un solo dueño, así que esto es
-- efectivamente un voto por usuario por mensaje. Constraint COMPLETA (no parcial)
-- → upsert con onConflict funciona sin 42P10.
ALTER TABLE taiger_message_feedback ADD CONSTRAINT uq_taiger_message_feedback_session_msg
  UNIQUE (session_id, message_key);

CREATE INDEX idx_taiger_message_feedback_session
  ON taiger_message_feedback (session_id);

CREATE INDEX idx_taiger_message_feedback_user
  ON taiger_message_feedback (user_id);

ALTER TABLE taiger_message_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own message feedback"
  ON taiger_message_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own message feedback"
  ON taiger_message_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own message feedback"
  ON taiger_message_feedback FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own message feedback"
  ON taiger_message_feedback FOR DELETE
  USING (auth.uid() = user_id);
