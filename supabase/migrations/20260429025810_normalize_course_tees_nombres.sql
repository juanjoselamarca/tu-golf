-- Migration 030: Normalizar course_tees.nombre a 5 valores canónicos
--
-- Contexto: la migración 026 normalizó course_holes.yardaje_* y los tees por
-- género en tournaments/players/rondas_libres. Quedó pendiente course_tees.nombre,
-- que sync-courses-unified.ts seguía guardando como singular ('negro') mientras
-- la UI envía plural ('negras') tras la migración 026. El mismatch hacía que
-- cargarCourseData() para tee='negras' en cancha FedeGolf cayera al fallback
-- courses.slope_rating=113 (placeholder), produciendo handicaps mal calculados
-- para jugadores con tee Negras.
--
-- Esta migración:
--   1) Deduplica filas que colisionarían tras la normalización (4 canchas manuales
--      con tees cargados en español Y en inglés — conservar la versión canónica
--      o la más vieja si empate).
--   2) Normaliza nombres simples a los 5 canónicos: negras/azul/blanco/rojo/dorado
--   3) Normaliza nombres compuestos preservando el sufijo (negro_sur_este → negras_sur_este)
--   4) Reporta el resultado para verificación.
--
-- No hay FKs hacia course_tees.id (verificado), por lo que el DELETE es seguro.
-- Idempotente: re-ejecutar no produce cambios después de la primera pasada.

DO $$
DECLARE
  filas_borradas integer;
BEGIN
  -- 1. DEDUP: borrar filas que después de la normalización colisionarían
  --    con otra fila del mismo course_id. Conservar la fila preferida:
  --      a) la que ya tiene nombre canónico (ej. 'azul' antes que 'Blue')
  --      b) si empate, la más vieja (created_at ASC)
  WITH normalized AS (
    SELECT
      id, course_id,
      CASE
        WHEN LOWER(nombre) IN ('negro','negra','black','championship','campeonato') THEN 'negras'
        WHEN LOWER(nombre) IN ('blue','azules')                                     THEN 'azul'
        WHEN LOWER(nombre) IN ('blanca','blancas','white')                           THEN 'blanco'
        WHEN LOWER(nombre) IN ('roja','rojas','red','ladies')                        THEN 'rojo'
        WHEN LOWER(nombre) IN ('dorada','gold','yellow','amarillo')                  THEN 'dorado'
        WHEN nombre ~* '^(negro|negra|black|championship|campeonato)_'
          THEN REGEXP_REPLACE(nombre, '^(negro|negra|black|championship|campeonato)_', 'negras_', 'i')
        WHEN nombre ~* '^(blue|azules)_'
          THEN REGEXP_REPLACE(nombre, '^(blue|azules)_', 'azul_', 'i')
        WHEN nombre ~* '^(blanca|blancas|white)_'
          THEN REGEXP_REPLACE(nombre, '^(blanca|blancas|white)_', 'blanco_', 'i')
        WHEN nombre ~* '^(roja|rojas|red|ladies)_'
          THEN REGEXP_REPLACE(nombre, '^(roja|rojas|red|ladies)_', 'rojo_', 'i')
        WHEN nombre ~* '^(dorada|gold|yellow|amarillo)_'
          THEN REGEXP_REPLACE(nombre, '^(dorada|gold|yellow|amarillo)_', 'dorado_', 'i')
        ELSE nombre
      END AS nombre_norm,
      LOWER(nombre) AS nombre_lower,
      created_at
    FROM course_tees
  ),
  ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY course_id, nombre_norm
        ORDER BY
          CASE WHEN nombre_lower = nombre_norm THEN 0 ELSE 1 END,  -- canónico primero
          created_at ASC                                             -- más vieja primero
      ) AS rn
    FROM normalized
  )
  DELETE FROM course_tees WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

  GET DIAGNOSTICS filas_borradas = ROW_COUNT;
  RAISE NOTICE 'Dedup: % filas borradas', filas_borradas;

  -- 2. RENAME nombres simples (sin underscore) — case-insensitive
  UPDATE course_tees SET nombre = 'negras'
    WHERE LOWER(nombre) IN ('negro', 'negra', 'black', 'championship', 'campeonato');

  UPDATE course_tees SET nombre = 'azul'
    WHERE LOWER(nombre) IN ('blue', 'azules');

  UPDATE course_tees SET nombre = 'blanco'
    WHERE LOWER(nombre) IN ('blanca', 'blancas', 'white');

  UPDATE course_tees SET nombre = 'rojo'
    WHERE LOWER(nombre) IN ('roja', 'rojas', 'red', 'ladies');

  UPDATE course_tees SET nombre = 'dorado'
    WHERE LOWER(nombre) IN ('dorada', 'gold', 'yellow', 'amarillo');

  -- 3. RENAME nombres compuestos (con underscore) — normalizar el prefijo
  UPDATE course_tees
    SET nombre = REGEXP_REPLACE(nombre, '^(negro|negra|black|championship|campeonato)_', 'negras_', 'i')
    WHERE nombre ~* '^(negro|negra|black|championship|campeonato)_';

  UPDATE course_tees
    SET nombre = REGEXP_REPLACE(nombre, '^(blue|azules)_', 'azul_', 'i')
    WHERE nombre ~* '^(blue|azules)_';

  UPDATE course_tees
    SET nombre = REGEXP_REPLACE(nombre, '^(blanca|blancas|white)_', 'blanco_', 'i')
    WHERE nombre ~* '^(blanca|blancas|white)_';

  UPDATE course_tees
    SET nombre = REGEXP_REPLACE(nombre, '^(roja|rojas|red|ladies)_', 'rojo_', 'i')
    WHERE nombre ~* '^(roja|rojas|red|ladies)_';

  UPDATE course_tees
    SET nombre = REGEXP_REPLACE(nombre, '^(dorada|gold|yellow|amarillo)_', 'dorado_', 'i')
    WHERE nombre ~* '^(dorada|gold|yellow|amarillo)_';

  -- 4. Forzar lowercase en los 5 nombres canónicos simples — elimina inconsistencia
  --    'Rojo' vs 'rojo' que sobrevive en filas FedeGolf pre-existentes.
  --    Los nombres compuestos (con underscore o espacios) se preservan.
  UPDATE course_tees SET nombre = LOWER(nombre)
    WHERE nombre IN ('Negras','Azul','Blanco','Rojo','Dorado',
                     'NEGRAS','AZUL','BLANCO','ROJO','DORADO');
END $$;

-- 4. Reporte de verificación
SELECT
  LOWER(t.nombre) AS nombre_canonico,
  COUNT(*)        AS tees,
  COUNT(*) FILTER (WHERE c.fuente = 'fedegolf')      AS fedegolf,
  COUNT(*) FILTER (WHERE c.fuente = 'manual')        AS manual,
  COUNT(*) FILTER (WHERE c.fuente = 'golfcourseapi') AS golfcourseapi
FROM course_tees t
JOIN courses c ON c.id = t.course_id
GROUP BY LOWER(t.nombre)
ORDER BY tees DESC;
