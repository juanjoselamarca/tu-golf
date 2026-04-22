-- 028_es_demo_column.sql
-- Demo mode schema para #21 roadmap — reciclar componentes reales con data sembrada.
-- El guest navega las páginas REALES (/torneo, /ronda-libre, /ranking) pero con
-- records marcados es_demo=true. RLS bloquea escrituras sobre estos records
-- para que ningún guest pueda mutarlos accidentalmente (ni siquiera estando
-- autenticado si supiera el codigo/slug).
--
-- Safe re-run: todo IF NOT EXISTS / IF NOT EXISTS-equivalente.

-- ─── 1. Column es_demo en tablas con data pública navegable ─────────────────

ALTER TABLE rondas_libres
  ADD COLUMN IF NOT EXISTS es_demo BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS es_demo BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN rondas_libres.es_demo IS
  'Si true: ronda sembrada para /demo. Bloqueada a escritura por RLS. Auth guards en app ocultan botones destructivos.';
COMMENT ON COLUMN tournaments.es_demo IS
  'Si true: torneo sembrado para /demo. Mismas protecciones que rondas_libres.es_demo.';

-- ─── 2. Índices parciales para queries rápidas de demo ─────────────────────

CREATE INDEX IF NOT EXISTS idx_rondas_libres_es_demo
  ON rondas_libres(codigo) WHERE es_demo = true;

CREATE INDEX IF NOT EXISTS idx_tournaments_es_demo
  ON tournaments(slug) WHERE es_demo = true;

-- ─── 3. RLS: bloquear UPDATE/DELETE sobre records demo ─────────────────────
-- Idea: policy adicional que niega (USING false) escrituras cuando es_demo=true.
-- Combinado con las policies permisivas existentes, solo bloquea ese subset.

-- rondas_libres: si alguien intenta modificar una ronda con es_demo=true,
-- falla sin importar si está autenticado o es el creador.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rondas_libres'
      AND policyname = 'rondas_libres_demo_readonly_update'
  ) THEN
    CREATE POLICY rondas_libres_demo_readonly_update
      ON rondas_libres FOR UPDATE
      USING (es_demo = false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rondas_libres'
      AND policyname = 'rondas_libres_demo_readonly_delete'
  ) THEN
    CREATE POLICY rondas_libres_demo_readonly_delete
      ON rondas_libres FOR DELETE
      USING (es_demo = false);
  END IF;
END $$;

-- tournaments: misma protección.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournaments'
      AND policyname = 'tournaments_demo_readonly_update'
  ) THEN
    CREATE POLICY tournaments_demo_readonly_update
      ON tournaments FOR UPDATE
      USING (es_demo = false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tournaments'
      AND policyname = 'tournaments_demo_readonly_delete'
  ) THEN
    CREATE POLICY tournaments_demo_readonly_delete
      ON tournaments FOR DELETE
      USING (es_demo = false);
  END IF;
END $$;

-- ─── 4. Proteger ronda_libre_jugadores y hole_scores por extensión ─────────
-- Los jugadores/scores de una ronda/torneo demo también deben ser inmutables.
-- Usamos una función que chequea el es_demo del parent.

-- ronda_libre_jugadores: bloquear si su ronda es demo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ronda_libre_jugadores'
      AND policyname = 'rlj_demo_readonly_update'
  ) THEN
    CREATE POLICY rlj_demo_readonly_update
      ON ronda_libre_jugadores FOR UPDATE
      USING (
        NOT EXISTS (
          SELECT 1 FROM rondas_libres
          WHERE rondas_libres.id = ronda_libre_jugadores.ronda_id
            AND rondas_libres.es_demo = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ronda_libre_jugadores'
      AND policyname = 'rlj_demo_readonly_delete'
  ) THEN
    CREATE POLICY rlj_demo_readonly_delete
      ON ronda_libre_jugadores FOR DELETE
      USING (
        NOT EXISTS (
          SELECT 1 FROM rondas_libres
          WHERE rondas_libres.id = ronda_libre_jugadores.ronda_id
            AND rondas_libres.es_demo = true
        )
      );
  END IF;
END $$;
