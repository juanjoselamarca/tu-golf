import type { SupabaseClient } from '@supabase/supabase-js'
import { type Category, type Check, safeCheck } from './tipos'

// ─── 2. Data Integrity ─────────────────────────────────────────────────────

export async function checkDataIntegrity(admin: SupabaseClient): Promise<Category> {
  const checks = await Promise.all([
    // Coach: cobertura de pares por hoyo (auditoría 2026-06-29 — "el coach nunca se
    // desconecta de la data"). Mide qué % de rondas con score hoyo-a-hoyo tienen una
    // fuente de par (par_per_hole de la ronda O catálogo course_holes vía course_id).
    // Si una ronda no tiene par, el coach ve golpes pero NO puede calcular vs-par ni
    // detectar patrones. Si esta cobertura BAJA, algo rompió el import/linkeo → alarma.
    safeCheck('Coach: cobertura de pares por hoyo', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT
                  COUNT(*) FILTER (WHERE scores IS NOT NULL AND total_gross IS NOT NULL) AS total,
                  COUNT(*) FILTER (
                    WHERE scores IS NOT NULL AND total_gross IS NOT NULL
                    AND (par_per_hole IS NULL OR par_per_hole::text IN ('{}','[]','null'))
                    AND (course_id IS NULL OR course_id NOT IN (SELECT DISTINCT course_id FROM course_holes))
                  ) AS sin_par
                FROM historical_rounds`,
      })
      const total = Number(data?.[0]?.total ?? 0)
      const sinPar = Number(data?.[0]?.sin_par ?? 0)
      const cobertura = total > 0 ? Math.round(((total - sinPar) / total) * 100) : 100
      return {
        name: 'Coach: cobertura de pares por hoyo',
        status: cobertura >= 75 ? 'pass' : cobertura >= 60 ? 'warn' : 'fail',
        message: total === 0
          ? 'Sin rondas con score'
          : `${cobertura}% de rondas con par resoluble — ${sinPar}/${total} sin fuente de par (el coach no puede calcular vs-par de esas)`,
        details: { total, sin_par: sinPar, cobertura_pct: cobertura },
      }
    }),

    // Catálogo: consistencia de pares (auditoría 2026-07-02). El coach calcula
    // vs-par con el par POR HOYO del catálogo; si una cancha tiene par incoherente
    // (par_total ≠ suma real, hoyos ≠ los que espera su tipo, filas duplicadas,
    // par fuera de rango, o DAMAS y VARONES del mismo recorrido con distinto NÚMERO
    // de hoyos —la cancha física es la misma—) reporta un vs-par equivocado apenas
    // alguien juegue ahí. Es "imperdonable": esta
    // OJO: el PAR sí puede diferir D vs V por hoyo (regla USGA: un hoyo medio-largo
    // es par-4 hombres / par-5 damas), así que NO se compara el par entre géneros,
    // solo el número de hoyos.
    // invariante suena la alarma ante cualquier corrupción nueva del catálogo.
    // Complementa el medidor de cobertura (canchas SIN hoyos) de arriba.
    safeCheck('Catálogo: consistencia de pares', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `WITH agg AS (
                  SELECT c.id, c.tipo_recorrido AS tipo, c.par_total,
                    regexp_replace(c.nombre,'\\s*\\((DAMAS|VARONES)\\)\\s*$','','i') AS base,
                    h.filas, h.nums, h.parsum, h.mn, h.mx
                  FROM courses c
                  LEFT JOIN (SELECT course_id, count(*) filas, count(DISTINCT numero) nums,
                               sum(par) parsum, min(par) mn, max(par) mx
                             FROM course_holes GROUP BY course_id) h ON h.course_id=c.id
                  WHERE c.activa = true
                ),
                sib AS (
                  SELECT a.id, (SELECT b.nums FROM agg b
                                WHERE b.base=a.base AND b.id<>a.id AND b.nums IS NOT NULL LIMIT 1) AS herm
                  FROM agg a
                ),
                flags AS (
                  SELECT
                    (a.filas IS NOT NULL AND a.filas<>a.nums) AS f_dup,
                    (a.filas IS NOT NULL AND a.par_total IS NOT NULL AND a.parsum<>a.par_total) AS f_parsum,
                    (a.filas IS NOT NULL AND (a.mn<3 OR a.mx>6)) AS f_rango,
                    (a.nums IS NOT NULL AND ((a.tipo='9h' AND a.nums<>9) OR (a.tipo='18h' AND a.nums<>18) OR (a.tipo='27h' AND a.nums<>27))) AS f_conteo,
                    (a.nums IS NOT NULL AND s.herm IS NOT NULL AND a.nums<>s.herm) AS f_genero
                  FROM agg a JOIN sib s ON s.id=a.id
                )
                SELECT count(*) FILTER (WHERE f_dup) dup,
                  count(*) FILTER (WHERE f_parsum) parsum_ne,
                  count(*) FILTER (WHERE f_rango) rango,
                  count(*) FILTER (WHERE f_conteo) conteo,
                  count(*) FILTER (WHERE f_genero) genero_ne,
                  count(*) FILTER (WHERE f_dup OR f_parsum OR f_rango OR f_conteo OR f_genero) total
                FROM flags`,
      })
      const r = (data?.[0] ?? {}) as Record<string, number>
      const total = Number(r.total ?? 0)
      // Backlog limpio al 2-jul-2026 → cualquier violación es una regresión real
      // ("imperdonable"). pass sólo en 0; fail si aparece cualquiera.
      return {
        name: 'Catálogo: consistencia de pares',
        status: total === 0 ? 'pass' : 'fail',
        message: total === 0
          ? 'Todas las canchas activas con hoyos tienen par consistente'
          : `${total} canchas con par inconsistente — parTotal≠suma:${Number(r.parsum_ne ?? 0)} · hoyos≠tipo:${Number(r.conteo ?? 0)} · D/V nº hoyos:${Number(r.genero_ne ?? 0)} · duplicadas:${Number(r.dup ?? 0)} · fuera de rango:${Number(r.rango ?? 0)}`,
        details: { total, ...r },
      }
    }),

    // Catálogo: stroke index válido (bug de campo "net +12 Don Jorge", 24-jun-2026).
    // El net/stableford reparte los golpes de hándicap por stroke_index; si el SI de
    // una cancha no es una permutación 1..N (duplicados, huecos o nulls), los hoyos
    // con SI bajo faltantes NO reciben su golpe → el net aloca MENOS golpes que el
    // course handicap y sale inflado (+2/+3) en TODOS los caminos (leaderboard,
    // compartir, anotador, equipos, torneo). Normalizado el 7-jul-2026 (migración
    // 20260707000001_normalize_stroke_index) → backlog en 0. Cualquier violación nueva es
    // una regresión de import. Solo canchas con 1 fila por hoyo (las duplicadas las
    // cubre el guard de pares de arriba, no se cuentan dos veces).
    safeCheck('Catálogo: stroke index válido', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `WITH per AS (
                  SELECT ch.course_id,
                    count(*) n, count(DISTINCT ch.numero) ndist,
                    count(*) FILTER (WHERE ch.stroke_index IS NULL) nulls,
                    count(DISTINCT ch.stroke_index) si_distinct,
                    min(ch.stroke_index) mn, max(ch.stroke_index) mx
                  FROM course_holes ch
                  JOIN courses c ON c.id = ch.course_id AND c.activa = true
                  GROUP BY ch.course_id
                )
                SELECT count(*) total
                FROM per
                WHERE n = ndist
                  AND (nulls > 0 OR si_distinct <> n OR mn <> 1 OR mx <> n)`,
      })
      const total = Number((data?.[0] as { total?: number } | undefined)?.total ?? 0)
      return {
        name: 'Catálogo: stroke index válido',
        status: total === 0 ? 'pass' : 'fail',
        message: total === 0
          ? 'Todas las canchas activas tienen stroke index en permutación válida 1..N'
          : `${total} canchas con stroke index inválido (duplicados/huecos/nulls) — el net reparte mal los golpes de hándicap`,
        details: { total },
      }
    }),

    // Orphaned ronda_libre_jugadores
    safeCheck('Jugadores huérfanos (rondas libres)', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) as cnt FROM ronda_libre_jugadores j
                LEFT JOIN rondas_libres r ON r.id = j.ronda_id
                WHERE r.id IS NULL`,
      })
      const count = data?.[0]?.cnt ?? 0
      return {
        name: 'Jugadores huérfanos (rondas libres)',
        status: Number(count) === 0 ? 'pass' : 'fail',
        message: Number(count) === 0 ? 'Sin huérfanos' : `${count} jugadores sin ronda`,
        details: { count: Number(count) },
      }
    }),

    // Orphaned rounds
    safeCheck('Rounds huérfanos', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) as cnt FROM rounds rd
                LEFT JOIN tournaments t ON t.id = rd.tournament_id
                WHERE t.id IS NULL`,
      })
      const count = data?.[0]?.cnt ?? 0
      return {
        name: 'Rounds huérfanos',
        status: Number(count) === 0 ? 'pass' : 'warn',
        message: Number(count) === 0 ? 'Sin huérfanos' : `${count} rounds sin torneo`,
        details: { count: Number(count) },
      }
    }),

    // Orphaned hole_scores
    safeCheck('Hole scores huérfanos', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) as cnt FROM hole_scores hs
                LEFT JOIN rounds rd ON rd.id = hs.round_id
                WHERE rd.id IS NULL`,
      })
      const count = data?.[0]?.cnt ?? 0
      return {
        name: 'Hole scores huérfanos',
        status: Number(count) === 0 ? 'pass' : 'warn',
        message: Number(count) === 0 ? 'Sin huérfanos' : `${count} scores sin round`,
        details: { count: Number(count) },
      }
    }),

    // Rondas stuck en_curso > 48h
    safeCheck('Rondas abandonadas (>48h en_curso)', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) as cnt FROM rondas_libres
                WHERE estado = 'en_curso'
                AND created_at < NOW() - INTERVAL '48 hours'`,
      })
      const count = data?.[0]?.cnt ?? 0
      return {
        name: 'Rondas abandonadas (>48h en_curso)',
        status: Number(count) === 0 ? 'pass' : 'warn',
        message: Number(count) === 0 ? 'Ninguna' : `${count} rondas posiblemente abandonadas`,
        details: { count: Number(count) },
      }
    }),

    // Profiles sin email
    safeCheck('Perfiles sin email', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) as cnt FROM profiles
                WHERE email IS NULL OR email = ''`,
      })
      const count = data?.[0]?.cnt ?? 0
      return {
        name: 'Perfiles sin email',
        status: Number(count) === 0 ? 'pass' : 'fail',
        message: Number(count) === 0 ? 'Todos tienen email' : `${count} perfiles sin email`,
        details: { count: Number(count) },
      }
    }),

    // Duplicate push subscriptions
    safeCheck('Push subscriptions duplicadas', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) as cnt FROM (
                  SELECT user_id, endpoint, COUNT(*) as c
                  FROM push_subscriptions
                  WHERE user_id IS NOT NULL
                  GROUP BY user_id, endpoint
                  HAVING COUNT(*) > 1
                ) dupes`,
      })
      const count = data?.[0]?.cnt ?? 0
      return {
        name: 'Push subscriptions duplicadas',
        status: Number(count) === 0 ? 'pass' : 'warn',
        message: Number(count) === 0 ? 'Sin duplicados' : `${count} duplicados`,
        details: { count: Number(count) },
      }
    }),
  ])

  return { name: 'Integridad de datos', checks }
}

