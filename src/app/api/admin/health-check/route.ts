import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabaseAdmin'
import { isAdmin } from '@/lib/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Check {
  name: string
  status: 'pass' | 'warn' | 'fail'
  message: string
  details?: unknown
  duration_ms?: number
}

interface Category {
  name: string
  checks: Check[]
}

interface HealthCheckResult {
  timestamp: string
  duration_ms: number
  summary: {
    total: number
    passed: number
    warnings: number
    failed: number
  }
  categories: Category[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const start = Date.now()
  const result = await fn()
  return { result, ms: Date.now() - start }
}

async function safeCheck(name: string, fn: () => Promise<Check>): Promise<Check> {
  try {
    return await fn()
  } catch (err) {
    return {
      name,
      status: 'fail',
      message: err instanceof Error ? err.message : 'Error desconocido',
    }
  }
}

// ─── 1. Services ────────────────────────────────────────────────────────────

async function checkServices(admin: SupabaseClient): Promise<Category> {
  const checks = await Promise.all([
    // Supabase ping
    safeCheck('Supabase ping', async () => {
      const { ms } = await timed(async () => admin.from('profiles').select('id').limit(1))
      return {
        name: 'Supabase ping',
        status: ms < 2000 ? 'pass' : 'warn',
        message: `Respuesta en ${ms}ms`,
        duration_ms: ms,
      }
    }),

    // ESPN API
    safeCheck('ESPN API', async () => {
      const { result: res, ms } = await timed(() =>
        fetch('https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard', {
          signal: AbortSignal.timeout(5000),
        })
      )
      return {
        name: 'ESPN API',
        status: res.ok ? 'pass' : 'warn',
        message: res.ok ? `OK en ${ms}ms` : `HTTP ${res.status} en ${ms}ms`,
        duration_ms: ms,
      }
    }),

    // Claude API key
    safeCheck('Claude API key', async () => {
      const configured = !!process.env.ANTHROPIC_API_KEY
      return {
        name: 'Claude API key',
        status: configured ? 'pass' : 'warn',
        message: configured ? 'Configurada' : 'No configurada',
      }
    }),

    // Vercel deploy
    safeCheck('Vercel deploy info', async () => {
      const commit = process.env.VERCEL_GIT_COMMIT_SHA || null
      const env = process.env.VERCEL_ENV || 'local'
      return {
        name: 'Vercel deploy info',
        status: 'pass',
        message: `Env: ${env}`,
        details: { commit: commit ?? 'local', env },
      }
    }),
  ])

  return { name: 'Servicios', checks }
}

// ─── 2. Data Integrity ─────────────────────────────────────────────────────

async function checkDataIntegrity(admin: SupabaseClient): Promise<Category> {
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
    // 20260707_normalize_stroke_index) → backlog en 0. Cualquier violación nueva es
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

// ─── 3. Route & Role Integrity ────────────────────────────────────────────

async function checkRouteAndRoleIntegrity(admin: SupabaseClient): Promise<Category> {
  const checks = await Promise.all([
    // Admin exists
    safeCheck('Admin existe', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) as cnt FROM profiles WHERE role = 'admin'`,
      })
      const count = Number(data?.[0]?.cnt ?? 0)
      return {
        name: 'Admin existe',
        status: count > 0 ? 'pass' : 'fail',
        message: count > 0 ? `${count} admin(s) registrados` : 'No hay ningun usuario admin',
        details: { count },
      }
    }),

    // Recent role changes — REMOVIDO en audit 2026-05-08: no es health, es audit
    // trail. Generaba falso-positive warn cada vez que se tocaba permisos.
    // Movido a un comando admin de auditoría aparte (TODO).

    // Critical tables accessible (proxy for critical routes)
    safeCheck('Rutas criticas accesibles', async () => {
      const tableRouteMap: Record<string, string[]> = {
        profiles: ['/perfil', '/dashboard'],
        historical_rounds: ['/perfil/historial'],
        courses: ['/importar'],
        tournaments: ['/leaderboard'],
        taiger_sessions: ['/coach'],
      }
      const failures: string[] = []
      const successes: string[] = []

      for (const [table, routes] of Object.entries(tableRouteMap)) {
        const { error } = await admin.from(table).select('*', { count: 'exact', head: true })
        if (error) {
          failures.push(`${table} (${routes.join(', ')}): ${error.message}`)
        } else {
          successes.push(table)
        }
      }

      return {
        name: 'Rutas criticas accesibles',
        status: failures.length === 0 ? 'pass' : 'fail',
        message: failures.length === 0
          ? `${successes.length} tablas criticas accesibles`
          : `${failures.length} tabla(s) inaccesible(s)`,
        details: { accessible: successes, failures },
      }
    }),

    // Navbar admin link — REMOVIDO en audit 2026-05-08: duplicaba "Admin existe"
    // arriba con la misma query (COUNT FROM profiles WHERE role='admin').
  ])

  return { name: 'Integridad de rutas y roles', checks }
}

// ─── 4. RLS Policies ──────────────────────────────────────────────────────

async function checkRLSPolicies(admin: SupabaseClient): Promise<Category> {
  const criticalTables = [
    'rondas_libres',
    'ronda_libre_jugadores',
    'hole_scores',
    'players',
    'profiles',
    'tournaments',
    'rounds',
  ]

  const checks = await Promise.all([
    safeCheck('Políticas RLS existentes', async () => {
      const { data, error } = await admin.rpc('exec_sql', {
        query: `SELECT tablename, policyname FROM pg_policies
                WHERE tablename IN ('rondas_libres','ronda_libre_jugadores','hole_scores','players','profiles','tournaments','rounds')
                ORDER BY tablename, policyname`,
      })

      if (error) {
        return {
          name: 'Políticas RLS existentes',
          status: 'fail' as const,
          message: `Error consultando políticas: ${error.message}`,
        }
      }

      const rows = (data ?? []) as Array<{ tablename: string; policyname: string }>
      const tablesWithPolicies = new Set(rows.map((r) => r.tablename))
      const missing = criticalTables.filter((t) => !tablesWithPolicies.has(t))

      return {
        name: 'Políticas RLS existentes',
        status: missing.length === 0 ? 'pass' : 'fail',
        message:
          missing.length === 0
            ? `${rows.length} políticas en ${tablesWithPolicies.size} tablas`
            : `Tablas sin políticas: ${missing.join(', ')}`,
        details: {
          total_policies: rows.length,
          tables_covered: Array.from(tablesWithPolicies),
          tables_missing: missing,
          policies: rows,
        },
      }
    }),
  ])

  return { name: 'Políticas RLS', checks }
}

// ─── 4. Flow Validation ────────────────────────────────────────────────────

async function checkFlows(admin: SupabaseClient): Promise<Category> {
  const checks = await Promise.all([
    // Query rondas_libres
    safeCheck('Query rondas_libres', async () => {
      const { error, count } = await admin
        .from('rondas_libres')
        .select('*', { count: 'exact', head: true })
      return {
        name: 'Query rondas_libres',
        status: error ? 'fail' : 'pass',
        message: error ? error.message : `OK — ${count} registros`,
      }
    }),

    // Query tournaments
    safeCheck('Query tournaments', async () => {
      const { error, count } = await admin
        .from('tournaments')
        .select('*', { count: 'exact', head: true })
      return {
        name: 'Query tournaments',
        status: error ? 'fail' : 'pass',
        message: error ? error.message : `OK — ${count} registros`,
      }
    }),

    // Query profiles
    safeCheck('Query profiles', async () => {
      const { error, count } = await admin
        .from('profiles')
        .select('*', { count: 'exact', head: true })
      return {
        name: 'Query profiles',
        status: error ? 'fail' : 'pass',
        message: error ? error.message : `OK — ${count} registros`,
      }
    }),

    // Valid estado values in rondas_libres
    safeCheck('Estados válidos (rondas_libres)', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) as cnt FROM rondas_libres
                WHERE estado NOT IN ('en_curso', 'finalizada')`,
      })
      const count = data?.[0]?.cnt ?? 0
      return {
        name: 'Estados válidos (rondas_libres)',
        status: Number(count) === 0 ? 'pass' : 'fail',
        message:
          Number(count) === 0
            ? 'Todos válidos'
            : `${count} rondas con estado inválido`,
        details: { invalid_count: Number(count) },
      }
    }),

