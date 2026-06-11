/**
 * DRY-RUN (solo lectura) del dedup de canchas. NO escribe nada.
 *
 * Por cluster:
 *  1. Carga tees manual + oficiales (fedegolf), corre `planTeeCorrections` e
 *     imprime las correcciones de tee.
 *  2. Construye los tees CORREGIDOS en memoria y, para cada usuario con rondas en
 *     la ficha manual, re-deriva el diferencial de SUS rondas del cluster con esos
 *     tees corregidos (mismo `resolveRatings` + `calcularDiferencial` + guard de
 *     implausibilidad que el motor). Estima índice antes/después con la ventana
 *     del RPC (`buildIndexWindows` testeada). El número oficial lo da el RPC al aplicar.
 *  3. Lista usuarios con `genero` null cuyas rondas del cluster quedan AMBIGUAS
 *     (resolver → null por género): son las que requerirían setear género (M2).
 *
 * Uso:  node --env-file=.env.local --import tsx scripts/dedup-canchas-dry-run.ts [slug]
 */
import { createClient } from '@supabase/supabase-js'
import { CLUSTERS } from './dedup-canchas-config'
import { getTeesForCourse } from '@/lib/data/course-tees'
import { planTeeCorrections, buildIndexWindows, type IndexRound } from '@/golf/courses/course-dedup'
import { resolveRatings, type TeeRow } from '@/golf/courses/tee-resolver'
import { calcularDiferencial, calcularIndiceGolfersLocal } from '@/lib/indice-golfers'
import { correctedTees } from './dedup-canchas-helpers'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

const slug = process.argv[2]
const n = (v: unknown) => (v == null ? '—' : String(v))

interface RoundFull extends IndexRound {
  user_id: string
  course_id: string
  tee_color: string | null
  holes_played: number | null
  total_gross: number | null
}

async function main() {
  for (const c of CLUSTERS) {
    if (slug && c.slug !== slug) continue
    console.log(`\n═══════════ ${c.nombre} (${c.slug}) ═══════════`)
    const manualTees = await getTeesForCourse(sb, c.manualId)
    const official: TeeRow[] = []
    for (const fid of c.fedegolfIds) official.push(...await getTeesForCourse(sb, fid))
    const ups = planTeeCorrections(manualTees, official)

    console.log(`Manual tiene ${manualTees.length} tees · oficial aporta ${official.length} tees`)
    console.log('── Correcciones de tee (lo que haría el apply) ──')
    if (ups.length === 0) console.log('  (sin oficiales → nada que corregir)')
    for (const u of ups) {
      console.log(`  ${u.action.padEnd(6)} ${u.nombre}/${u.genero}: ${n(u.rating)}/${n(u.slope)} ` +
        `(front ${n(u.front_course_rating)}/${n(u.front_slope_rating)})` +
        (u.action === 'update' ? `  [manual: "${u.manualNombre}"]` : ''))
    }

    const corrected = correctedTees(manualTees, ups)

    // Todas las rondas de la manual + las fedegolf (que el apply repointará a la
    // manual). Incluir las fedegolf hace que la tabla de impacto modele EXACTO lo
    // que ejecuta el apply (finding 1 del code-review).
    const { data: clusterRounds } = await sb.from('historical_rounds')
      .select('id, user_id, course_id, tee_color, holes_played, total_gross, diferencial, course_rating, slope_rating, excluded_from_handicap, played_at')
      .in('course_id', [c.manualId, ...c.fedegolfIds])
    const byUser = new Map<string, RoundFull[]>()
    for (const r of (clusterRounds ?? []) as RoundFull[]) {
      const arr = byUser.get(r.user_id) ?? []
      arr.push(r); byUser.set(r.user_id, arr)
    }

    console.log(`\n── Impacto por usuario (${byUser.size} usuarios con rondas) ──`)
    console.log('user | genero | idx antes → después | delta | rondas cluster (resueltas/total) | ambiguas-sin-genero')
    const generoNullAmbiguo: { uid: string; rounds: string[] }[] = []

    for (const [uid, clusterRs] of Array.from(byUser)) {
      const { data: prof } = await sb.from('profiles').select('genero, indice_golfers').eq('id', uid).maybeSingle()
      const genero = (prof?.genero as string | null) ?? null

      // Diferenciales corregidos para las rondas del cluster CON tee.
      const correctedDiffById = new Map<string, number | null>()
      let resueltas = 0, conTee = 0
      const ambiguas: string[] = []
      for (const r of clusterRs) {
        if (!r.tee_color) continue // sin tee → el recompute no la toca (queda igual)
        conTee++
        // Guard de implausibilidad (idéntico al motor).
        if (r.total_gross != null && r.holes_played != null && r.total_gross < 3 * r.holes_played) {
          correctedDiffById.set(r.id, null); continue
        }
        const resolved = resolveRatings(corrected, r.tee_color, r.holes_played, genero)
        if (!resolved) {
          correctedDiffById.set(r.id, null)
          if (genero == null) ambiguas.push(`${r.id} (${r.tee_color})`)
          continue
        }
        resueltas++
        const diff = r.total_gross != null
          ? calcularDiferencial(r.total_gross, resolved.cr, resolved.slope, r.holes_played, resolved.nineHoleRatings)
          : null
        correctedDiffById.set(r.id, diff)
      }

      // Ventana de índice sobre TODAS las rondas del usuario.
      const { data: allRounds } = await sb.from('historical_rounds')
        .select('id, played_at, diferencial, course_rating, slope_rating, excluded_from_handicap')
        .eq('user_id', uid)
      const windows = buildIndexWindows((allRounds ?? []) as IndexRound[], correctedDiffById)
      const idxAntes = calcularIndiceGolfersLocal(windows.antes)
      const idxDespues = calcularIndiceGolfersLocal(windows.despues)
      const delta = (idxAntes != null && idxDespues != null) ? (idxDespues - idxAntes).toFixed(2) : '—'

      console.log(`  ${uid.slice(0, 8)} | ${n(genero).padEnd(4)} | ${n(idxAntes)} → ${n(idxDespues)} | Δ ${delta} | ${resueltas}/${conTee} con tee (${clusterRs.length} total) | ${ambiguas.length}`)
      if (genero == null && ambiguas.length > 0) generoNullAmbiguo.push({ uid, rounds: ambiguas })
    }

    if (generoNullAmbiguo.length > 0) {
      console.log('\n  ⚠️  M2 — usuarios con genero null y rondas AMBIGUAS (requieren setear género antes del apply):')
      for (const g of generoNullAmbiguo) console.log(`     ${g.uid}: ${g.rounds.join(', ')}`)
    } else {
      console.log('\n  ✓ M2 OK: ningún usuario con genero null tiene rondas ambiguas en este cluster.')
    }
  }
  console.log('\n══════════════════════════════════════')
  console.log('NADA fue escrito. Este es un DRY-RUN.')
}

main().catch(e => { console.error(e); process.exit(1) })
