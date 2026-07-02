/**
 * Backfill: vincula rondas HUÉRFANAS (course_id NULL con course_name de texto) a
 * la ficha de catálogo correcta usando el matcher v2 (resolve_and_link_course con
 * género del perfil), y opcionalmente re-deriva CR/slope/diferencial aplicando el
 * tee por defecto del perfil.
 *
 * SEGURIDAD:
 *  - p_par_per_hole = NULL en el RPC → sólo VINCULA a canchas existentes, NUNCA
 *    crea user_added (eso es P1, no este backfill).
 *  - dry-run por defecto: no escribe. Pasar --apply para persistir.
 *  - --recompute-tee aplica el tee por defecto del perfil a las rondas recién
 *    vinculadas y recomputa CR/slope/diferencial (afecta el índice → opt-in).
 *
 * Uso:
 *   npx tsx scripts/backfill-link-orphan-courses.ts                  # dry-run link
 *   npx tsx scripts/backfill-link-orphan-courses.ts --apply          # aplica link
 *   npx tsx scripts/backfill-link-orphan-courses.ts --apply --recompute-tee
 */
import { createClient } from '@supabase/supabase-js'
import { applyDefaultTeeToRounds } from '@/lib/data/recompute-tee-rounds'

const APPLY = process.argv.includes('--apply')
const RECOMPUTE_TEE = process.argv.includes('--recompute-tee')

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

interface Orphan {
  id: string
  user_id: string
  course_name: string
  tee_color: string | null
}

interface Profile { genero: string | null; default_tee_color: string | null }

async function main() {
  const { data: orphansRaw } = await sb
    .from('historical_rounds')
    .select('id, user_id, course_name, tee_color')
    .is('course_id', null)
    .not('course_name', 'is', null)
  const orphans = (orphansRaw ?? []).filter(
    (r): r is Orphan => !!r.course_name && r.course_name.toLowerCase() !== 'smoke course',
  )

  const profileCache = new Map<string, Profile>()
  async function profileOf(userId: string): Promise<Profile> {
    if (!profileCache.has(userId)) {
      const { data } = await sb.from('profiles').select('genero, default_tee_color').eq('id', userId).single()
      profileCache.set(userId, { genero: data?.genero ?? null, default_tee_color: data?.default_tee_color ?? null })
    }
    return profileCache.get(userId)!
  }

  // Cache de match por (nombre, género): 1 llamada RPC por combinación única.
  const matchCache = new Map<string, { id: string | null; nombre: string | null }>()
  async function matchFor(name: string, genero: string | null) {
    const k = `${name}||${genero ?? ''}`
    if (!matchCache.has(k)) {
      const { data, error } = await sb.rpc('resolve_and_link_course', {
        p_course_name: name, p_par_per_hole: null, p_similarity_threshold: 0.6, p_genero: genero,
      })
      if (error) { matchCache.set(k, { id: null, nombre: null }) }
      else {
        const cid = (data as { course_id: string | null })?.course_id ?? null
        let nombre: string | null = null
        if (cid) {
          const { data: c } = await sb.from('courses').select('nombre').eq('id', cid).single()
          nombre = c?.nombre ?? null
        }
        matchCache.set(k, { id: cid, nombre })
      }
    }
    return matchCache.get(k)!
  }

  const byName = new Map<string, { rondas: number; genero: string | null; match: string | null; matchId: string | null }>()
  const affectedUsers = new Set<string>()
  let linked = 0
  let unmatched = 0

  for (const r of orphans) {
    const prof = await profileOf(r.user_id)
    const m = await matchFor(r.course_name, prof.genero)
    const agg = byName.get(r.course_name) ?? { rondas: 0, genero: prof.genero, match: m.nombre, matchId: m.id }
    agg.rondas++
    byName.set(r.course_name, agg)

    if (!m.id) { unmatched++; continue }
    linked++
    affectedUsers.add(r.user_id)
    if (APPLY) {
      const { error } = await sb.from('historical_rounds').update({ course_id: m.id }).eq('id', r.id)
      if (error) console.error(`  ✗ update ${r.id}: ${error.message}`)
    }
  }

  console.log(`\n=== BACKFILL VÍNCULO DE CANCHAS (${APPLY ? 'APLICAR' : 'DRY-RUN'}) ===`)
  console.log(`Huérfanas reales: ${orphans.length} | vinculables: ${linked} | sin match: ${unmatched}\n`)
  console.log('Por nombre de cancha:')
  for (const [name, a] of Array.from(byName.entries()).sort((x, y) => y[1].rondas - x[1].rondas)) {
    const flag = a.matchId ? '→' : '✗ (sin match)'
    console.log(`  ${String(a.rondas).padStart(3)}×  "${name}" [${a.genero ?? '?'}]  ${flag} ${a.match ?? ''}`)
  }

  if (RECOMPUTE_TEE) {
    console.log(`\n=== RE-DERIVAR CR/SLOPE/DIFERENCIAL (tee por defecto del perfil) ===`)
    for (const u of Array.from(affectedUsers)) {
      const prof = await profileOf(u)
      if (!prof.default_tee_color) { console.log(`  user ${u}: sin default_tee_color — se omite`); continue }
      if (!APPLY) { console.log(`  user ${u}: aplicaría tee "${prof.default_tee_color}" (dry-run, no escribe)`); continue }
      const n = await applyDefaultTeeToRounds(sb, u, prof.default_tee_color, prof.genero)
      console.log(`  user ${u}: ${n} rondas recomputadas con tee "${prof.default_tee_color}"`)
    }
  }

  console.log(APPLY ? '\n✓ Aplicado.' : '\n(dry-run — nada escrito. Usar --apply para persistir.)')
}

main().catch((e) => { console.error(e); process.exit(1) })
