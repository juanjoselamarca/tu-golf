-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 021: Schema para integración FedeGolf
-- Fecha: 2026-04-09
-- Descripción: Agrega columnas de vinculación con FedeGolf a courses y
--              course_tees, crea tablas indice_historial y
--              fedegolf_credentials para sincronización de índices.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Columnas FedeGolf en courses
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE courses
  ADD COLUMN IF NOT EXISTS fedegolf_club_id INTEGER,
  ADD COLUMN IF NOT EXISTS fedegolf_cancha_id INTEGER,
  ADD COLUMN IF NOT EXISTS fedegolf_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_courses_fedegolf_club_id
  ON courses (fedegolf_club_id)
  WHERE fedegolf_club_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Columna fuente en course_tees
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE course_tees
  ADD COLUMN IF NOT EXISTS fuente TEXT DEFAULT 'manual';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Tabla indice_historial
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS indice_historial (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  indice DECIMAL(4,1) NOT NULL,
  fecha TIMESTAMPTZ NOT NULL DEFAULT now(),
  fuente TEXT NOT NULL DEFAULT 'manual'
    CHECK (fuente IN ('manual', 'fedegolf_sync', 'import')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, fecha, fuente)
);

CREATE INDEX IF NOT EXISTS idx_indice_historial_user_fecha
  ON indice_historial (user_id, fecha DESC);

-- RLS para indice_historial
ALTER TABLE indice_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios leen su propio historial de índice"
  ON indice_historial FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role inserta historial de índice"
  ON indice_historial FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR current_setting('role') = 'service_role'
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Tabla fedegolf_credentials
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fedegolf_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  rut_encrypted TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  ultimo_sync TIMESTAMPTZ,
  ultimo_indice DECIMAL(4,1),
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS para fedegolf_credentials
ALTER TABLE fedegolf_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios leen sus propias credenciales FedeGolf"
  ON fedegolf_credentials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuarios insertan sus propias credenciales FedeGolf"
  ON fedegolf_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios actualizan sus propias credenciales FedeGolf"
  ON fedegolf_credentials FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuarios eliminan sus propias credenciales FedeGolf"
  ON fedegolf_credentials FOR DELETE
  USING (auth.uid() = user_id);
