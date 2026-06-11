/**
 * APPLY del dedup de canchas por cluster (ESCRIBE en prod con --apply).
 *
 * Orden idempotente y blindado (spec §7 + §11):
 *   1. Backup persistente → docs/backups/dedup-<slug>-<commit>.json
 *   2. Guardia M4: cada fedegolf a redirigir no debe tener más rondas que las
 *      contempladas (los-leones=1, resto=0). Más → ABORTA.
 *   3. Pre-check M2: ningún usuario con genero null puede tener rondas AMBIGUAS
 *      (resolver→null por género) tras la corrección. Si hay → ABORTA.
 *   4. Repointa las rondas de cada fedegolf-con-rondas → manual (verifica que su
 *      tee_color resuelva en los tees corregidos; si no, lo reporta).
 *   5. applyTeeCorrections(manual) — idempotente.
 *   6. redirectCourse(fedegolf → manual) + activa=false.
 *   7. recomputeRoundsFromCatalog(dryRun:false) + RPC por cada usuario afectado.
 *
 * Sin --apply: corre 1-3 (backup + guardias) y NO escribe nada más.
 *
 * Uso:  node --env-file=.env.local --import tsx scripts/dedup-canchas-apply.ts <slug> [--apply]
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { CLUSTERS } from './dedup-canchas-config'
import { getTeesForCourse } from '@/lib/data/course-tees'
import { planTeeCorrections } from '@/golf/courses/course-dedup'
import { applyTeeCorrections, redirectCourse, repointRounds, countRoundsForCourse } from '@/lib/data/course-dedup'
import { recomputeRoundsFromCatalog } from '@/lib/data/recompute-tee-rounds'
import { resolveRatings } from '@/golf/courses/tee-resolver'
import { correctedTees } from './dedup-canchas-helpers'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

const slug = process.argv[2]
const APPLY = process.argv.includes('--apply')
const n = (v: unknown) => (v == null ? '—' : String(v))

/** Rondas máximas esperadas por ficha fedegolf (verificado vs prod 2026-06-10). */
const MAX_EXPECTED_FEDE_ROUNDS: Record<string, number> = { 'los-leones': 1, 'la-dehesa': 0, 'lomas': 0 }

function abort(msg: string): never { console.error(`\n✗ ABORTA: ${msg}`); process.exit(1) }

