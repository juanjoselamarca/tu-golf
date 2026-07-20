/**
 * seed-gate-scorer.mjs — Gate del live scorer (post-#269).
 *
 * Siembra en prod un CAMPEONATO de prueba con jugadores ficticios (invitados,
 * sin profile → no contaminan el ranking WHS) para que Juanjo recorra las
 * pantallas del scorer y confirme que los 4 P0 de la Máquina de Verdad aguantan.
 *
 * Motor A (tournaments + players + rounds + hole_scores). es_demo=true →
 * read-only por RLS (Juanjo REVISA, no escribe) + fuera de ranking y en-vivo.
 * afecta_estadisticas=false por doble seguridad. Guests = pending_user_id.
 *
 * Batch 1 (este archivo): individual 9h (P0-5 handicap 9h + P0-7 scoring screen),
 * match play 18h (P0-2), individual 18h mixed-gender (SI norm + tee-per-player).
 * Batch 2 (equipos + back-9, motor B) va aparte.
 *
 * Uso:
 *   node --env-file=.env.local scripts/seed-gate-scorer.mjs          # sembrar
 *   node --env-file=.env.local scripts/seed-gate-scorer.mjs --limpiar # borrar
 *
 * Idempotente: re-sembrar borra primero por slug fijo. Cleanup por cascada.
 */
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

const JUANJO = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const COURSE_9H = { id: '2ec2bffd-2cfb-4e6e-8f74-68b3b04512f1', name: 'Club de Golf Rocas de Santo Domingo - Azul' }
const COURSE_18H = { id: '8f64cd3a-daed-4d97-98e9-7f8ef9552f2d', name: 'Club de Golf Los Leones' }

const SLUGS = ['gate-scorer-9h-individual', 'gate-scorer-matchplay-18h', 'gate-scorer-18h-mixto']

// ─── Helpers ──────────────────────────────────────────────────────────
async function holesOf(courseId) {
  const { data, error } = await sb.from('course_holes')
    .select('numero,par,stroke_index').eq('course_id', courseId).order('numero')
  if (error) throw error
  return data
}

async function limpiar() {
  const { data } = await sb.from('tournaments').select('id,slug').in('slug', SLUGS)
  for (const t of data ?? []) {
    const { error } = await sb.from('tournaments').delete().eq('id', t.id)
    console.log(error ? `  ✗ ${t.slug}: ${error.message}` : `  ✓ borrado ${t.slug}`)
  }
}

async function crearTorneo({ slug, name, course, holeCount, format, modo }) {
  const row = {
    name, slug, organizer_id: JUANJO,
    course_name: course.name, course_id: course.id,
    date_start: '2026-07-20',
    format, formato_juego: format, modo_juego: modo,
    hole_count: holeCount, tees: 'per_player', use_handicap: true,
    status: 'in_progress', hcp_calc_mode: 'whs',
    es_demo: true, afecta_estadisticas: false, max_players: null,
  }
  const { data, error } = await sb.from('tournaments').insert(row).select('id,slug').single()
  if (error) throw new Error(`crearTorneo ${slug}: ${error.message}`)
  return data
}

// enrola un invitado vía RPC canónica; devuelve player_id
async function enrolarGuest(tournamentId, nombre, handicap) {
  const { data, error } = await sb.rpc('enroll_player', {
    p_tournament_id: tournamentId, p_kind: 'guest', p_user_id: null,
    p_guest_name: nombre, p_handicap: handicap, p_category_id: null,
  })
  if (error) throw new Error(`enroll ${nombre}: ${error.message}`)
  if (!data?.ok) throw new Error(`enroll ${nombre} rechazado: ${data?.reason}`)
  return data.player_id
}

async function setTee(playerId, tee) {
  const { error } = await sb.from('players').update({ tees: tee }).eq('id', playerId)
  if (error) throw new Error(`setTee ${playerId}: ${error.message}`)
}

async function roundIdDe(playerId) {
  const { data, error } = await sb.from('rounds').select('id').eq('player_id', playerId).single()
  if (error) throw new Error(`roundId ${playerId}: ${error.message}`)
  return data.id
}

// inserta scores gross por hoyo (net lo computa la app). scoresPorHoyo: {numero:gross}
async function cargarScores(roundId, holes, grossFn) {
  const rows = holes.map((h) => ({
    round_id: roundId, hole_number: h.numero, par: h.par,
    gross_score: grossFn(h), source: 'manual_organizer', status: 'loaded',
  }))
  const { error } = await sb.from('hole_scores').upsert(rows, { onConflict: 'round_id,hole_number' })
  if (error) throw new Error(`cargarScores ${roundId}: ${error.message}`)
  const totalGross = rows.reduce((a, r) => a + r.gross_score, 0)
  await sb.from('rounds').update({ total_gross: totalGross, status: 'closed' }).eq('id', roundId)
}

