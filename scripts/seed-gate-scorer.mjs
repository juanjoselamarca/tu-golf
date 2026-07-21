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
 * Batch 1 (motor A): individual 9h (P0-5 handicap 9h + P0-7 scoring screen),
 * match play 18h (P0-2), individual 18h mixed-gender (SI norm + tee-per-player).
 * Batch 2 (motor B, rondas_libres): equipos best_ball/scramble/foursome +
 * ronda 9h back-nine (hoyo_inicio=10) → valida P0-1 (`generarOrdenHoyos`).
 * best_ball lee scores por-jugador (`ronda_libre_jugadores.scores`);
 * scramble/foursome leen la bola compartida (`ronda_equipos.scores`).
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
// Batch 2 (motor B): torneos por equipo (slug) + rondas libres (codigo con prefijo GATEB2).
const SLUGS_B2 = ['gate-scorer-bestball', 'gate-scorer-scramble', 'gate-scorer-foursome']
const RONDA_PREFIX = 'GATEB2'
const BACKNINE_CODIGO = 'GATEB2BN'

// ─── Helpers ──────────────────────────────────────────────────────────
async function holesOf(courseId) {
  const { data, error } = await sb.from('course_holes')
    .select('numero,par,stroke_index').eq('course_id', courseId).order('numero')
  if (error) throw error
  return data
}

