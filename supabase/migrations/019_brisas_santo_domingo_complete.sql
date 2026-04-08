-- 019: Completar datos de Las Brisas de Santo Domingo (27 hoyos)
-- Fuentes: GolfPass (hoyos Norte/Sur), Hole19 (hoyos Este), FGCh (CR/Slope)

-- 1. Actualizar parent a tipo correcto
UPDATE courses
SET tipo_recorrido = '27h', datos_verificados = true
WHERE nombre = 'Club de Golf Brisas de Santo Domingo'
  AND parent_id IS NULL;

-- 2. Eliminar hoyos parciales del parent (están incompletos y erróneos)
DELETE FROM course_holes
WHERE course_id = (
  SELECT id FROM courses
  WHERE nombre = 'Club de Golf Brisas de Santo Domingo' AND parent_id IS NULL
);

-- 3. Crear children courses (uno por recorrido de 9 hoyos)
INSERT INTO courses (nombre, par_total, course_rating, slope_rating, tipo_recorrido, parent_id, loop_nombre, datos_verificados, activa)
SELECT
  'Club de Golf Brisas de Santo Domingo',
  36,
  36,    -- placeholder, CR real está en tees
  120,   -- placeholder
  '9h',
  parent.id,
  loop.nombre,
  true,
  true
FROM
  courses parent,
  (VALUES ('Norte'), ('Sur'), ('Este')) AS loop(nombre)
WHERE parent.nombre = 'Club de Golf Brisas de Santo Domingo'
  AND parent.parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM courses c2
    WHERE c2.parent_id = parent.id AND c2.loop_nombre = loop.nombre
  );

-- 4. Insertar hoyos Norte (9 hoyos — fuente: GolfPass)
INSERT INTO course_holes (course_id, numero, par, stroke_index, recorrido, yardaje_campeonato, yardaje_azul, yardaje_blanco, yardaje_rojo)
SELECT child.id, v.numero, v.par, v.si, 'Norte', v.negro, v.azul, v.blanco, v.rojo
FROM courses child,
(VALUES
  (1, 4, 15, 316, 297, 284, 251),
  (2, 4, 13, 377, 347, 328, 290),
  (3, 4,  3, 436, 394, 380, 339),
  (4, 3, 11, 206, 182, 174, 147),
  (5, 5,  9, 564, 530, 517, 426),
  (6, 4,  1, 429, 384, 364, 310),
  (7, 3, 17, 164, 139, 129, 112),
  (8, 5,  7, 534, 510, 495, 463),
  (9, 4,  5, 424, 398, 377, 328)
) AS v(numero, par, si, negro, azul, blanco, rojo)
WHERE child.loop_nombre = 'Norte'
  AND child.parent_id = (
    SELECT id FROM courses WHERE nombre = 'Club de Golf Brisas de Santo Domingo' AND parent_id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM course_holes ch WHERE ch.course_id = child.id AND ch.numero = v.numero
  );

-- 5. Insertar hoyos Sur (9 hoyos — fuente: GolfPass)
INSERT INTO course_holes (course_id, numero, par, stroke_index, recorrido, yardaje_campeonato, yardaje_azul, yardaje_blanco, yardaje_rojo)
SELECT child.id, v.numero, v.par, v.si, 'Sur', v.negro, v.azul, v.blanco, v.rojo
FROM courses child,
(VALUES
  (1, 4, 15, 385, 351, 335, 268),
  (2, 4,  1, 440, 417, 387, 372),
  (3, 4,  5, 397, 378, 355, 317),
  (4, 3, 11, 205, 186, 176, 158),
  (5, 5,  9, 499, 468, 445, 409),
  (6, 4, 13, 378, 349, 321, 275),
  (7, 3, 17, 123,  95,  95,  94),
  (8, 5,  3, 611, 576, 550, 523),
  (9, 4,  7, 414, 394, 370, 317)
) AS v(numero, par, si, negro, azul, blanco, rojo)
WHERE child.loop_nombre = 'Sur'
  AND child.parent_id = (
    SELECT id FROM courses WHERE nombre = 'Club de Golf Brisas de Santo Domingo' AND parent_id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM course_holes ch WHERE ch.course_id = child.id AND ch.numero = v.numero
  );

-- 6. Insertar hoyos Este (9 hoyos — fuente: Hole19, tee blanco)
INSERT INTO course_holes (course_id, numero, par, stroke_index, recorrido, yardaje_blanco)
SELECT child.id, v.numero, v.par, v.si, 'Este', v.blanco
FROM courses child,
(VALUES
  (1, 5, 15, 461),
  (2, 3,  9, 174),
  (3, 4, 13, 330),
  (4, 4,  1, 388),
  (5, 5,  3, 513),
  (6, 4,  7, 353),
  (7, 3, 17, 139),
  (8, 4, 11, 344),
  (9, 4,  5, 353)
) AS v(numero, par, si, blanco)
WHERE child.loop_nombre = 'Este'
  AND child.parent_id = (
    SELECT id FROM courses WHERE nombre = 'Club de Golf Brisas de Santo Domingo' AND parent_id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM course_holes ch WHERE ch.course_id = child.id AND ch.numero = v.numero
  );

-- 7. Insertar tees por combinación (fuente: FGCh — datos oficiales)
INSERT INTO course_tees (course_id, nombre, rating, slope, yardaje_total, genero)
SELECT parent.id, v.nombre, v.rating, v.slope, v.yardaje, v.genero
FROM courses parent,
(VALUES
  -- Norte + Sur
  ('negro_norte_sur',   74.0, 136, 6902, 'M'),
  ('azul_norte_sur',    71.9, 132, 6395, 'M'),
  ('blanco_norte_sur',  70.5, 130, 6082, 'M'),
  ('dorado_norte_sur',  67.3, 118, 5575, 'M'),
  ('rojo_norte_sur',    72.7, 130, 5399, 'F'),
  -- Norte + Este
  ('negro_norte_este',  74.7, 138, 7079, 'M'),
  ('azul_norte_este',   72.0, 128, 6526, 'M'),
  ('blanco_norte_este', 70.4, 127, 6183, 'M'),
  ('dorado_norte_este', 68.2, 119, 5815, 'M'),
  ('rojo_norte_este',   72.3, 124, 5464, 'F'),
  -- Sur + Este
  ('negro_sur_este',    74.7, 132, 7081, 'M'),
  ('azul_sur_este',     72.3, 128, 6559, 'M'),
  ('blanco_sur_este',   70.2, 126, 6169, 'M'),
  ('dorado_sur_este',   67.8, 116, 5708, 'M'),
  ('rojo_sur_este',     73.0, 127, 5531, 'F')
) AS v(nombre, rating, slope, yardaje, genero)
WHERE parent.nombre = 'Club de Golf Brisas de Santo Domingo'
  AND parent.parent_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM course_tees ct WHERE ct.course_id = parent.id AND ct.nombre = v.nombre
  );

-- 8. Limpiar hoyos parciales del parent de Rocas de Santo Domingo
DELETE FROM course_holes
WHERE course_id = (
  SELECT id FROM courses
  WHERE nombre = 'Club de Golf Rocas de Santo Domingo' AND parent_id IS NULL
)
AND recorrido IS NOT NULL
AND recorrido != 'default';
