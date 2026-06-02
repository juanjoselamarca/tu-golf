/**
 * Validación del motor de foco (Ola 2) contra datos REALES.
 * Corre getFocus para el/los usuarios con cerebro_v3_enabled y para 5 perfiles
 * sintéticos del banco, e imprime el foco/fallback con su justificación.
 *
 * Uso: npx tsx --env-file=.env.local scripts/cerebro-v3/validate-focus.ts
 */
import { createClient } from '@supabase/supabase-js'
import { selectFocus } from '@/golf/coach/v3/focus/select-focus'
import { loadFocusRounds, loadFocusTarget } from '@/lib/data/focus'
import { getAllWeights } from '@/lib/cerebro/weights'
import type { RoundData } from '@/golf/coach/metrics'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

function line(s: string) {
  process.stdout.write(s + '\n')
}

function describeResult(label: string, r: ReturnType<typeof selectFocus>, nRounds: number) {
  line(`\n=== ${label} (${nRounds} rondas) ===`)
  if (r.kind === 'fallback') {
    line(`  FALLBACK honesto → ${r.reason} | handicap=${r.handicap ?? '—'} | deltaVsTarget=${r.deltaVsTarget ?? '—'}`)
    return
  }
  line(`  FOCO → ${r.patternId} (${r.label})`)
  line(`  impacto=${r.impacto}  confianza=${r.confianza}  peso=${r.peso}`)
  line(`  métrica ${r.metrica.key} = ${r.metrica.valor} (muestra ${r.metrica.muestra})`)
  line(`  deltaVsTarget=${r.deltaVsTarget ?? '—'}`)
  line(`  evidencia: ${JSON.stringify(r.evidencia)}`)
  line(`  acción: ${r.accion}`)
}

// ── Perfiles sintéticos (banco) ──────────────────────────────────────────────
const STD = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5]
function mk(id: string, scores: (number | null)[]): RoundData {
  const parObj: Record<string, number> = {}
  STD.forEach((p, i) => (parObj[String(i + 1)] = p))
  return {
    id,
    scores,
    total_gross: scores.reduce<number>((a, s) => a + (typeof s === 'number' ? s : 0), 0),
    par_per_hole: parObj,
    played_at: '2026-05-01T12:00:00Z',
    metadata: null,
  }
}
const PROFILES: Array<{ name: string; rounds: RoundData[]; hcp: number; target: number }> = [
  {
    name: 'P1 cold-start (2 rondas)',
    rounds: [mk('p1a', STD.map((p) => p + 1)), mk('p1b', STD.map((p) => p + 1))],
    hcp: 28,
    target: 20,
  },
  {
    name: 'P2 espiral post-bogey',
    rounds: [1, 2, 3, 4].map((n) => mk(`p2-${n}`, STD.map((p, i) => (i % 4 < 2 ? p + 1 : p)))),
    hcp: 22,
    target: 16,
  },
  {
    name: 'P3 caída back-nine',
    rounds: [1, 2, 3, 4].map((n) => mk(`p3-${n}`, STD.map((p, i) => (i >= 9 ? p + 2 : p)))),
    hcp: 18,
    target: 12,
  },
  {
    name: 'P4 sólido (sin patrón)',
    rounds: [1, 2, 3, 4].map((n) => mk(`p4-${n}`, STD.map((p) => p))),
    hcp: 8,
    target: 5,
  },
  {
    name: 'P5 par-3 débil',
    rounds: [1, 2, 3, 4].map((n) => mk(`p5-${n}`, STD.map((p) => (p === 3 ? p + 2 : p)))),
    hcp: 16,
    target: 10,
  },
]

async function main() {
  const weights = await getAllWeights()
  line(`cerebro_weights cargados: ${weights.length} (pattern=${weights.filter((w) => w.parameter_type === 'pattern').length})`)

  for (const prof of PROFILES) {
    const r = selectFocus({
      rounds: prof.rounds,
      weights,
      target: { currentHandicap: prof.hcp, targetHandicap: prof.target, targetDeadline: null },
    })
    describeResult(prof.name, r, prof.rounds.length)
  }

  // ── Usuarios reales con el flag v3 ─────────────────────────────────────────
  const { data: users, error } = await supabase
    .from('profiles')
    .select('id, name, indice')
    .eq('cerebro_v3_enabled', true)
  if (error) {
    line(`\n[!] No se pudieron leer usuarios v3: ${error.message}`)
    return
  }
  line(`\nUsuarios con cerebro_v3_enabled: ${users?.length ?? 0}`)
  for (const u of users ?? []) {
    const [rounds, target] = await Promise.all([
      loadFocusRounds(supabase, u.id),
      loadFocusTarget(supabase, u.id),
    ])
    const r = selectFocus({ rounds, weights, target })
    describeResult(`REAL ${u.name ?? u.id} (hcp ${target.currentHandicap ?? '—'} → ${target.targetHandicap ?? 'sin meta'})`, r, rounds.length)
  }
}

main().catch((e) => {
  line(`ERROR: ${e instanceof Error ? e.stack : String(e)}`)
  process.exit(1)
})
