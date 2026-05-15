#!/usr/bin/env node
// scripts/backfill-historical-rounds.mjs
//
// Resuelve course_id + par_per_hole para historical_rounds huerfanas.
// Idempotente: re-ejecucion no duplica trabajo.
//
// Uso:
//   node --env-file=.env.local scripts/backfill-historical-rounds.mjs --dry-run
//   node --env-file=.env.local scripts/backfill-historical-rounds.mjs --dry-run --user-id <uuid>
//   node --env-file=.env.local scripts/backfill-historical-rounds.mjs --limit 10
//   node --env-file=.env.local scripts/backfill-historical-rounds.mjs   # ejecuta de verdad

import { createClient } from '@supabase/supabase-js'

function parseArgs(argv) {
  const args = new Map()
  const flags = new Set()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--') && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args.set(a.slice(2), argv[i + 1])
      i++
    } else if (a.startsWith('--')) {
      flags.add(a.slice(2))
    }
  }
  return { args, flags }
}

const { args, flags } = parseArgs(process.argv.slice(2))
const DRY_RUN = flags.has('dry-run')
const USER_ID = args.get('user-id') || null
const LIMIT = parseInt(args.get('limit') || '0', 10) || null

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function main() {
  let q = supabase
    .from('historical_rounds')
    .select('id, user_id, course_id, course_name, par_per_hole, metadata, scores, holes_played')
    .or('course_id.is.null,par_per_hole.is.null')
    .order('played_at', { ascending: true })

  if (USER_ID) q = q.eq('user_id', USER_ID)
  if (LIMIT) q = q.limit(LIMIT)

  const { data: rows, error } = await q
  if (error) throw new Error(`Query failed: ${error.message}`)

  const stats = {
    total: rows.length,
    path_a: 0,
    path_b: 0,
    path_c: 0,
    courses_created: 0,
    holes_populated: 0,
  }
  const errors = []

  for (const row of rows) {
    try {
      const result = await processRow(row)
      stats[result.path]++
      if (result.courseCreated) stats.courses_created++
      if (result.holesPopulated) stats.holes_populated++
    } catch (e) {
      errors.push({ rowId: row.id, error: e.message })
    }
  }

  console.log(JSON.stringify({ stats, errors, dry_run: DRY_RUN, filters: { user_id: USER_ID, limit: LIMIT } }, null, 2))
}

async function processRow(row) {
  const metaPars = row.metadata?.par_per_hole || null
  let parPerHole = row.par_per_hole || metaPars || null
  const isPathA = !!metaPars && !row.par_per_hole

  // Respetar el course_id existente si ya está resuelto.
  // Solo invocar el RPC cuando el course_id falta (matchear o crear).
  let resolvedCourseId = row.course_id || null
  let course_created = false
  let holes_populated = false

  if (!resolvedCourseId) {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('resolve_and_link_course', {
      p_course_name: row.course_name,
      p_par_per_hole: parPerHole,
      p_similarity_threshold: 0.8,
    })

    if (rpcError) throw new Error(`RPC: ${rpcError.message}`)

    const out = rpcResult || {}
    resolvedCourseId = out.course_id || null
    course_created = !!out.course_created
    holes_populated = !!out.holes_populated
  }

  // Con course_id (existente o recién resuelto), leer pares si faltan.
  if (!parPerHole && resolvedCourseId) {
    const { data: holes } = await supabase
      .from('course_holes')
      .select('numero, par')
      .eq('course_id', resolvedCourseId)
    if (holes && holes.length > 0) {
      parPerHole = Object.fromEntries(holes.map(h => [String(h.numero), h.par]))
    }
  }

  let path
  if (isPathA) path = 'path_a'
  else if (parPerHole) path = 'path_b'
  else path = 'path_c'

  if (!DRY_RUN) {
    const update = {}
    if (resolvedCourseId && !row.course_id) update.course_id = resolvedCourseId
    if (parPerHole && !row.par_per_hole) update.par_per_hole = parPerHole

    if (Object.keys(update).length > 0) {
      const { error: updateError } = await supabase
        .from('historical_rounds')
        .update(update)
        .eq('id', row.id)
      if (updateError) throw new Error(`Update: ${updateError.message}`)
    }
  }

  return { path, courseCreated: course_created, holesPopulated: holes_populated }
}

main().catch(e => {
  console.error('FATAL:', e.message)
  process.exit(1)
})
