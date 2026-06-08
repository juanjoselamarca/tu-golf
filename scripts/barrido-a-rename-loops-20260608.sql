-- ============================================================
-- Barrido A (corregido) — desambiguar canchas multi-loop con nombre genérico.
-- ============================================================
-- HALLAZGO: los "duplicados" que el spec quería deduplicar NO eran duplicados.
-- Son recorridos (loops) distintos de la misma cancha física, importados con un
-- nombre genérico sin sufijo de loop, así que colisionan en nombre_canonico:
--   Marbella (golfcourseapi):  Pacifico Sur / Andes Pro / Pacifico Norte
--   Rocas    (golfcourseapi):  Roja / Azul / Blanca
--   Brisas   (manual):         Norte / Este / Sur
-- El recorrido real está en course_holes.recorrido. Acá se agrega al nombre para
-- que cada loop sea una ficha distinguible (mejor agrupado en el coach) y deje de
-- colisionar. NO se colapsa nada, NO se re-puntan rondas, NO se toca ningún índice.
-- Reversible (backup: scripts/backups/barrido-a-rename-loops-20260608.json).
--
-- NO se crea el índice único anti-duplicados (nombre_canonico, genero, fuente):
-- bloquearía importaciones futuras de loops legítimos con nombre genérico. La
-- prevención real ya está cubierta por el índice natural FedeGolf + el matcher.
-- ============================================================

UPDATE courses SET nombre = nombre || ' - Pacifico Sur'   WHERE id='dd18b74f-5977-42b2-9cbc-abc2389ccab3' AND nombre NOT LIKE '% - %';
UPDATE courses SET nombre = nombre || ' - Andes Pro'      WHERE id='daa13f0b-e025-45b7-9307-4866ed721cb4' AND nombre NOT LIKE '% - %';
UPDATE courses SET nombre = nombre || ' - Pacifico Norte' WHERE id='b176f69f-b455-4307-b135-5762a4bc096d' AND nombre NOT LIKE '% - %';

UPDATE courses SET nombre = nombre || ' - Roja'   WHERE id='057136a1-175f-444d-a4e9-e2a7236769cc' AND nombre NOT LIKE '% - %';
UPDATE courses SET nombre = nombre || ' - Azul'   WHERE id='2ec2bffd-2cfb-4e6e-8f74-68b3b04512f1' AND nombre NOT LIKE '% - %';
UPDATE courses SET nombre = nombre || ' - Blanca' WHERE id='7b073e28-d30b-4cfc-afdc-0cd2df28660c' AND nombre NOT LIKE '% - %';

UPDATE courses SET nombre = nombre || ' - Norte' WHERE id='78c9b8d2-0608-46fa-8085-c7a652601ce8' AND nombre NOT LIKE '% - %';
UPDATE courses SET nombre = nombre || ' - Este'  WHERE id='e20b950c-3f75-405e-99b1-8898f85b93af' AND nombre NOT LIKE '% - %';
UPDATE courses SET nombre = nombre || ' - Sur'   WHERE id='7bb13daa-0877-4c05-bc93-8caf6500faaf' AND nombre NOT LIKE '% - %';
