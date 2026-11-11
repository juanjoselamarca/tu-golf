import type { SupabaseClient } from '@supabase/supabase-js'
import { type Category, safeCheck, timed } from './tipos'

// ─── 1. Services ────────────────────────────────────────────────────────────

export async function checkServices(admin: SupabaseClient): Promise<Category> {
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

