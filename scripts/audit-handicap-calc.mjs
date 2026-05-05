#!/usr/bin/env node
/**
 * scripts/audit-handicap-calc.mjs
 *
 * Auditoría de los inputs del cálculo de course handicap.
 * Detecta data inconsistente que produce HCP incorrectos en silencio.
 * El cálculo `resolverCourseHandicap()` (src/golf/core/course-handicap.ts) es
 * función pura simple: el bug nunca está en la fórmula, está en los datos.
 *
 * Uso:
 *   node --env-file=.env.local scripts/audit-handicap-calc.mjs
 *
 * Output:
 *   - stdout: resumen humano por categoría
 *   - reports/audit-handicap-{ISO}.json: detalle completo + samples
 *
 * Exit codes:
 *   0 → todo limpio o solo hallazgos informativos
 *   1 → P0 detectado (canchas/tees activos con CR/slope NULL o fuera de rango,
 *        canchas FedeGolf sin tees válidos, tees duplicados post-normalización)
 */

import fs from 'node:fs'
import path from 'node:path'

const accessToken = process.env.SUPABASE_ACCESS_TOKEN
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

if (!accessToken || !supabaseUrl) {
  console.error('ERROR: faltan SUPABASE_ACCESS_TOKEN o NEXT_PUBLIC_SUPABASE_URL en .env.local')
  process.exit(2)
}

