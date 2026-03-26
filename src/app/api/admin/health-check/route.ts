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

    // Recent role changes
    safeCheck('Cambios de role recientes', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT user_id, metadata, created_at
                FROM analytics_events
                WHERE event_type = 'role_changed'
                AND created_at > NOW() - INTERVAL '24 hours'
                ORDER BY created_at DESC
                LIMIT 20`,
      })
      const rows = (data ?? []) as Array<{ user_id: string; metadata: unknown; created_at: string }>
      return {
        name: 'Cambios de role recientes',
        status: rows.length > 0 ? 'warn' : 'pass',
        message: rows.length > 0
          ? `${rows.length} cambio(s) de rol en las ultimas 24h`
          : 'Sin cambios de rol en 24h',
        details: rows.length > 0 ? { changes: rows } : undefined,
      }
    }),

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

    // Navbar admin link visibility
    safeCheck('Navbar admin link visible', async () => {
      const { data } = await admin.rpc('exec_sql', {
        query: `SELECT COUNT(*) as cnt FROM profiles WHERE role = 'admin'`,
      })
      const count = Number(data?.[0]?.cnt ?? 0)
      return {
        name: 'Navbar admin link visible',
        status: count > 0 ? 'pass' : 'fail',
        message: count > 0
          ? `${count} usuario(s) pueden ver el link de admin`
          : 'Nadie puede acceder al panel admin',
        details: { admin_count: count },
      }
    }),
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

// ─── 5. Performance ────────────────────────────────────────────────────────

async function checkPerformance(admin: SupabaseClient): Promise<Category> {
  const tables = ['profiles', 'rondas_libres', 'analytics_events'] as const

  const checks = await Promise.all(
    tables.map((table) =>
      safeCheck(`Tiempo query ${table}`, async () => {
        const { ms } = await timed(async () =>
          admin.from(table).select('*', { count: 'exact', head: true })
        )
        return {
          name: `Tiempo query ${table}`,
          status: ms < 2000 ? 'pass' : 'warn',
          message: `${ms}ms`,
          duration_ms: ms,
        }
      })
    )
  )

  return { name: 'Performance', checks }
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!(await isAdmin(user?.id, supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const admin = createAdminClient()
  const start = Date.now()

  // Run all categories in parallel
  const categories = await Promise.all([
    checkServices(admin),
    checkDataIntegrity(admin),
    checkRouteAndRoleIntegrity(admin),
    checkRLSPolicies(admin),
    checkFlows(admin),
    checkPerformance(admin),
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
