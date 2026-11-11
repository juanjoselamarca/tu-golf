import type { SupabaseClient } from '@supabase/supabase-js'
import { type Category, safeCheck } from './tipos'

// ─── 4. Flow Validation ────────────────────────────────────────────────────

export async function checkFlows(admin: SupabaseClient): Promise<Category> {
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

