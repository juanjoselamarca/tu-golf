import type { SupabaseClient } from '@supabase/supabase-js'
import { type Category, type Check, safeCheck } from './tipos'

// ─── 3. Route & Role Integrity ────────────────────────────────────────────

export async function checkRouteAndRoleIntegrity(admin: SupabaseClient): Promise<Category> {
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

