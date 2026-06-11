/**
 * Barrido de RONDAS exacto-duplicadas (spec §5 — "barrido aparte", su propio gate).
 *
 * Detecta rondas idénticas (mismo user_id, course_id, played_at, holes_played,
 * total_gross) — típico de un import doble — y borra todas menos la más antigua
 * por `created_at` de cada grupo. Luego recomputa el índice de los usuarios
 * afectados (un duplicado en el best-8 cuenta doble y hunde el índice).
 *
 * Sin --apply: dry-run read-only (lista qué borraría). NO escribe.
 * Con --apply: backup persistente → borra → recompute + RPC por usuario.
 *
 * Uso:  node --env-file=.env.local --import tsx scripts/dedup-rondas-duplicadas.ts [--apply]
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { findDuplicateRounds, type DupRound } from '@/golf/courses/course-dedup'
import { deleteRounds } from '@/lib/data/course-dedup'
import { recomputeRoundsFromCatalog } from '@/lib/data/recompute-tee-rounds'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(url, key, { auth: { persistSession: false } })

const APPLY = process.argv.includes('--apply')
const n = (v: unknown) => (v == null ? '—' : String(v))

async function main() {
  console.log(`═══ Barrido de rondas duplicadas ${APPLY ? '— ESCRIBE' : '— DRY-RUN (read-only)'} ═══`)
  // Traer todas las rondas (campos de la clave + created_at + detalle para mostrar).
  const { data, error } = await sb
    .from('historical_rounds')
    .select('id, user_id, course_id, played_at, holes_played, total_gross, created_at, tee_color, diferencial, excluded_from_handicap')
    .order('created_at', { ascending: true })
  if (error) { console.error('select falló:', error.message); process.exit(1) }
  const rounds = (data ?? []) as (DupRound & { tee_color: string | null; diferencial: number | null; excluded_from_handicap: boolean })[]

  const toDelete = new Set(findDuplicateRounds(rounds))
  if (toDelete.size === 0) { console.log('No hay rondas duplicadas. Nada que hacer.'); return }

  // Agrupar para mostrar cada grupo (conserva más antigua, borra el resto).
  const byKey = new Map<string, typeof rounds>()
  for (const r of rounds) {
    const k = `${r.user_id}|${r.played_at}|${r.holes_played}|${r.total_gross}|${r.course_id}`
    const arr = byKey.get(k) ?? []; arr.push(r); byKey.set(k, arr)
  }
  const courseIds = Array.from(new Set(rounds.filter(r => toDelete.has(r.id)).map(r => r.course_id)))
  const { data: cs } = await sb.from('courses').select('id, nombre').in('id', courseIds)
  const nameById = new Map((cs ?? []).map(c => [c.id, c.nombre as string]))

  const affectedUsers = new Set<string>()
  console.log(`\nGrupos duplicados (conserva la más antigua por created_at):`)
  for (const arr of Array.from(byKey.values())) {
    if (arr.length < 2) continue
    const sorted = [...arr].sort((a, b) => a.created_at.localeCompare(b.created_at))
    const keep = sorted[0]; const del = sorted.slice(1)
    affectedUsers.add(keep.user_id)
    console.log(`\n  ${(nameById.get(keep.course_id) ?? keep.course_id).slice(0, 28)} · ${keep.played_at} · ${n(keep.holes_played)}h · ${n(keep.total_gross)} golpes · user ${keep.user_id.slice(0, 8)}`)
    console.log(`    CONSERVA ${keep.id.slice(0, 8)} (created ${keep.created_at}) tee=${n(keep.tee_color)} dif=${n(keep.diferencial)}${keep.excluded_from_handicap ? ' [excluida]' : ''}`)
    for (const d of del) console.log(`    BORRA    ${d.id.slice(0, 8)} (created ${d.created_at}) tee=${n(d.tee_color)} dif=${n(d.diferencial)}${d.excluded_from_handicap ? ' [excluida]' : ''}`)
  }
  console.log(`\nTotal: ${toDelete.size} rondas a borrar · ${affectedUsers.size} usuarios afectados`)

  if (!APPLY) { console.log('\nDRY-RUN: NO se borró nada. Re-correr con --apply tras OK.'); return }

  // BACKUP de las filas a borrar (recuperable).
  const commit = execSync('git rev-parse --short HEAD').toString().trim()
  const backupRows = rounds.filter(r => toDelete.has(r.id))
  mkdirSync('docs/backups', { recursive: true })
  const path = `docs/backups/dedup-rondas-${commit}.json`
  writeFileSync(path, JSON.stringify(backupRows, null, 2))
  console.log(`\nBackup de ${backupRows.length} filas → ${path}`)

  // BORRAR + verificar.
  const deleted = await deleteRounds(sb, Array.from(toDelete))
  console.log(`Borradas: ${deleted}`)
  // Verificación independiente: ninguna de las ids debe existir.
  const { data: still } = await sb.from('historical_rounds').select('id').in('id', Array.from(toDelete))
  if ((still ?? []).length > 0) { console.error(`✗ AÚN existen ${still!.length} ids — abortando recompute`); process.exit(1) }

  // RECOMPUTE índice de usuarios afectados.
  for (const uid of Array.from(affectedUsers)) {
    const { data: prof } = await sb.from('profiles').select('genero').eq('id', uid).maybeSingle()
    await recomputeRoundsFromCatalog(sb, uid, { dryRun: false, genero: (prof?.genero as string | null) ?? null })
    const { error: rpcErr } = await sb.rpc('calcular_indice_golfers', { p_user_id: uid })
    if (rpcErr) console.error(`  RPC error ${uid.slice(0, 8)}: ${rpcErr.message}`)
  }
  console.log(`Recomputados ${affectedUsers.size} usuarios. ✓ Barrido completo.`)
}

main().catch(e => { console.error(e); process.exit(1) })
