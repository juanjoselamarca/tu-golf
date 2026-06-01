-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN — columna tournaments.team_config (JSONB)
--
-- Cierra el paso 3 del plan wizard-equipos-e2e (2026-05-24).
--
-- Contexto: el wizard "Organizar Torneo Equipos" persiste la configuración de
-- equipos en `tournament_drafts.config.team_config` (size, handicap_pct,
-- formation_mode, ...). Pero al publicar el draft → tournament, esa config se
-- PERDÍA: el insert de `tournaments` nunca la leía y no existía columna donde
-- materializarla. Resultado (P0 auditoría FTUE 22-may): el organizador llega a
-- /organizador/<slug>/jugadores sin forma de saber que el torneo es de equipos
-- ni con qué tamaño/formación, así que ve scoring individual.
--
-- Esta columna lleva la config del wizard al torneo. La página del organizador
-- la lee para renderizar la UI de asignación de equipos. Las membresías reales
-- (qué jugador en qué equipo) viven en tournament_team_members; esta columna es
-- sólo la CONFIG (cómo se arman los equipos), no los equipos materializados.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS. Cero impacto sobre torneos existentes
-- (quedan con team_config = NULL → la UI cae a un default por formato).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS team_config JSONB;

COMMENT ON COLUMN tournaments.team_config IS
  'Config de equipos heredada del wizard (tournament_drafts.config.team_config): '
  '{ size: 2|3|4, handicap_pct, formation_mode, ... }. NULL para torneos '
  'individuales o legacy. Las membresías reales viven en tournament_team_members.';
