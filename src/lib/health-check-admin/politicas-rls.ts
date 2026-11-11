import type { SupabaseClient } from '@supabase/supabase-js'
import { type Category, safeCheck } from './tipos'

// ─── 4. RLS Policies ──────────────────────────────────────────────────────

export async function checkRLSPolicies(admin: SupabaseClient): Promise<Category> {
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