    // Valid status values in tournaments
    safeCheck('Status válidos (tournaments)', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT DISTINCT status, COUNT(*) as cnt
                FROM tournaments GROUP BY status ORDER BY status`,
      })
      const rows = (data ?? []) as Array<{ status: string; cnt: number }>
      const validStatuses = ['draft', 'open', 'in_progress', 'closed', 'archived']
      const invalid = rows.filter((r) => !validStatuses.includes(r.status))
      return {
        name: 'Status válidos (tournaments)',
        status: invalid.length === 0 ? 'pass' : 'warn',
        message:
          invalid.length === 0
            ? `Todos válidos — ${rows.length} estados distintos`
            : `Estados inesperados: ${invalid.map((r) => r.status).join(', ')}`,
        details: { statuses: rows },
      }
    }),

    // Scores referencing non-existent holes
    safeCheck('Scores con hoyos inválidos', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) as cnt FROM ronda_libre_jugadores j
                JOIN rondas_libres r ON r.id = j.ronda_id
                WHERE EXISTS (
                  SELECT 1 FROM jsonb_object_keys(j.scores::jsonb) k
                  WHERE k::int > r.holes
                )`,
      })
      const count = data?.[0]?.cnt ?? 0
      return {
        name: 'Scores con hoyos inválidos',
        status: Number(count) === 0 ? 'pass' : 'warn',
        message:
          Number(count) === 0
            ? 'Ninguno'
            : `${count} jugadores con scores fuera de rango`,
        details: { count: Number(count) },
      }
    }),
  ])

  return { name: 'Validación de flujos', checks }
}

