/**
 * Backfill + validación de observaciones de patrones (Ola 3 chunk 2) — runner
 * on-demand y prueba de consumo contra datos REALES.
 *
 * Computa y persiste las observaciones per-ronda del usuario, luego corre el
 * validador anti-fantasía por patrón e imprime el veredicto (N, d, R², razón).
 * Sirve de (a) backfill histórico inicial, (b) gate de demo: verifica que toda
 * la cadena observación→validación→foco funciona contra el historial real.
 *
 * Uso: npx tsx --env-file=.env.local scripts/cerebro-v3/backfill-pattern-observations.ts [userId]
 */
import { createClient } from '@supabase/supabase-js'
import { backfillPatternObservations } from '@/golf/coach/v3/pattern-runner'
import { loadObservationPairs } from '@/lib/data/pattern-observations'
import { validatePattern } from '@/golf/coach/v3/pattern-validator'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const userId = process.argv[2] || '98c5cb7a-1c0b-4a64-a773-8bd013a92317' // Juanjo (flag ON)

async function main() {
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const admin = createClient(url, key)

  console.log(`\n→ backfill de observaciones para ${userId}`)
  const res = await backfillPatternObservations(admin, userId)
  console.log(`  insertadas: ${res.inserted} · rondas escaneadas: ${res.roundsScanned} · patrones corridos: ${res.patternsRun}`)

  console.log(`\n→ veredicto del validador por patrón (sobre el diferencial WHS elegible):`)
  const pairs = await loadObservationPairs(admin, userId)
  const keys = Object.keys(pairs).sort()
  if (keys.length === 0) {
    console.log('  (sin pares elegibles — el usuario no tiene rondas 18h con diferencial)')
    return
  }
  let validos = 0
  for (const k of keys) {
    const v = validatePattern(pairs[k])
    const tag = v.valido ? 'VÁLIDO ✅' : v.razon
    const d = v.effectSize == null ? '—' : v.effectSize.toFixed(2)
    const r2 = v.r2 == null ? '—' : v.r2.toFixed(3)
    const delta = v.meanDeltaStrokes == null ? '' : ` · Δ≈${v.meanDeltaStrokes.toFixed(1)} strokes`
    console.log(`  ${k.padEnd(24)} N=${String(v.n).padStart(3)}  d=${d.padStart(6)}  R²=${r2.padStart(6)}${delta}  → ${tag}`)
    if (v.valido) validos++
  }
  console.log(`\n${validos}/${keys.length} patrones VÁLIDOS para este usuario (el resto = ruido honesto, no foco-fantasía).`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
