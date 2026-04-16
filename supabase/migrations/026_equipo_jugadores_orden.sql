-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN 026 — Orden de jugadores dentro de equipos
-- Crítico para Foursome: jugador A (orden=0) tira en impares,
--                        jugador B (orden=1) tira en pares
-- Ejecutar en: https://supabase.com/dashboard/project/hoswfwhvcgqlqdmzpnce/sql/new
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Agregar columna orden ───────────────────────────────────────────
ALTER TABLE ronda_equipo_jugadores ADD COLUMN IF NOT EXISTS orden INTEGER DEFAULT 0;

-- ─── 2. Backfill: asignar orden basado en id (para rows existentes) ────
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY equipo_id ORDER BY id) - 1 AS rn
  FROM ronda_equipo_jugadores
)
UPDATE ronda_equipo_jugadores SET orden = numbered.rn
FROM numbered WHERE ronda_equipo_jugadores.id = numbered.id;

-- ═══════════════════════════════════════════════════════════════════════════
-- FIN — Idempotente, cero impacto en datos existentes
-- ═══════════════════════════════════════════════════════════════════════════