// ─── Seed ─────────────────────────────────────────────────────────────
async function sembrar() {
  const holes9 = await holesOf(COURSE_9H.id)
  const holes18 = await holesOf(COURSE_18H.id)
  console.log(`holes: 9h=${holes9.length}, 18h=${holes18.length}`)

  // T1 — Individual stroke 9 hoyos → P0-5 (course handicap DEBE partirse a la mitad) + P0-7
  const t1 = await crearTorneo({ slug: SLUGS[0], name: 'Gate · Individual 9 hoyos (handicap 9h)', course: COURSE_9H, holeCount: 9, format: 'stroke_play', modo: 'neto' })
  const jugadores9 = [
    { n: 'Paty Demo (F)', hcp: 30.0, tee: 'rojo' },   // índice alto: CH 9h debe ser ~15, no ~30
    { n: 'Cacho Demo (M)', hcp: 10.0, tee: 'azul' },
    { n: 'Nacho Demo (M)', hcp: 18.0, tee: 'blanco' },
    { n: 'Plus Demo (M)', hcp: -2.0, tee: 'azul' },   // plus handicap (índice negativo)
  ]
  for (const j of jugadores9) {
    const pid = await enrolarGuest(t1.id, j.n, j.hcp)
    await setTee(pid, j.tee)
    const rid = await roundIdDe(pid)
    // gross ~ par + ruido chico según hcp (para que el neto sea interesante)
    await cargarScores(rid, holes9, (h) => h.par + (j.hcp > 15 ? 2 : j.hcp > 5 ? 1 : 0))
  }
  console.log(`✓ T1 ${t1.slug} — 4 jugadores 9h`)

  // T2 — Match play 18 hoyos → P0-2 (holes won con SI normalizado)
  const t2 = await crearTorneo({ slug: SLUGS[1], name: 'Gate · Match Play 18 hoyos', course: COURSE_18H, holeCount: 18, format: 'match_play', modo: 'neto' })
  const mp = [
    { n: ' Retador A Demo (M)', hcp: 8.0, tee: 'blanco', delta: -1 }, // gana varios hoyos
    { n: 'Retador B Demo (M)', hcp: 12.0, tee: 'blanco', delta: 1 },
  ]
  for (const j of mp) {
    const pid = await enrolarGuest(t2.id, j.n, j.hcp)
    await setTee(pid, j.tee)
    const rid = await roundIdDe(pid)
    await cargarScores(rid, holes18, (h) => h.par + j.delta + (h.numero % 3 === 0 ? 1 : 0))
  }
  console.log(`✓ T2 ${t2.slug} — match play`)

  // T3 — Individual stroke 18 hoyos, mixto (SI normalización + tee-per-player, damas+varones)
  const t3 = await crearTorneo({ slug: SLUGS[2], name: 'Gate · Individual 18 hoyos (mixto)', course: COURSE_18H, holeCount: 18, format: 'stroke_play', modo: 'neto' })
  const jugadores18 = [
    { n: 'Sofía Demo (F)', hcp: 24.0, tee: 'rojo' },
    { n: 'Andrés Demo (M)', hcp: 6.0, tee: 'azul' },
    { n: 'Vicente Demo (M)', hcp: 14.0, tee: 'blanco' },
    { n: 'Elena Demo (F)', hcp: 36.0, tee: 'rojo' },
  ]
  for (const j of jugadores18) {
    const pid = await enrolarGuest(t3.id, j.n, j.hcp)
    await setTee(pid, j.tee)
    const rid = await roundIdDe(pid)
    await cargarScores(rid, holes18, (h) => h.par + (j.hcp > 20 ? 2 : j.hcp > 10 ? 1 : 0))
  }
  console.log(`✓ T3 ${t3.slug} — 4 jugadores 18h mixto`)

  console.log('\n=== LISTO — links para revisar (prod) ===')
  const base = 'https://golfersplus.vercel.app'
  for (const s of SLUGS) console.log(`  ${base}/torneo/${s}`)
}

// ─── Main ─────────────────────────────────────────────────────────────
const limpiarFlag = process.argv.includes('--limpiar')
console.log(limpiarFlag ? '🧹 Limpiando seed del gate...' : '🌱 Sembrando gate del scorer...')
await limpiar() // idempotente: siempre borra lo previo por slug
if (!limpiarFlag) await sembrar()
console.log('done.')
