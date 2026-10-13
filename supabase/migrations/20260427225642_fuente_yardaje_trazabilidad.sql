-- ═══════════════════════════════════════════════════════════════════════════
-- Migración 025 — Trazabilidad de yardajes por hoyo
-- ═══════════════════════════════════════════════════════════════════════════
-- Contexto: el campo courses.fuente operaba a nivel cancha. Pero los yardajes
-- pueden venir de fuente distinta (scorecard del club, GolfPass, Hole19, etc.)
-- que el rating/slope de la cancha. Necesitamos trazabilidad por hoyo + tee.
--
-- Adicional: yardaje_verificado_at habilita el patrón "no mostrar si no está
-- verificado contra fuente primaria" sin tocar los datos.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE course_holes
  ADD COLUMN IF NOT EXISTS fuente_yardaje TEXT,
  ADD COLUMN IF NOT EXISTS yardaje_verificado_at DATE;

COMMENT ON COLUMN course_holes.fuente_yardaje IS
  'Procedencia del yardaje. Valores válidos: club_web | scorecard_pdf | golfpass | hole19 | golfcourseapi | manual | pendiente_auditoria. NULL si el hoyo no tiene yardaje cargado.';

COMMENT ON COLUMN course_holes.yardaje_verificado_at IS
  'Fecha de auditoría contra fuente primaria (web oficial del club o scorecard PDF). NULL = no verificado, no exponer en UI.';

-- ── Etiquetar las 60 filas existentes con su procedencia conocida ────────
-- Las Brisas de Santo Domingo: vienen de migración 019 (fuente: GolfPass + Hole19)
UPDATE course_holes h
SET fuente_yardaje = 'golfpass_hole19_2026q1'
FROM courses c
WHERE h.course_id = c.id
  AND c.nombre ILIKE '%Brisas De Santo Domingo%'
  AND (h.yardaje_blanco IS NOT NULL OR h.yardaje_azul IS NOT NULL OR h.yardaje_rojo IS NOT NULL OR h.yardaje_campeonato IS NOT NULL)
  AND h.fuente_yardaje IS NULL;

-- Resto de canchas con yardajes (Los Leones, La Dehesa, Marbella, Cachagua,
-- Bahía Coique, Hacienda Chicureo, Polo, Rinconada): procedencia no documentada,
-- marcar como pendiente de auditoría hasta verificar contra fuente primaria.
UPDATE course_holes h
SET fuente_yardaje = 'pendiente_auditoria'
FROM courses c
WHERE h.course_id = c.id
  AND c.fuente = 'fedegolf'
  AND (h.yardaje_blanco IS NOT NULL OR h.yardaje_azul IS NOT NULL OR h.yardaje_rojo IS NOT NULL OR h.yardaje_campeonato IS NOT NULL)
  AND h.fuente_yardaje IS NULL;

-- ── Reporte ─────────────────────────────────────────────────────────────
SELECT
  fuente_yardaje,
  COUNT(*) AS hoyos,
  COUNT(DISTINCT course_id) AS canchas
FROM course_holes
WHERE fuente_yardaje IS NOT NULL
GROUP BY fuente_yardaje
ORDER BY hoyos DESC;
