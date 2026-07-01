#!/usr/bin/env node
/**
 * Smoke del backfill de pares (project_backfill_pares_rondas_reales).
 *
 * Verifica CADA ronda backfilleada por AMBOS caminos de resolución de par que usa
 * la app, y exige que coincidan hoyo-a-hoyo:
 *   A) src/golf/coach/hole-pars.ts::resolveRoundPars — tolera array u objeto.
 *      Camino del coach get_round_by_date / get_latest_round / patrones.
 *   B) src/golf/core/compare.ts::parPerHoleArray — SOLO objeto {"1":p,…}.
 *      Camino de historial / stats / coach/page.tsx.
 * Si par_per_hole quedara como array, (B) lee corrido un hoyo y ambos difieren →
 * el smoke FALLA (esto es exactamente el bug que se coló la primera vez).
 *
 *   node --env-file=.env.local scripts/smoke-pares-backfill.mjs
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local'); process.exit(1) }
const sb = createClient(url, key)

// ── Copia VERBATIM de src/golf/coach/hole-pars.ts (camino A) ──
function normalizeParPerHole(p) {
  const out = {}
  if (Array.isArray(p)) p.forEach((v, i) => { if (typeof v === 'number' && v > 0) out[i + 1] = v })
  else if (p && typeof p === 'object') for (const [k, v] of Object.entries(p)) { const n = Number(k); if (Number.isInteger(n) && n > 0 && typeof v === 'number' && v > 0) out[n] = v }
  return out
}
function resolveRoundPars(parPerHole, catalogPars) {
  const own = normalizeParPerHole(parPerHole)
  const hasOwn = Object.keys(own).length > 0
  const hasCatalog = !!catalogPars && Object.keys(catalogPars).length > 0
  if (!hasOwn && !hasCatalog) return null
  return { ...(catalogPars ?? {}), ...own }
}
// ── Copia VERBATIM de src/golf/core/compare.ts::parPerHoleArray (camino B) ──
function parPerHoleArray(parPerHole, length) {
  if (!parPerHole) return undefined
  const arr = []
  let hasAny = false
  for (let i = 1; i <= length; i++) {
    const v = parPerHole[String(i)]
    if (typeof v === 'number' && Number.isFinite(v)) { arr.push(v); hasAny = true }
    else { arr.push(4) } // fallback puntual — si se dispara, la forma está mal
  }
  return hasAny ? arr : undefined
}
function scoreForHole(scores, hole) {
  if (Array.isArray(scores)) { const v = scores[hole - 1]; return typeof v === 'number' ? v : null }
  if (scores && typeof scores === 'object') { const v = scores[String(hole)]; return typeof v === 'number' ? v : null }
  return null
}

const IDS = [
  '85ad1fdf-272d-400c-b1b2-aca151816812','221183e1-d679-485a-a52a-1a4a52fa0c39','d405a40d-98ab-45ce-936d-871738b45252',
  '9f59b424-a587-46b8-a18b-04ce91b3b29e','a5c33ca0-b266-48bb-bb22-f8ce3b26a294','977a5c48-064d-47e2-9425-8f4a4f13ef5c',
  '1e707061-9370-45c6-b199-04b4bbd8e3e7','0b6f2e35-6e81-4523-bc3a-eb1755df7149','f97511a6-96e0-4df6-94f3-951c6abb8bba',
  '7d8853e1-ce8a-4c5a-aa23-532fbe2f1a99','cd720a0a-4c89-4da3-b248-c8142d65ceac','9ca0de2b-7b25-42ad-864d-14338d60e2bf',
  '27ff6244-ea89-4935-af92-b63f82ee1dcc','772edd6e-5ee9-4076-8c19-86ff6a7e975d','21b43ffc-6b37-45e0-bda8-860cc06b80ef',
  'f913b438-62ad-4a62-98ef-4bb22b8c568a','eb565c58-f18c-4616-92dc-9c5b42b5858b','e4ce4a43-41ac-4a52-b267-f26d21398512',
  'c02396ac-c7d5-496e-b0d8-92e8915e3866',
  '3432f884-a9ba-40c9-b636-0ddba924167e','2a9e45c4-4e93-4d67-bdf2-2db14ba9b1fa','85fe015d-63be-4ad8-b15c-07e57c330349',
  // Juanjo photo_scan + ruiz (5)
  '33f3124f-fdc3-407c-977d-1bc017b2396e',
  'd15a9521-13d3-47d9-97f6-8cf28b478917','f9b4a94d-02d6-4f69-9d8d-b6c0d4bf5469','a2fdf3d1-ab89-4d85-bea2-1f5741c3a520',
  'b3b7184d-d187-4e7e-9d32-570926bf2f1f','6f6324a3-490d-4e5c-b268-3412e667b83a',
]

const { data: rows } = await sb.from('historical_rounds')
  .select('id, course_id, course_name, played_at, scores, holes_played, par_per_hole').in('id', IDS)
const cids = Array.from(new Set(rows.map(r => r.course_id).filter(Boolean)))
const parsByCourse = {}
if (cids.length) { const { data: ch } = await sb.from('course_holes').select('course_id, numero, par').in('course_id', cids); for (const h of ch || []) { (parsByCourse[h.course_id] ||= {})[h.numero] = h.par } }

let pass = 0, fail = 0
for (const r of rows) {
  const maxHole = r.holes_played && r.holes_played > 0 ? r.holes_played : 18
  const problems = []

  // (0) forma canónica: objeto, no array
  if (Array.isArray(r.par_per_hole)) problems.push('par_per_hole es ARRAY (debe ser objeto)')

  // (A) camino coach
  const catalogPars = r.course_id ? parsByCourse[r.course_id] ?? null : null
  const parsA = resolveRoundPars(r.par_per_hole, catalogPars)
  // (B) camino historial/stats/coach-page
  const parsBArr = parPerHoleArray(r.par_per_hole, maxHole)

  let totalStrokes = 0, totalPar = 0, holesPlayed = 0
  for (let h = 1; h <= maxHole; h++) {
    const strokes = scoreForHole(r.scores, h) ?? 0
    if (strokes <= 0) continue
    holesPlayed++
    const parA = parsA?.[h] ?? null
    const parB = parsBArr ? parsBArr[h - 1] : null
    if (parA == null) problems.push(`hoyo ${h} sin par (camino A)`)
    // (A) y (B) deben coincidir hoyo-a-hoyo (si difieren, la forma corrió el par)
    if (parA != null && parB != null && parA !== parB) problems.push(`hoyo ${h}: A=${parA} ≠ B=${parB} (par corrido)`)
    if (parA != null) { totalPar += parA; totalStrokes += strokes }
  }

  const ok = problems.length === 0 && totalPar > 0
  console.log(`${ok ? '✔' : '✘'} ${r.played_at} | ${r.course_name} | hoyos=${holesPlayed} totalPar=${totalPar} vsPar=${totalStrokes - totalPar >= 0 ? '+' : ''}${totalStrokes - totalPar}${problems.length ? '  ⚠ ' + problems.slice(0,3).join('; ') : ''}`)
  ok ? pass++ : fail++
}
console.log(`\nSMOKE: ${pass}/${rows.length} OK${fail ? `, ${fail} FALLARON` : ''}`)
process.exitCode = fail ? 1 : 0
