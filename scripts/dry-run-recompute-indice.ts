/**
 * DRY-RUN (solo lectura) del recompute de diferenciales desde el catálogo.
 *
 * Llama a `recomputeRoundsFromCatalog` con dryRun:true contra la BD real y
 * muestra, ronda por ronda, qué CR/slope/diferencial cambiarían. Estima el
 * índice resultante con la fórmula local (ventana últimas-20) — el número
 * oficial lo confirma el RPC al aplicar. NO escribe nada.
 *
 * Uso:  npx tsx scripts/dry-run-recompute-indice.ts [userId] [genero]
 *   userId default = Juanjo (98c5cb7a…). genero opcional ('M'|'F').
 */
import { createClient } from '@supabase/supabase-js'
import { recomputeRoundsFromCatalog, type RecomputedRound } from '@/lib/data/recompute-tee-rounds'
import { computeGolfersIndex } from '@/golf/core/whs-index'
import { indexWindowDifferentials, INDEX_WINDOW_COLUMNS } from '@/golf/core/index-window'

const USER_ID = process.argv[2] || '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const GENERO = (process.argv[3] as string | undefined) ?? null

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

function n(v: unknown): string {
  return v == null ? '—' : String(v)
}

async function indiceEstimado(
  afterById: Map<string, RecomputedRound['after']>,
): Promise<{ antes: number | null; despues: number | null; usadas: number }> {
  // "despues" uses the recomputed ratings and diferencial when present;
  // "antes", the stored ones. Impossible scores enter neither (`indexWindow`).
  const { data } = await sb
    .from('historical_rounds')
    .select(INDEX_WINDOW_COLUMNS)
    .eq('user_id', USER_ID)
    .order('played_at', { ascending: false })
  if (!data) return { antes: null, despues: null, usadas: 0 }

  const difDespues = indexWindowDifferentials(data.map(r => ({ ...r, ...afterById.get(r.id) })))
  return {
    antes: computeGolfersIndex(indexWindowDifferentials(data)),
    despues: computeGolfersIndex(difDespues),
    usadas: difDespues.length,
  }
}

async function main() {
  const { data: prof } = await sb
    .from('profiles')
    .select('genero, indice, indice_golfers, default_tee_color')
    .eq('id', USER_ID)
    .single()
  const genero = GENERO ?? prof?.genero ?? null

  console.log('═══ DRY-RUN recompute de diferenciales (solo lectura) ═══')
  console.log(`user: ${USER_ID}`)
  console.log(`genero usado para resolver: ${n(genero)} (perfil: ${n(prof?.genero)})`)
  console.log(`indice_golfers actual (BD): ${n(prof?.indice_golfers)} · indice fed: ${n(prof?.indice)}`)
  console.log('')

  const result = await recomputeRoundsFromCatalog(sb, USER_ID, { dryRun: true, genero })

  // Nombres de cancha para la tabla.
  const courseIds = Array.from(new Set(result.rounds.map(r => r.course_id)))
  const { data: cs } = await sb.from('courses').select('id, nombre').in('id', courseIds)
  const nameById = new Map((cs ?? []).map(c => [c.id, c.nombre as string]))

  const cambian = result.rounds.filter(r => r.changed)
  const difCambian = result.rounds.filter(r => r.before.diferencial !== r.after.diferencial)

  console.log(`Escaneadas (con tee + cancha): ${result.scanned}`)
  console.log(`Resueltas por catálogo:        ${result.resolved}`)
  console.log(`Sin match (no se tocan):       ${result.unresolved.length}`)
  console.log(`Score imposible (data error):  ${result.implausible.length}  ← NO se recomputan`)
  console.log(`Cambian algún campo:           ${cambian.length}`)
  console.log(`Cambian el DIFERENCIAL:        ${difCambian.length}  ← lo que afecta el índice`)
  console.log('')

  console.log('── Rondas cuyo DIFERENCIAL cambia ──')
  console.log('cancha | hoyos | score | tee | dif: antes → después | (CR/slope: antes → después)')
  for (const r of difCambian) {
    const cancha = (nameById.get(r.course_id) ?? r.course_id).slice(0, 24)
    console.log(
      `${cancha} | ${n(r.holes_played)}h | ${n(r.total_gross)} | ${r.tee_color} | ` +
      `${n(r.before.diferencial)} → ${n(r.after.diferencial)}  ` +
      `(${n(r.before.course_rating)}/${n(r.before.slope_rating)} → ${n(r.after.course_rating)}/${n(r.after.slope_rating)})`,
    )
  }

  if (result.unresolved.length > 0) {
    console.log('')
    console.log('── Sin match en catálogo (quedan igual; típicamente sin género o color ambiguo) ──')
    for (const u of result.unresolved.slice(0, 30)) console.log(`  ${u.id}  tee=${u.tee_color}`)
    if (result.unresolved.length > 30) console.log(`  … y ${result.unresolved.length - 30} más`)
  }

  if (result.implausible.length > 0) {
    console.log('')
    console.log('── Score físicamente imposible (data corrupta; quedan intactas, a revisar) ──')
    for (const im of result.implausible) {
      console.log(`  ${im.id}  ${n(im.total_gross)} en ${n(im.holes_played)}h  tee=${im.tee_color}`)
    }
  }

  const afterById = new Map(result.rounds.map(r => [r.id, r.after]))
  const idx = await indiceEstimado(afterById)
  console.log('')
  console.log('── Índice estimado (fórmula local, ventana últimas-20; oficial = RPC al aplicar) ──')
  console.log(`  antes:   ${n(idx.antes)}`)
  console.log(`  después: ${n(idx.despues)}   (sobre ${idx.usadas} rondas con diferencial)`)
  console.log('')
  console.log('NADA fue escrito. Este es un dry-run.')
}

main().catch(e => { console.error(e); process.exit(1) })