// ─── Performance — REMOVIDO en audit 2026-05-08 ────────────────────────────
// Los 3 checks (Tiempo query profiles/rondas_libres/analytics_events) usaban
// umbral de 2000ms que solo atrapa catástrofes ya tangibles. Una query lenta
// real (200→600ms) nunca disparaba. Sin métrica de baseline o p95 histórico,
// el check inflaba el conteo de "X passed" sin agregar señal accionable.
// Para reintroducir: comparar contra baseline rolling de últimas 24h, no
// contra threshold estático.

// ─── 6. Anti-regresión P0 ──────────────────────────────────────────────────
// Cada P0 cerrado debe dejar un check anti-regresión.
// Política de status: 0 → pass; >0 → warn (legacy histórico + posible regresión).
// No usar fail para no contaminar el conteo "failed" del summary con data legacy.

async function checkAntiRegresionP0(admin: SupabaseClient): Promise<Category> {
  const checks = await Promise.all([
    // Bug 30-abr Juanjo: ronda finalizada con menos hoyos jugados que configurados.
    // Detecta historical_rounds donde la cantidad de scores NO-null en el JSON
    // es estrictamente menor que holes_played. Excluye casos legítimos:
    //   - array con todos null/0 (ronda manual con total_gross sin desglose)
    //   - array longer than holes_played con padding null al final
    safeCheck('Rondas finalizadas con hoyos faltantes', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) AS cnt
                FROM historical_rounds hr,
                LATERAL (
                  SELECT
                    CASE
                      WHEN jsonb_typeof(hr.scores) = 'object'
                        THEN (SELECT COUNT(*) FROM jsonb_object_keys(hr.scores))::INT
                      WHEN jsonb_typeof(hr.scores) = 'array'
                        THEN (
                          SELECT COUNT(*)::INT
                          FROM jsonb_array_elements(hr.scores) AS e
                          WHERE e IS NOT NULL
                            AND jsonb_typeof(e) != 'null'
                            AND NOT (jsonb_typeof(e) = 'number' AND e::TEXT = '0')
                        )
                      ELSE 0
                    END AS non_null_count
                ) c
                WHERE hr.scores IS NOT NULL
                  AND c.non_null_count > 0
                  AND c.non_null_count < hr.holes_played`,
      })
      const count = Number(data?.[0]?.cnt ?? 0)
      return {
        name: 'Rondas finalizadas con hoyos faltantes',
        status: count === 0 ? 'pass' : 'warn',
        message: count === 0
          ? 'Sin anomalías'
          : `${count} historical_rounds con scores < holes_played (regresión bug 30-abr)`,
        details: { count, ref: 'Bug ronda 30-abr Juanjo — 8/9 hoyos finalizada' },
      }
    }),

    // Bug filtro índice 9h: usuarios con rondas elegibles en top-20 (por fecha)
    // que tienen datos completos (course_rating + slope_rating) pero diferencial NULL.
    // El RPC calcular_indice_golfers las excluye por WHERE diferencial IS NOT NULL,
    // pero el diferencial debió haberse calculado al importar.
    safeCheck('Índice golfers excluye rondas legítimas', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) AS cnt
                FROM (
                  SELECT id
                  FROM (
                    SELECT id,
                      ROW_NUMBER() OVER (
                        PARTITION BY user_id
                        ORDER BY played_at DESC, created_at DESC
                      ) AS rn,
                      diferencial, slope_rating, course_rating
                    FROM historical_rounds
                  ) ranked
                  WHERE rn <= 20
                    AND slope_rating IS NOT NULL
                    AND course_rating IS NOT NULL
                    AND diferencial IS NULL
                ) eligible_no_diff`,
      })
      const count = Number(data?.[0]?.cnt ?? 0)
      return {
        name: 'Índice golfers excluye rondas legítimas',
        status: count === 0 ? 'pass' : 'warn',
        message: count === 0
          ? 'Todas las rondas elegibles tienen diferencial'
          : `${count} rondas top-20 con datos completos pero diferencial NULL`,
        details: { count, ref: 'Bug filtro índice 9h pre-migration 037' },
      }
    }),

    // Anomalía estructural: ronda libre marcada finalizada pero algún jugador
    // tiene scoring JSON con menos hoyos completos que ronda.holes.
    safeCheck('Scoring state consistency (rondas finalizadas)', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) AS cnt FROM (
                  SELECT DISTINCT r.id
                  FROM rondas_libres r
                  JOIN ronda_libre_jugadores j ON j.ronda_id = r.id
                  WHERE r.estado = 'finalizada'
                    AND r.holes IS NOT NULL
                    AND j.scores IS NOT NULL
                    AND jsonb_typeof(j.scores) = 'object'
                    AND (SELECT COUNT(*) FROM jsonb_object_keys(j.scores)) < r.holes
                ) inconsistent`,
      })
      const count = Number(data?.[0]?.cnt ?? 0)
      return {
        name: 'Scoring state consistency (rondas finalizadas)',
        status: count === 0 ? 'pass' : 'warn',
        message: count === 0
          ? 'Estado finalizada consistente con scoring JSON'
          : `${count} rondas_libres finalizadas con scores < holes configurados`,
        details: { count, ref: 'Detecta bugs en flujo de finalize ronda' },
      }
    }),
  ])

  return { name: 'Anti-regresión P0', checks }
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'No tienes permisos para acceder a este recurso' }, { status: 403 })
  }

  const admin = createAdminClient()
  const start = Date.now()

  // Run all categories in parallel.
  // Performance category removida en audit 2026-05-08 (umbral teatro).
  const categories = await Promise.all([
    checkServices(admin),
    checkDataIntegrity(admin),
    checkRouteAndRoleIntegrity(admin),
    checkRLSPolicies(admin),
    checkFlows(admin),
    checkAntiRegresionP0(admin),
  ])

  const duration_ms = Date.now() - start

  // Compute summary
  const allChecks = categories.flatMap((c) => c.checks)
  const summary = {
    total: allChecks.length,
    passed: allChecks.filter((c) => c.status === 'pass').length,
    warnings: allChecks.filter((c) => c.status === 'warn').length,
    failed: allChecks.filter((c) => c.status === 'fail').length,
  }

  const result: HealthCheckResult = {
    timestamp: new Date().toISOString(),
    duration_ms,
    summary,
    categories,
  }

  return NextResponse.json(result)
}