async function main() {
  const c = CLUSTERS.find(x => x.slug === slug)
  if (!c) abort(`cluster desconocido: "${slug}". Opciones: ${CLUSTERS.map(x => x.slug).join(', ')}`)

  console.log(`═══════════ APPLY ${c.nombre} (${c.slug}) ${APPLY ? '— ESCRIBE' : '— solo backup+guardias'} ═══════════`)

  // 1. BACKUP persistente.
  const commit = execSync('git rev-parse --short HEAD').toString().trim()
  const backup: Record<string, unknown> = {}
  backup.courses = (await sb.from('courses').select('*').in('id', [c.manualId, ...c.fedegolfIds])).data
  backup.tees = (await sb.from('course_tees').select('*').eq('course_id', c.manualId)).data
  backup.rounds = (await sb.from('historical_rounds').select('*').in('course_id', [c.manualId, ...c.fedegolfIds])).data
  mkdirSync('docs/backups', { recursive: true })
  const path = `docs/backups/dedup-${c.slug}-${commit}.json`
  writeFileSync(path, JSON.stringify(backup, null, 2))
  console.log(`Backup → ${path}  (courses=${(backup.courses as unknown[])?.length} tees=${(backup.tees as unknown[])?.length} rounds=${(backup.rounds as unknown[])?.length})`)

  // Tees corregidos en memoria (para guardias M2/M4 antes de escribir).
  const manualTees = await getTeesForCourse(sb, c.manualId)
  const official = []
  for (const fid of c.fedegolfIds) official.push(...await getTeesForCourse(sb, fid))
  const ups = planTeeCorrections(manualTees, official)
  const corrected = correctedTees(manualTees, ups)

  // 2. GUARDIA M4: fedegolf con rondas inesperadas.
  let totalFede = 0
  for (const fid of c.fedegolfIds) {
    const cnt = await countRoundsForCourse(sb, fid)
    totalFede += cnt
    console.log(`  fedegolf ${fid.slice(0, 8)}: ${cnt} rondas`)
  }
  if (totalFede > (MAX_EXPECTED_FEDE_ROUNDS[c.slug] ?? 0)) {
    abort(`fedegolf con ${totalFede} rondas (esperado ≤ ${MAX_EXPECTED_FEDE_ROUNDS[c.slug] ?? 0}). Revisar antes de continuar.`)
  }

  // 3. PRE-CHECK M2: rondas ambiguas de usuarios con genero null.
  const { data: clusterRounds } = await sb.from('historical_rounds')
    .select('id, user_id, tee_color, holes_played, total_gross')
    .in('course_id', [c.manualId, ...c.fedegolfIds])
  const generoCache = new Map<string, string | null>()
  async function generoOf(uid: string): Promise<string | null> {
    if (!generoCache.has(uid)) {
      const { data } = await sb.from('profiles').select('genero').eq('id', uid).maybeSingle()
      generoCache.set(uid, (data?.genero as string | null) ?? null)
    }
    return generoCache.get(uid)!
  }
  const m2: string[] = []
  const huerfanas: string[] = []
  for (const r of (clusterRounds ?? []) as { id: string; user_id: string; tee_color: string | null; holes_played: number | null; total_gross: number | null }[]) {
    if (!r.tee_color) continue
    if (r.total_gross != null && r.holes_played != null && r.total_gross < 3 * r.holes_played) continue // implausible: se excluye en recompute
    const genero = await generoOf(r.user_id)
    const resolved = resolveRatings(corrected, r.tee_color, r.holes_played, genero)
    if (!resolved) {
      if (genero == null) m2.push(`${r.id} user=${r.user_id.slice(0, 8)} tee=${r.tee_color}`)
      else huerfanas.push(`${r.id} user=${r.user_id.slice(0, 8)} tee=${r.tee_color} genero=${genero}`)
    }
  }
  if (m2.length > 0) {
    console.error('\n⚠️  M2 — rondas ambiguas de usuarios con genero null:')
    for (const x of m2) console.error(`     ${x}`)
    abort('hay usuarios con genero null y rondas ambiguas. Setear su género (o excluir la ronda) antes del apply.')
  }
  if (huerfanas.length > 0) {
    console.warn('\n⚠️  Rondas con tee que NO resuelve en los tees corregidos (quedarán sin diferencial nuevo, no se pierden):')
    for (const x of huerfanas) console.warn(`     ${x}`)
  }
  console.log(`✓ Guardias OK (M4: ${totalFede} rondas fedegolf · M2: 0 ambiguas sin género · ${huerfanas.length} huérfanas-con-género).`)

  if (!APPLY) { console.log('\nSin --apply: backup + guardias hechos. NO se escribió nada más.'); return }

  // 4. REPOINT rondas de fedegolf-con-rondas → manual.
  for (const fid of c.fedegolfIds) {
    const moved = await repointRounds(sb, fid, c.manualId)
    if (moved) console.log(`  repointadas ${moved} rondas ${fid.slice(0, 8)} → manual`)
  }

  // 5. CORREGIR tees.
  const res = await applyTeeCorrections(sb, c.manualId, ups)
  console.log(`  tees: ${res.updated} updated, ${res.inserted} inserted`)

  // 6. REDIRIGIR + desactivar fedegolf.
  for (const fid of c.fedegolfIds) {
    await redirectCourse(sb, fid, c.manualId)
    console.log(`  redirigida ${fid.slice(0, 8)} → manual (activa=false)`)
  }

  // 7. RECOMPUTE + RPC por usuario afectado (todas las rondas viven en la manual).
  const { data: users } = await sb.from('historical_rounds').select('user_id').eq('course_id', c.manualId)
  const uids = Array.from(new Set((users ?? []).map(u => u.user_id as string)))
  let recomputados = 0
  for (const uid of uids) {
    const genero = await generoOf(uid)
    await recomputeRoundsFromCatalog(sb, uid, { dryRun: false, genero })
    const { error } = await sb.rpc('calcular_indice_golfers', { p_user_id: uid })
    if (error) console.error(`  RPC error user ${uid.slice(0, 8)}: ${error.message}`)
    else recomputados++
  }
  console.log(`  recomputados ${recomputados}/${uids.length} usuarios`)
  console.log('\n✓ APPLY completo.')
}

main().catch(e => { console.error(e); process.exit(1) })