async function limpiar() {
  // Torneos (motor A + torneos de equipo del motor B): cascada borra players/rounds/
  // hole_scores/tournament_groups. Los tournament_groups referencian la ronda pero NO
  // la poseen, así que las rondas_libres se borran aparte (por prefijo de codigo).
  const { data } = await sb.from('tournaments').select('id,slug').in('slug', [...SLUGS, ...SLUGS_B2])
  for (const t of data ?? []) {
    const { error } = await sb.from('tournaments').delete().eq('id', t.id)
    console.log(error ? `  ✗ ${t.slug}: ${error.message}` : `  ✓ borrado ${t.slug}`)
  }
  // rondas_libres del batch 2 (equipos + back-nine): cascada a ronda_equipos /
  // ronda_libre_jugadores / ronda_equipo_jugadores.
  const { data: rondas } = await sb.from('rondas_libres').select('id,codigo').like('codigo', `${RONDA_PREFIX}%`)
  for (const r of rondas ?? []) {
    const { error } = await sb.from('rondas_libres').delete().eq('id', r.id)
    console.log(error ? `  ✗ ronda ${r.codigo}: ${error.message}` : `  ✓ borrada ronda ${r.codigo}`)
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

// ─── Motor B (rondas_libres): equipos + back-nine ─────────────────────
// Un torneo de equipo cuelga N rondas_libres (una por equipo) vía tournament_groups.
// scores = objeto JSONB {"10":4,...}. sharedBall=true (scramble/foursome) → scores
// en ronda_equipos; false (best_ball) → scores por-jugador en ronda_libre_jugadores.
function scoresObj(holes, grossFn) {
  const o = {}
  for (const h of holes) o[String(h.numero)] = grossFn(h)
  return o
}

async function crearRonda({ codigo, course, holes, hoyoInicio, formato, modo }) {
  const { data, error } = await sb.from('rondas_libres').insert({
    codigo, course_id: course.id, course_name: course.name,
    tees: 'blanco', holes, hoyo_inicio: hoyoInicio, modo_juego: modo, formato_juego: formato,
    creador_id: JUANJO, admin_user_id: JUANJO, fecha: '2026-07-20',
    estado: 'en_curso', es_demo: true,
  }).select('id,codigo').single()
  if (error) throw new Error(`crearRonda ${codigo}: ${error.message}`)
  return data
}

async function sembrarTorneoEquipo({ slug, name, course, holeCount, formato, teams, holesData, sharedBall }) {
  const t = await crearTorneo({ slug, name, course, holeCount, format: formato, modo: 'neto' })
  let i = 0
  for (const team of teams) {
    i++
    const ronda = await crearRonda({ codigo: `${RONDA_PREFIX}${slug.slice(-2).toUpperCase()}${i}`, course, holes: holeCount, hoyoInicio: 1, formato, modo: 'neto' })
    // bola compartida (scramble/foursome): un score de equipo por hoyo
    const teamScores = sharedBall ? scoresObj(holesData, (h) => h.par + (h.numero % 4 === 0 ? 1 : 0)) : {}
    const { data: eq, error: eErr } = await sb.from('ronda_equipos').insert({
      ronda_id: ronda.id, nombre: team.nombre, handicap_equipo: team.hcp, scores: teamScores,
    }).select('id').single()
    if (eErr) throw new Error(`equipo ${team.nombre}: ${eErr.message}`)
    let p = 0
    for (const jug of team.jugadores) {
      p++
      // best_ball: cada jugador su bola (scores por-jugador); shared: scores vacíos
      const pScores = sharedBall ? {} : scoresObj(holesData, (h) => h.par + (jug.delta ?? 0) + (h.numero % 3 === 0 ? 1 : 0))
      const { data: j, error: jErr } = await sb.from('ronda_libre_jugadores').insert({
        ronda_id: ronda.id, nombre: jug.n, scores: pScores, handicap: jug.hcp, is_guest: true, tees: 'blanco',
      }).select('id').single()
      if (jErr) throw new Error(`jugador ${jug.n}: ${jErr.message}`)
      const { error: lErr } = await sb.from('ronda_equipo_jugadores').insert({ equipo_id: eq.id, jugador_id: j.id, orden: p })
      if (lErr) throw new Error(`link ${jug.n}: ${lErr.message}`)
    }
    const { error: gErr } = await sb.from('tournament_groups').insert({ tournament_id: t.id, name: team.nombre, ronda_libre_id: ronda.id, sort_order: i })
    if (gErr) throw new Error(`group ${team.nombre}: ${gErr.message}`)
  }
  console.log(`✓ ${slug} — ${teams.length} equipos (${formato})`)
  return t
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

  // ── Batch 2 (motor B): equipos + back-nine ──
  const teamsFor = (fmt) => ([
    { nombre: `Equipo Cóndor (${fmt})`, hcp: 10, jugadores: [{ n: 'Juan Demo', hcp: 8, delta: 0 }, { n: 'Pedro Demo', hcp: 12, delta: 1 }] },
    { nombre: `Equipo Águila (${fmt})`, hcp: 14, jugadores: [{ n: 'Luis Demo', hcp: 16, delta: 1 }, { n: 'Marco Demo', hcp: 12, delta: 0 }] },
  ])
  // best_ball → bola por jugador; scramble/foursome → bola compartida
  await sembrarTorneoEquipo({ slug: SLUGS_B2[0], name: 'Gate · Best Ball (equipos)', course: COURSE_18H, holeCount: 18, formato: 'best_ball', teams: teamsFor('BB'), holesData: holes18, sharedBall: false })
  await sembrarTorneoEquipo({ slug: SLUGS_B2[1], name: 'Gate · Scramble (equipos)', course: COURSE_18H, holeCount: 18, formato: 'scramble', teams: teamsFor('SC'), holesData: holes18, sharedBall: true })
  await sembrarTorneoEquipo({ slug: SLUGS_B2[2], name: 'Gate · Foursome (equipos)', course: COURSE_18H, holeCount: 18, formato: 'foursome', teams: teamsFor('FO'), holesData: holes18, sharedBall: true })

  // Back-nine (P0-1): ronda 9h que empieza en el hoyo 10 → generarOrdenHoyos(10,9,18)=[10..18]
  const backHoles = holes18.filter((h) => h.numero >= 10)
  const bn = await crearRonda({ codigo: BACKNINE_CODIGO, course: COURSE_18H, holes: 9, hoyoInicio: 10, formato: 'stroke_play', modo: 'neto' })
  for (const jug of [{ n: 'Tomás Demo', hcp: 12 }, { n: 'Diego Demo', hcp: 20 }]) {
    const { data: j, error } = await sb.from('ronda_libre_jugadores').insert({
      ronda_id: bn.id, nombre: jug.n, handicap: jug.hcp, is_guest: true, tees: 'blanco',
      scores: scoresObj(backHoles, (h) => h.par + (jug.hcp > 15 ? 1 : 0)),
    }).select('id').single()
    if (error) throw new Error(`back-nine ${jug.n}: ${error.message}`)
  }
  console.log(`✓ back-nine ${bn.codigo} — 9h empezando en hoyo 10 (P0-1)`)

  console.log('\n=== LISTO — links para revisar (prod) ===')
  const base = 'https://golfersplus.vercel.app'
  console.log('  Motor A (individual/match play):')
  for (const s of SLUGS) console.log(`    ${base}/torneo/${s}`)
  console.log('  Motor B (equipos):')
  for (const s of SLUGS_B2) console.log(`    ${base}/torneo/${s}`)
  console.log('  Back-nine (P0-1):')
  console.log(`    ${base}/ronda-libre/${BACKNINE_CODIGO}`)
}

// ─── Main ─────────────────────────────────────────────────────────────
const limpiarFlag = process.argv.includes('--limpiar')
console.log(limpiarFlag ? '🧹 Limpiando seed del gate...' : '🌱 Sembrando gate del scorer...')
await limpiar() // idempotente: siempre borra lo previo por slug
if (!limpiarFlag) await sembrar()
console.log('done.')
