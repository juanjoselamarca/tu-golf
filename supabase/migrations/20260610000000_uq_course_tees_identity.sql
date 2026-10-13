-- ============================================================
-- Índice único de identidad de tee (dedup de canchas, spec §11 M3)
-- ============================================================
-- Blindaje de idempotencia para el dedup de canchas: garantiza que no puedan
-- coexistir dos tees con la misma identidad (cancha + color + género) en una
-- ficha. Sin esto, una corrección de tee que no matchee el nombre EXACTO del
-- manual insertaría un duplicado → el resolver ve dos ratings para el mismo
-- color/género → ambigüedad → null → índice roto.
--
-- Identidad = (course_id, lower(nombre), coalesce(genero,'')).
-- - lower(nombre): 'Azul' y 'azul' son el mismo tee.
-- - coalesce(genero,''): NULL no es distinguible para la unicidad (un tee sin
--   género no puede coexistir con otro del mismo color sin género).
--
-- Verificado vs prod 2026-06-10: 0 violaciones previas (470 tees).
-- Re-ejecutable: IF NOT EXISTS.

CREATE UNIQUE INDEX IF NOT EXISTS uq_course_tees_identity
  ON course_tees (course_id, lower(nombre), coalesce(genero, ''));
