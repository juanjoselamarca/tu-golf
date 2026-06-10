/**
 * APLICA el fix del índice para un usuario (ESCRIBE en prod). Correr SOLO tras
 * backup + aprobación del dry-run.
 *
 *   1. Excluye del handicap las rondas con score imposible (data corrupta).
 *   2. recomputeRoundsFromCatalog(dryRun:false): re-deriva CR/slope/diferencial.
 *   3. RPC calcular_indice_golfers: recalcula el índice oficial.
 *   4. Verifica: rondas mismo-score consistentes + índice antes/después.
 *
 * Uso: npx tsx scripts/apply-recompute-indice.ts [userId] [genero]
 */
import { createClient } from '@supabase/supabase-js'
import { recomputeRoundsFromCatalog } from '@/lib/data/recompute-tee-rounds'

const USER_ID = process.argv[2] || '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const GENERO = (process.argv[3] as string | undefined) ?? null
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const n = (v: unknown) => (v == null ? '—' : String(v))

async function main() {
  const before = await sb.from('profiles').select('genero, indice, indice_golfers').eq('id', USER_ID).single()
  const genero = GENERO ?? before.data?.genero ?? null
  console.log(`indice_golfers ANTES: ${n(before.data?.indice_golfers)}`)

  // 1. Excluir rondas con score físicamente imposible (< 3 golpes/hoyo).
  const { data: bad } = await sb
    .from('historical_rounds')
    .select('id, total_gross, holes_played')
    .eq('user_id', USER_ID)
    .not('total_gross', 'is', null)
    .not('holes_played', 'is', null)
    .eq('excluded_from_handicap', false)
  const impossibles = (bad ?? []).filter(r => r.total_gross < 3 * r.holes_played)
  for (const r of impossibles) {
    await sb.from('historical_rounds').update({ excluded_from_handicap: true }).eq('id', r.id)
    console.log(`  excluida del handicap (score imposible): ${r.id} (${r.total_gross} en ${r.holes_played}h)`)
  }

  // 2. Recompute real.
  const res = await recomputeRoundsFromCatalog(sb, USER_ID, { dryRun: false, genero })
  console.log(`recompute: escaneadas=${res.scanned} resueltas=${res.resolved} cambiaron=${res.changedCount} implausible=${res.implausible.length} unresolved=${res.unresolved.length} applied=${res.applied}`)

  // 3. Índice oficial.
  const { error: rpcErr } = await sb.rpc('calcular_indice_golfers', { p_user_id: USER_ID })
  if (rpcErr) { console.error('RPC error:', rpcErr); process.exit(1) }

  // 4. Verificación.
  const after = await sb.from('profiles').select('indice_golfers').eq('id', USER_ID).single()
  console.log(`indice_golfers DESPUÉS: ${n(after.data?.indice_golfers)}`)

  const { data: l38 } = await sb
    .from('historical_rounds')
    .select('id, played_at, total_gross, holes_played, tee_color, course_rating, slope_rating, diferencial')
    .eq('user_id', USER_ID)
    .eq('total_gross', 38)
    .eq('holes_played', 9)
    .order('played_at')
  console.log('\nVerificación — rondas 9h score 38 (deben tener TODAS el mismo diferencial):')
  for (const r of l38 ?? []) {
    console.log(`  ${r.played_at} ${r.tee_color} ${n(r.course_rating)}/${n(r.slope_rating)} → dif ${n(r.diferencial)}`)
  }
  const difs = new Set((l38 ?? []).map(r => Number(r.diferencial)))
  console.log(`  → diferenciales distintos: ${difs.size} ${difs.size === 1 ? '✓ CONSISTENTE' : '✗ AÚN INCONSISTENTE'}`)
}

main().catch(e => { console.error(e); process.exit(1) })
