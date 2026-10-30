-- Carga de cancha: The Lakes Barceló Golf Course (Punta Cana, República Dominicana)
--
-- Primera cancha del catálogo en República Dominicana. 18 hoyos, par 72, 5 tees.
--
-- FUENTES
-- -------
--   · Par, ventaja (stroke index) y yardaje hoyo por hoyo: scorecard oficial,
--     verificado contra GolfPass (course 22131). Las 10 sumas parciales (5 tees
--     x ida/vuelta) cuadran exactas con los totales publicados.
--   · Course Rating y Slope por tee: Barceló (sitio oficial). GolfPass, GolfNow
--     y TeeOff publican la misma tabla, pero NO son confirmación
--     independiente: GolfNow y TeeOff comparten la ficha (id -6277) y las tres
--     propagan la del resort. Es UNA fuente, repetida.
--
-- ⚠️ CORRECCIÓN DEL PAREO TEE↔RATING (dorado / azul)
-- --------------------------------------------------
-- Lo que publica la fuente, verbatim (GolfPass, panel de tees, leído el
-- 30-oct-2026; idéntico en el sitio de Barceló):
--
--     Black  6655  72.1  135
--     Gold   6200  68.0  119   ← el par (CR, slope) de estas dos filas
--     Blue   5737  70.3  126   ← está intercambiado
--     White  5381  66.0  115
--     Red    4688  63.0  107
--
-- La tabla está ordenada por largo y aun así le asigna a dorado (6.200 yds) un
-- rating MÁS FÁCIL que a azul (5.737 yds). Eso es físicamente imposible: el
-- Course Rating es el score esperado de un scratch sobre el MISMO recorrido, y
-- 463 yardas valen ~2 golpes. Dos filas adyacentes con el par (CR, slope)
-- permutado es la firma de un error de transcripción, no de una anomalía del
-- campo. Se corrige intercambiando los pares COMPLETOS: dorado 70.3/126 y azul
-- 68.0/119 (el slope viaja con su CR; los otros tres tees no se tocan).
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
-- Honestidad sobre la evidencia: NINGUNA fuente publica el pareo corregido con
-- autoridad. FreeGolfTracker lista un "Gold" con 70.3/126 sobre un scorecard de
-- 6.200 yds, que coincide, pero es una ficha de usuarios. El club no publica sus
-- ratings y la federación dominicana no los tiene en línea. O sea: la corrección
-- se apoya en el argumento físico, no en una segunda fuente. Queda anotada como
-- corrección nuestra en `course_tees.fuente` y en
-- `docs/CATALOGO_CANCHAS_PENDIENTES.md`, con el pendiente de pedirle al club la
-- tabla oficial. Si llega y dice otra cosa, manda el club.
--
-- Por qué se corrige y no se carga lo publicado: el jugador de dorado recibiría
-- 3 golpes MENOS que el de azul desde 463 yardas más (neto injusto con tees
-- mixtos), y en ronda libre su diferencial saldría ~2.3 golpes inflado, o sea le
-- empeoraría el índice. Con la corrección, el peor caso es que el club confirme
-- lo publicado y haya que volver atrás con otra migración.
--
-- ⚠️ TODOS LOS TEES VAN COMO 'M'
-- ------------------------------
-- El resort no publica rating de damas. El del rojo (63.0 para 4.769 yds) es un
-- rating de varones: el de damas para esa distancia estaría cerca de 68. Cargar
-- 63.0 como 'F' AFIRMARÍA que es un rating de damas, y no lo es. Queda como 'M'.
--
-- Pero que quede claro lo que eso significa, porque no es neutro: sin fila del
-- género, `findByName` (`resolve-player-tee.ts`) y `resolveRatings`
-- (`tee-resolver.ts`) caen al primer candidato, así que una jugadora en el rojo
-- recibe 63.0/107 — el rating de varones — igual que si estuviera cargado como
-- 'F'. Con índice 20 son ~10 golpes de course handicap, cuando un rating de damas
-- plausible para 4.769 yds (~68.5/115) le daría ~17. Son ~7 golpes de menos.
--
-- O sea: 'M' no protege a la jugadora, sólo evita MENTIR sobre de quién es el
-- dato. El hueco es real y está anotado en `docs/CATALOGO_CANCHAS_PENDIENTES.md`:
-- se cierra cuando el club publique el rating de damas, no antes.
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
SELECT c.id, v.nombre, 'M', 72, v.yardaje, v.rating, v.slope,
       'barcelo; pareo CR+slope dorado<->azul corregido (ver cabecera)'
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
