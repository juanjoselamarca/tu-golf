/**
 * Barrido B — re-derivar el índice de Juanjo desde course_tees (REPORTE / WRITE).
 *
 * Por defecto REPORTE (read-only): recalcula el diferencial de cada ronda usando
 * el MISMO código que el import en vivo (tee-resolver + calcularDiferencial
 * canónico), muestra viejo→nuevo por ronda y el índice antes/después.
 *
 * Con `--apply`: escribe course_rating/slope_rating/diferencial nuevos +
 * excluded_from_handicap en las rondas irresolubles/corruptas, hace backup, y
 * re-corre el RPC calcular_indice_golfers. NO se corre sin OK de Juanjo.
 *
 * Uso (desde el worktree, con el tsx del repo principal):
 *   node --env-file=.env.local <repo>/node_modules/tsx/dist/cli.mjs \
 *     scripts/barrido-reindex-juanjo.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js'
import { resolveRatings, type TeeRow } from '@/golf/courses/tee-resolver'
import { calcularDiferencial } from '@/lib/indice-golfers'

const JUANJO = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const APPLY = process.argv.includes('--apply')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hoswfwhvcgqlqdmzpnce.supabase.co'
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!key) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(url, key)

interface Round {
  id: string
  played_at: string
  course_name: string | null
  course_id: string | null
  tee_color: string | null
  holes_played: number | null
  total_gross: number | null
  course_rating: number | null
  slope_rating: number | null
  diferencial: number | null
}

// Réplica de la ventana del RPC: últimas 20 por fecha (con dif/CR/slope no-null,
// no excluidas) → mejores k → ×0.96.
function indiceFromPool(difs: number[]): number | null {
  const last20 = difs.slice(0, 20)
  const n = last20.length
  if (n < 3) return null
  const usar = n <= 6 ? 1 : n <= 8 ? 2 : n <= 11 ? 3 : n <= 14 ? 4 : n <= 16 ? 5 : n === 17 ? 6 : n <= 19 ? 7 : 8
  const best = [...last20].sort((a, b) => a - b).slice(0, usar)
  return Math.round((best.reduce((a, b) => a + b, 0) / best.length) * 0.96 * 10) / 10
}

async function main() {
  const { data: rounds, error } = await sb
    .from('historical_rounds')
    .select('id, played_at, course_name, course_id, tee_color, holes_played, total_gross, course_rating, slope_rating, diferencial')
    .eq('user_id', JUANJO)
    .not('diferencial', 'is', null)
    .order('played_at', { ascending: false })
  if (error) { console.error(error); process.exit(1) }
  const rs = (rounds || []) as Round[]

  // Cache de tees por course_id.
  const teeCache = new Map<string, TeeRow[]>()
  async function getTees(cid: string): Promise<TeeRow[]> {
    if (teeCache.has(cid)) return teeCache.get(cid)!
    const { data } = await sb.from('course_tees')
      .select('nombre, genero, rating, slope, front_course_rating, front_slope_rating, back_course_rating, back_slope_rating')
      .eq('course_id', cid)
    const t = (data as TeeRow[] | null) ?? []
    teeCache.set(cid, t)
    return t
  }

  const rows: Array<Round & { newCr: number | null; newSlope: number | null; newDif: number | null; resolvable: boolean }> = []
  for (const r of rs) {
    let newCr: number | null = null, newSlope: number | null = null, newDif: number | null = null, resolvable = false
    if (r.course_id && r.tee_color) {
      const tees = await getTees(r.course_id)
      const resolved = resolveRatings(tees, r.tee_color, r.holes_played)
      if (resolved) {
        resolvable = true
        newCr = resolved.cr; newSlope = resolved.slope
        newDif = calcularDiferencial(r.total_gross ?? 0, resolved.cr, resolved.slope, r.holes_played, resolved.nineHoleRatings)
      }
    }
    rows.push({ ...r, newCr, newSlope, newDif, resolvable })
  }

  // Índice ANTES (diferenciales guardados) vs DESPUÉS (newDif donde se resolvió,
  // viejo donde no). Las rondas resueltas usan su nuevo dif; las no-resueltas
  // mantienen el guardado (no se inventa).
  const oldDifs = rs.map(r => r.diferencial!).filter(d => d != null)
  const newDifs = rows.map(r => (r.resolvable && r.newDif != null) ? r.newDif : r.diferencial!).filter(d => d != null)
  const idxBefore = indiceFromPool(oldDifs)
  const idxAfter = indiceFromPool(newDifs)

  console.log('\n=== BARRIDO B — re-derivación del índice de Juanjo (REPORTE read-only) ===\n')
  console.log('fecha       h  gross  tee      CRviejo dfViejo   CRnuevo dfNuevo   estado')
  for (const r of rows.slice(0, 25)) {
    const f = r.played_at.slice(0, 10)
    const tee = (r.tee_color ?? '—').padEnd(7).slice(0, 7)
    const cv = (r.course_rating ?? 0).toFixed(1).padStart(6)
    const dv = (r.diferencial ?? 0).toFixed(2).padStart(7)
    const cn = r.resolvable ? r.newCr!.toFixed(1).padStart(6) : '   —  '
    const dn = r.resolvable && r.newDif != null ? r.newDif.toFixed(2).padStart(7) : '   —   '
    const est = !r.course_id ? 'sin course_id' : !r.tee_color ? 'sin tee' : !r.resolvable ? 'tee no resuelve' : (Math.abs((r.newDif ?? 0) - (r.diferencial ?? 0)) >= 0.5 ? 'CAMBIA' : 'ok')
    console.log(`${f}  ${String(r.holes_played ?? '?').padStart(2)}  ${String(r.total_gross ?? '?').padStart(4)}   ${tee}  ${cv}  ${dv}    ${cn}  ${dn}   ${est}`)
  }
  const resueltas = rows.filter(r => r.resolvable).length
  const noResuelve = rows.filter(r => r.course_id && r.tee_color && !r.resolvable).length
  const sinDatos = rows.filter(r => !r.course_id || !r.tee_color).length
  console.log(`\nRondas: ${rows.length} con diferencial | ${resueltas} re-derivables | ${noResuelve} tee no resuelve | ${sinDatos} sin course_id/tee`)
  console.log(`\nÍNDICE (indice_golfers):  ANTES ${idxBefore}  →  DESPUÉS ${idxAfter}`)
  console.log(`(ventana últimas-20 por fecha, mejores-k × 0.96 — misma fórmula del RPC)\n`)

  if (!APPLY) {
    console.log('REPORTE only. Nada escrito. Con --apply (y OK de Juanjo) se escribe + backup + RPC.')
    return
  }
  console.log('--apply recibido: (write deshabilitado en este commit hasta OK explícito).')
}

main().catch(e => { console.error(e); process.exit(1) })
