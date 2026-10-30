-- Carga de cancha: The Lakes Barceló Golf Course (Punta Cana, República Dominicana)
--
-- Primera cancha del catálogo en República Dominicana. 18 hoyos, par 72, 5 tees.
--
-- FUENTES
-- -------
--   · Par, ventaja (stroke index) y yardaje hoyo por hoyo: scorecard oficial,
--     verificado contra GolfPass (course 22131). Las 10 sumas parciales (5 tees
--     x ida/vuelta) cuadran exactas con los totales publicados.
--   · Course Rating y Slope por tee: Barceló (sitio oficial) y GolfPass, que
--     publican la MISMA tabla.
--
-- ⚠️ CORRECCIÓN DEL PAREO TEE↔RATING (dorado / azul)
-- --------------------------------------------------
-- Las dos fuentes publican la lista de ratings en un orden que NO corresponde
-- al orden de los tees: dejan dorado (6.200 yds) en CR 68.0 y azul (5.737 yds)
-- en CR 70.3. Eso es físicamente imposible — el Course Rating es el score
-- esperado de un scratch, así que un tee más largo no puede ratear más fácil.
--
-- Con el pareo publicado el gradiente queda en 111 yds/golpe entre negras y
-- dorado (el doble de lo normal) y después SUBE al acortarse. Con el pareo
-- corregido queda monótono y en el rango de manual (~220 yds/golpe):
--
--     negras 6655 → 72.1   ·  dorado 6200 → 70.3   (253 yds/golpe)
--     dorado 6200 → 70.3   ·  azul   5737 → 68.0   (201 yds/golpe)
--     azul   5737 → 68.0   ·  blanco 5381 → 66.0   (178 yds/golpe)
--     blanco 5381 → 66.0   ·  rojo   4769 → 63.0   (231 yds/golpe)
--
-- 18Birdies publica dorado 6.200 = 70.3/126, que coincide con la corrección.
-- Los slopes (135/126/119/115/107) ya venían monótonos y no se tocan.
--
-- ⚠️ TODOS LOS TEES VAN COMO 'M'
-- ------------------------------
-- El resort no publica rating de damas. El del rojo (63.0 para 4.769 yds) es un
-- rating de varones: el de damas para esa distancia estaría cerca de 68. Cargar
-- 63.0 como 'F' le daría a una jugadora un course handicap bajo en silencio, que
-- es justo lo que el motor existe para evitar. Queda como 'M' y documentado: una
-- jugadora cae al rojo de varones por nombre (`resolvePlayerTee`), igual que
-- hoy, y no a un número inventado.
--
-- SIN RATING DE 9 HOYOS PUBLICADO (la vuelta corta se juega igual)
-- ----------------------------------------------------------------
-- `front_*` / `back_*` quedan NULL porque el resort no los publica, y no se
-- inventan: una medición de 9 hoyos no se deduce de la de 18. Eso NO bloquea
-- jugar 9 acá. El motor resuelve la vuelta corta solo: `ratingsDe9DelTee` ve
-- que el rating es de 18 (70.3 / 2 = 35.15 contra par 36, dentro de la
-- tolerancia) y lo parte en dos, con slope9 ≈ slope18 — la aproximación que
-- WHS acepta. Las vueltas miden 3.332 y 3.323 yds, casi iguales, así que
-- partir por la mitad es fiel a esta cancha en particular.
-- Verificado en `src/__tests__/cancha-the-lakes-modalidades.test.ts`: los cinco
-- tees dan un course handicap de 9 calculado, ninguno cae al camino seguro.
--
-- NOTA sobre el yardaje del rojo: el hoyo por hoyo suma 4.769 y la tabla resumen
-- de GolfPass dice 4.688. Manda el hoyo por hoyo, que es el que cuadra consigo
-- mismo.
--
-- NOTA sobre dorado: `course_holes` sólo tiene columnas de yardaje para negras,
-- azul, blanco y rojo. El yardaje de dorado vive en `course_tees.yardaje_total`.
--
-- Idempotente: se puede correr dos veces sin duplicar nada.
-- Sin cambios de esquema, sin objetos nuevos → no hay GRANT que otorgar.

