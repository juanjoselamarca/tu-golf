/**
 * Script one-shot: recalcular patrones para todos los usuarios.
 *
 * Necesario despues del fix del bug `.limit(50)` en detect-and-save-patterns
 * (Sprint 1 / Commit 3) — confidence quedo capeada artificialmente para
 * usuarios con >50 rondas. Este script los recalcula con el 100% de la data.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx/esm scripts/recalculate-all-patterns.ts
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY (bypass RLS para iterar sobre todos los users).
 */

import { createClient } from '@supabase/supabase-js'
import { detectAndSavePatterns } from '../src/golf/coach/detect-and-save-patterns'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function main() {
  console.log('→ Buscando usuarios con rondas históricas...')

  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, name')
    .not('id', 'is', null)

  if (error) {
    console.error('Error fetching users:', error.message)
    process.exit(1)
  }

  console.log(`→ ${users?.length ?? 0} usuarios encontrados.`)

  let totalDetected = 0
  let totalUsers = 0
  let totalErrors = 0

  for (const u of users ?? []) {
    try {
      const result = await detectAndSavePatterns(supabase, u.id)
      if (result.total_rounds > 0) {
        totalUsers++
        totalDetected += result.detected
        if (result.detected > 0) {
          console.log(`  ✓ ${u.name ?? u.id}: ${result.detected} patrones (${result.total_rounds} rondas)`)
        }
      }
    } catch (e) {
      totalErrors++
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`  ✗ ${u.name ?? u.id}: ${msg}`)
    }
  }

  console.log('\n→ Resumen:')
  console.log(`   Usuarios con rondas: ${totalUsers}`)
  console.log(`   Patrones detectados (total): ${totalDetected}`)
  console.log(`   Errores: ${totalErrors}`)
}

main().then(() => process.exit(0)).catch(e => {
  console.error('Fatal:', e)
  process.exit(1)
})
