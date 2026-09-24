-- ============================================================
-- Golfers+ — Migración: round_watchers
-- Trackea qué usuarios siguen qué rondas para server push.
-- ============================================================

CREATE TABLE IF NOT EXISTS round_watchers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ronda_codigo TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, ronda_codigo)
);

-- RLS
ALTER TABLE round_watchers ENABLE ROW LEVEL SECURITY;

-- Usuarios autenticados manejan sus propios watchers
CREATE POLICY "watcher_select_own" ON round_watchers FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "watcher_insert_own" ON round_watchers FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "watcher_delete_own" ON round_watchers FOR DELETE USING (user_id = auth.uid());

-- Service role puede leer todos (para el endpoint de push)
-- No hace falta policy explícita — service role bypasses RLS.

-- Índices
CREATE INDEX IF NOT EXISTS idx_round_watchers_ronda ON round_watchers(ronda_codigo);
CREATE INDEX IF NOT EXISTS idx_round_watchers_user ON round_watchers(user_id);