-- 1. La cancha.
--    `course_rating` / `slope_rating` a nivel de cancha son el ÚLTIMO eslabón
--    del fallback: lo que recibe un jugador cuyo nombre de tee no matchea
--    ninguna fila. Se usa azul (68.0/119), el tee medio de los cinco y el
--    estándar de varones del resort: deja ese fallback a menos de 2.3 golpes de
--    cualquier tee vecino, en vez de los 6 que daría blanco o los 4 que daría
--    negras.
INSERT INTO courses (
  nombre, ciudad, pais, par_total, tipo_recorrido,
  course_rating, slope_rating,
  activa, datos_verificados, si_verificado, fuente
)
SELECT
  'The Lakes Barceló Golf Course', 'Punta Cana', 'República Dominicana', 72, '18h',
  68.0, 119,
  true, true, true, 'manual'
WHERE NOT EXISTS (
  SELECT 1 FROM courses WHERE nombre_canonico = 'the lakes barceló golf course'
);

-- 2. Los 18 hoyos. `recorrido` NULL: es una cancha de 18 sin nueves con nombre
--    (misma convención que Sport Francés y el resto de las 18h simples).
INSERT INTO course_holes (
  course_id, numero, par, stroke_index,
  yardaje_negras, yardaje_azul, yardaje_blanco, yardaje_rojo,
  fuente_yardaje, yardaje_verificado_at
)
SELECT c.id, v.numero, v.par, v.si, v.negras, v.azul, v.blanco, v.rojo,
       'scorecard oficial + golfpass', DATE '2026-10-30'
FROM courses c,
(VALUES
  ( 1, 4, 17, 338, 310, 285, 250),
  ( 2, 3, 15, 182, 157, 144, 128),
  ( 3, 4,  1, 452, 402, 394, 364),
  ( 4, 5,  5, 535, 474, 447, 413),
  ( 5, 4, 13, 364, 336, 316, 296),
  ( 6, 5,  7, 504, 430, 419, 385),
  ( 7, 4,  3, 417, 370, 336, 312),
  ( 8, 4, 11, 380, 300, 294, 272),
  ( 9, 3,  9, 160, 140, 118, 100),
  (10, 4, 12, 410, 324, 308, 257),
  (11, 4, 18, 396, 352, 336, 296),
  (12, 3,  4, 151, 125, 104,  63),
  (13, 5, 16, 551, 513, 496, 434),
  (14, 3, 10, 176, 133, 118,  81),
  (15, 4,  8, 303, 230, 218, 191),
  (16, 5,  6, 519, 464, 435, 387),
  (17, 4,  2, 457, 400, 361, 312),
  (18, 4, 14, 360, 277, 252, 228)
) AS v(numero, par, si, negras, azul, blanco, rojo)
WHERE c.nombre_canonico = 'the lakes barceló golf course'
  AND NOT EXISTS (
    SELECT 1 FROM course_holes ch
    WHERE ch.course_id = c.id AND ch.numero = v.numero
  );

-- 3. Los 5 tees. Nombres en el vocabulario del catálogo ('negras', 'dorado',
--    'azul', 'blanco', 'rojo'): `resolvePlayerTee` matchea por nombre exacto en
--    minúsculas, así que un 'negro' o un 'dorada' acá no lo encontraría nadie.
INSERT INTO course_tees (
  course_id, nombre, genero, par_total, yardaje_total, rating, slope, fuente
)
SELECT c.id, v.nombre, 'M', 72, v.yardaje, v.rating, v.slope, 'barcelo + golfpass'
FROM courses c,
(VALUES
  ('negras', 6655, 72.1, 135),
  ('dorado', 6200, 70.3, 126),
  ('azul',   5737, 68.0, 119),
  ('blanco', 5381, 66.0, 115),
  ('rojo',   4769, 63.0, 107)
) AS v(nombre, yardaje, rating, slope)
WHERE c.nombre_canonico = 'the lakes barceló golf course'
ON CONFLICT (course_id, nombre) DO NOTHING;