const refMatch = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)
if (!refMatch) {
  console.error(`ERROR: NEXT_PUBLIC_SUPABASE_URL no tiene formato esperado: ${supabaseUrl}`)
  process.exit(2)
}
const projectRef = refMatch[1]
const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/database/query`

async function execSql(sql) {
  const t0 = Date.now()
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`SQL HTTP ${res.status}: ${text.slice(0, 500)}`)
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = []
  }
  return { rows: Array.isArray(parsed) ? parsed : [], ms: Date.now() - t0 }
}

// Rangos del audit. Convención WHS: la columna `rating` siempre representa
// el rating EQUIVALENTE 18h (independiente de tipo_recorrido). Los campos
// front_course_rating / back_course_rating guardan los reales por mitad 9h.
//
// Por lo tanto:
//   - 18h estándar (par 60-78): rating ∈ [par - 8, par + 8]
//                               (par-72 → [64,80]; par-60 ejecutiva → [52,68])
//   - 9h (par 27-40):           rating ∈ [par*2 - 8, par*2 + 8]
//                               (par-36 9h → 18h-equiv [64,80])
//   - Floor absoluto sano:      rating ≥ 50  (rating <50 = escala 9h dejada
//                               sin escalar, o yardage en CR — ambos bugs)
//   - Ceiling absoluto sano:    rating ≤ 85  (>85 = inversión slope↔CR)
// Slope sigue siendo universal WHS [55, 155] (no depende del par ni del tipo).
const RANGES = {
  rating: {
    offset: 8,           // banda alrededor del par-equivalente-18h
    absoluteMin: 50,     // por debajo es bug (escala 9h sin escalar, etc.)
    absoluteMax: 85,     // por encima es bug (inversión CR↔slope)
  },
  slope: { min: 55, max: 155 },
}

const QUERIES = [
  {
    id: 'tees_missing_ratings',
    severity: 'p0',
    description: 'Tees con rating o slope NULL — el cálculo cae al fallback round(index)',
    sql: `
      SELECT t.id, t.course_id, c.nombre AS course, t.nombre AS tee, t.genero,
        t.rating, t.slope
      FROM course_tees t JOIN courses c ON c.id = t.course_id
      WHERE t.rating IS NULL OR t.slope IS NULL
      ORDER BY c.nombre, t.nombre
    `,
  },
  {
    id: 'tees_out_of_range',
    severity: 'p0',
    description: `Tees con rating fuera de [par_eff±${RANGES.rating.offset}] clamp [${RANGES.rating.absoluteMin}, ${RANGES.rating.absoluteMax}], o slope fuera de [${RANGES.slope.min}, ${RANGES.slope.max}]`,
    // Heurística par-aware:
    //   par_eff = par_total * 2 si tipo='9h' (la columna rating es 18h-equiv)
    //           = par_total      si tipo='18h' o NULL
    //   rating_min = max(par_eff - 8, 50)
    //   rating_max = min(par_eff + 8, 85)
    //
    // Falsos positivos eliminados:
    //   ✓ par-60 ejecutiva (Antofagasta): rating 58.3 ∈ [52,68] ✓
    //   ✓ par-62 short course (Río Blanco): rating 55 ∈ [54,70] ✓
    //   ✓ par-72 DAMAS difícil (Hacienda Chicureo): rating 78.6 ∈ [64,80] ✓
    //   ✓ Olivos 9h post-fix: rating 73 ∈ [64,80] (par_eff=72) ✓
    //   ✗ Rechaza rating 107 (Marbella original swap)
    //   ✗ Rechaza rating 36 sin escalar a 18h-equiv (bugs históricos)
    sql: `
      WITH par_eff AS (
        SELECT
          t.id AS tee_id,
          CASE
            WHEN c.tipo_recorrido = '9h' AND c.par_total IS NOT NULL
              THEN c.par_total * 2
            ELSE c.par_total
          END AS par_eff_value
        FROM course_tees t JOIN courses c ON c.id = t.course_id
      )
      SELECT t.id, t.course_id, c.nombre AS course, t.nombre AS tee, t.genero,
        t.rating, t.slope, c.par_total, c.tipo_recorrido,
        pe.par_eff_value,
        GREATEST(pe.par_eff_value - ${RANGES.rating.offset}, ${RANGES.rating.absoluteMin}) AS rating_min_dynamic,
        LEAST(pe.par_eff_value + ${RANGES.rating.offset}, ${RANGES.rating.absoluteMax}) AS rating_max_dynamic
      FROM course_tees t
      JOIN courses c ON c.id = t.course_id
      JOIN par_eff pe ON pe.tee_id = t.id
      WHERE (
        -- chequeo dinámico contra par_eff
        t.rating IS NOT NULL
        AND pe.par_eff_value IS NOT NULL
        AND (
          t.rating < GREATEST(pe.par_eff_value - ${RANGES.rating.offset}, ${RANGES.rating.absoluteMin})
          OR t.rating > LEAST(pe.par_eff_value + ${RANGES.rating.offset}, ${RANGES.rating.absoluteMax})
        )
      ) OR (
        -- floor/ceiling absoluto (atrapa basura aunque par_total sea NULL)
        t.rating IS NOT NULL
        AND (t.rating < ${RANGES.rating.absoluteMin} OR t.rating > ${RANGES.rating.absoluteMax})
      ) OR (
        -- slope universal WHS
        t.slope IS NOT NULL
        AND (t.slope < ${RANGES.slope.min} OR t.slope > ${RANGES.slope.max})
      )
      ORDER BY c.nombre, t.nombre
    `,
  },
  {
    id: 'tees_partial_9h_ratings',
    severity: 'warning',
    description: 'Tees con front/back ratings asimétricos (uno poblado, otro NULL) — bloquea cálculo correcto en rondas 9h',
    sql: `
      SELECT t.id, t.course_id, c.nombre AS course, t.nombre AS tee, t.genero,
        t.front_course_rating, t.front_slope_rating,
        t.back_course_rating, t.back_slope_rating
      FROM course_tees t JOIN courses c ON c.id = t.course_id
      WHERE (t.front_course_rating IS NOT NULL AND t.back_course_rating IS NULL)
         OR (t.back_course_rating IS NOT NULL AND t.front_course_rating IS NULL)
         OR (t.front_slope_rating IS NOT NULL AND t.back_slope_rating IS NULL)
         OR (t.back_slope_rating IS NOT NULL AND t.front_slope_rating IS NULL)
      ORDER BY c.nombre, t.nombre
    `,
  },
  {
    id: 'courses_placeholder_slope_113',
    severity: 'warning',
    description: 'Canchas con courses.slope_rating=113 (placeholder universal FedeGolf) — fallback inconsistente cuando el tee tampoco tiene rating',
    sql: `
      SELECT c.id, c.nombre, c.ciudad, c.slope_rating, c.course_rating, c.par_total,
        (SELECT COUNT(*) FROM course_tees t WHERE t.course_id = c.id) AS tee_count,
        (SELECT COUNT(*) FROM course_tees t WHERE t.course_id = c.id AND t.rating IS NOT NULL AND t.slope IS NOT NULL) AS tee_valid_count
      FROM courses c
      WHERE c.slope_rating = 113
      ORDER BY c.nombre
    `,
  },
  {
    id: 'fedegolf_courses_without_valid_tees',
    severity: 'p0',
    description: 'Canchas FedeGolf ACTIVAS con CERO tees válidos — toda ronda en estas canchas calcula HCP placeholder',
    sql: `
      SELECT c.id, c.nombre, c.ciudad, c.fedegolf_club_id, c.slope_rating, c.course_rating, c.activa
      FROM courses c
      WHERE c.fedegolf_club_id IS NOT NULL
        AND c.activa = true
        AND NOT EXISTS (
          SELECT 1 FROM course_tees t
          WHERE t.course_id = c.id
            AND t.rating IS NOT NULL AND t.slope IS NOT NULL
        )
      ORDER BY c.nombre
    `,
  },
  {
    id: 'tees_duplicated_post_normalization',
    severity: 'p0',
    description: 'Tees con mismo (course_id, LOWER(nombre), genero) duplicados — la migración 030 dejó residuos o el sync introduce nuevos',
    sql: `
      SELECT t.course_id, c.nombre AS course, LOWER(t.nombre) AS tee_norm, t.genero,
        COUNT(*) AS dup_count, ARRAY_AGG(t.id) AS tee_ids, ARRAY_AGG(t.nombre) AS variantes
      FROM course_tees t JOIN courses c ON c.id = t.course_id
      GROUP BY t.course_id, c.nombre, LOWER(t.nombre), t.genero
      HAVING COUNT(*) > 1
      ORDER BY c.nombre, tee_norm
    `,
  },
  {
    id: 'tees_nombre_non_canonical',
    severity: 'warning',
    description: 'Tees con nombre no-canónico (la migración 030 normalizó a 5 valores: negras|azul|blanco|rojo|dorado, plus loops compuestos)',
    sql: `
      SELECT t.id, t.course_id, c.nombre AS course, t.nombre AS tee, t.genero
      FROM course_tees t JOIN courses c ON c.id = t.course_id
      WHERE LOWER(t.nombre) NOT IN ('negras', 'azul', 'blanco', 'rojo', 'dorado')
        AND LOWER(t.nombre) NOT LIKE 'negras\\_%'
        AND LOWER(t.nombre) NOT LIKE 'azul\\_%'
        AND LOWER(t.nombre) NOT LIKE 'blanco\\_%'
        AND LOWER(t.nombre) NOT LIKE 'rojo\\_%'
        AND LOWER(t.nombre) NOT LIKE 'dorado\\_%'
      ORDER BY c.nombre, t.nombre
    `,
  },
  {
    id: 'rounds_without_course_id',
    severity: 'info',
    description: 'Rondas finalizadas sin course_id — cálculo cae a Math.round(index) sin ajuste por slope/CR',
    sql: `
      SELECT 'historical_rounds' AS tabla,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE played_at >= NOW() - INTERVAL '90 days') AS recientes_90d
      FROM historical_rounds WHERE course_id IS NULL
      UNION ALL
      SELECT 'rondas_libres' AS tabla,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE fecha >= NOW() - INTERVAL '90 days') AS recientes_90d
      FROM rondas_libres WHERE course_id IS NULL AND estado = 'finalizada'
    `,
  },
  {
    id: 'ratings_distribution_by_gender',
    severity: 'info',
    description: 'Distribución de rating/slope por género (sanity check — varones >> damas en general)',
    sql: `
      SELECT t.genero,
        COUNT(*) AS tees,
        ROUND(MIN(t.rating)::numeric, 1) AS cr_min,
        ROUND(MAX(t.rating)::numeric, 1) AS cr_max,
        ROUND(AVG(t.rating)::numeric, 1) AS cr_avg,
        MIN(t.slope) AS slope_min,
        MAX(t.slope) AS slope_max,
        ROUND(AVG(t.slope)::numeric, 0) AS slope_avg
      FROM course_tees t
      WHERE t.rating IS NOT NULL AND t.slope IS NOT NULL
      GROUP BY t.genero
      ORDER BY t.genero
    `,
  },
  {
    id: 'multi_recorrido_children_missing_ratings',
    severity: 'warning',
    description: 'Canchas multi-recorrido (parent_id NOT NULL) cuyos children no tienen ratings — bloquea modalidades 27h/36h',
    sql: `
      SELECT parent.id AS parent_id, parent.nombre AS parent_name,
        COUNT(child.id) AS children_total,
        COUNT(child.id) FILTER (WHERE child.course_rating IS NULL OR child.slope_rating IS NULL) AS children_sin_ratings
      FROM courses parent
      LEFT JOIN courses child ON child.parent_id = parent.id
      WHERE parent.tipo_recorrido IN ('27h', '36h')
      GROUP BY parent.id, parent.nombre
      HAVING COUNT(child.id) FILTER (WHERE child.course_rating IS NULL OR child.slope_rating IS NULL) > 0
      ORDER BY parent.nombre
    `,
  },
  {
    id: 'recent_finished_rounds_at_risk',
    severity: 'warning',
    description: 'Rondas libres recientes (últimos 30d) en canchas/tees con datos cuestionables',
    sql: `
      SELECT rl.id AS ronda_id, rl.codigo, rl.fecha, rl.tees, rl.holes,
        c.nombre AS cancha,
        t.rating AS tee_rating, t.slope AS tee_slope,
        c.course_rating AS course_cr, c.slope_rating AS course_slope
      FROM rondas_libres rl
      LEFT JOIN courses c ON c.id = rl.course_id
      LEFT JOIN course_tees t ON t.course_id = rl.course_id AND LOWER(t.nombre) = LOWER(rl.tees)
      WHERE rl.estado = 'finalizada'
        AND rl.fecha >= NOW() - INTERVAL '30 days'
        AND (
          (t.rating IS NULL OR t.slope IS NULL)
          OR (c.slope_rating = 113 AND t.id IS NULL)
        )
      ORDER BY rl.fecha DESC
      LIMIT 100
    `,
  },
]

const SAMPLE_SIZE = 30

async function main() {
  console.log(`→ Audit handicap calc | project ${projectRef} | ${new Date().toISOString()}`)
  console.log(`→ ${QUERIES.length} categorías de chequeo\n`)

  const results = []
  let p0Count = 0
  let warningCount = 0

  for (const q of QUERIES) {
    process.stdout.write(`  [${q.severity.padEnd(7)}] ${q.id} ... `)
    let r
    try {
      r = await execSql(q.sql.trim())
    } catch (err) {
      console.log(`ERROR: ${err.message}`)
      results.push({ ...q, error: err.message, count: null, sample: [] })
      continue
    }

    const count = r.rows.length
    const flag = count > 0 && q.severity === 'p0' ? '🔴' : count > 0 && q.severity === 'warning' ? '🟡' : count > 0 ? 'ℹ️' : '✅'
    console.log(`${flag}  ${count} hallazgo${count === 1 ? '' : 's'}  (${r.ms}ms)`)

    if (count > 0 && q.severity === 'p0') p0Count++
    if (count > 0 && q.severity === 'warning') warningCount++

    results.push({
      id: q.id,
      severity: q.severity,
      description: q.description,
      count,
      ms: r.ms,
      sample: r.rows.slice(0, SAMPLE_SIZE),
      truncated: count > SAMPLE_SIZE,
    })
  }

  // Persistir reporte
  const reportsDir = path.resolve('reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const outFile = path.join(reportsDir, `audit-handicap-${stamp}.json`)
  fs.writeFileSync(
    outFile,
    JSON.stringify(
      {
        project: projectRef,
        ranAt: new Date().toISOString(),
        ranges: RANGES,
        canonical_tee_names: ['negras', 'azul', 'blanco', 'rojo', 'dorado'],
        summary: {
          total_categories: QUERIES.length,
          p0_with_findings: p0Count,
          warnings_with_findings: warningCount,
        },
        results,
      },
      null,
      2,
    ),
  )

  console.log(`\n→ reporte: ${path.relative(process.cwd(), outFile)}`)
  console.log(`→ resumen: ${p0Count} P0 con hallazgos · ${warningCount} warnings con hallazgos`)

  if (p0Count > 0) {
    console.log('\n🔴 HAY P0. Revisar el reporte y arreglar antes de torneos reales.')
    process.exit(1)
  }
  console.log('\n✅ Cero P0. Datos coherentes para el cálculo de course handicap.')
}

main().catch(err => {
  console.error('FATAL:', err.message)
  process.exit(2)
})
