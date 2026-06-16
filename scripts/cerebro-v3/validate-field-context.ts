/**
 * Banco de Ola 1b — valida field_context (3 capas de priors externos) y el gate
 * benchmarkVerified contra datos REALES en prod, SIN gastar créditos LLM (llama
 * las funciones del tool directo, no por el modelo).
 *
 * Corre para:
 *  - Juanjo (cerebro_v3_enabled, índice real) → ranking poblacional real.
 *  - 5 índices sintéticos del banco (scratch → alto) → percentil monótono.
 *
 * Uso: npx tsx --env-file=.env.local scripts/cerebro-v3/validate-field-context.ts
 */
import { createClient } from '@supabase/supabase-js'
import {
  defaultFieldContextDeps,
  fieldContext,
} from '@/golf/coach/v3/tools/field-context-tool'
import { getPopulationPercentile, getCourseNorm } from '@/golf/coach/v3/priors/readers'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

const JUANJO = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'

function line(s: string) {
  process.stdout.write(s + '\n')
}

async function main() {
  line('═══════════════════════════════════════════════════════════════')
  line('BANCO OLA 1b — field_context + priors externos (datos reales prod)')
  line('═══════════════════════════════════════════════════════════════')

  // ── 1) Capa B: percentil poblacional monótono sobre índices sintéticos ──
  line('\n[Capa B] Ranking poblacional (USGA real) — debe ser monótono decreciente:')
  let prev = 101
  let monotono = true
  for (const idx of [1, 5, 10, 14, 18, 24, 32]) {
    const pct = await getPopulationPercentile(supabase, idx)
    if (pct == null) {
      line(`  índice ${idx} → SIN DATA (capa B vacía)`)
      monotono = false
      continue
    }
    line(`  índice ${idx} → mejor que ${pct}% de los golfistas`)
    if (pct > prev) monotono = false
    prev = pct
  }
  line(`  → monotonía: ${monotono ? 'OK ✅' : 'FALLA ❌'}`)

  // ── 2) Capa C: banda de referencia para par 72 ──
  line('\n[Capa C] Banda de dificultad de referencia (WHS):')
  const band = await getCourseNorm(supabase, 72)
  line(`  par 72 → ${band ? `slope ${band.slope_rating} / CR ${band.course_rating}` : 'SIN BANDA ❌'}`)

  // ── 3) field_context end-to-end para Juanjo (real) ──
  line('\n[E2E] field_context para Juanjo (índice real, cancha reciente real):')
  const deps = defaultFieldContextDeps(supabase)
  const res = await fieldContext({ supabase, userId: JUANJO }, { metric_key: 'par3_avg_vs_par' }, deps)
  if (!res.ok) {
    line(`  ERROR: ${res.error}`)
  } else {
    const d = res.data
    line(`  métrica: ${d.metrica}`)
    line(`  vs_handicap: ${JSON.stringify(d.vs_handicap)}`)
    line(`  ranking_poblacional: ${JSON.stringify(d.ranking_poblacional)}`)
    line(`  dificultad_cancha: ${JSON.stringify(d.dificultad_cancha)}`)
    // Gate CERO FALLOS: par3 provisional ⇒ capa A NO disponible (no número inventado).
    const gateOk = d.vs_handicap.disponible === false
    line(`  → gate benchmarkVerified (capa A no expone provisional): ${gateOk ? 'OK ✅' : 'FALLA ❌'}`)
  }

  line('\n═══════════════════════════════════════════════════════════════')
  line(monotono ? 'BANCO 1b: capas verificadas vivas y coherentes ✅' : 'BANCO 1b: revisar ❌')
  line('═══════════════════════════════════════════════════════════════')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
