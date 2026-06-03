// Smoke de USO REAL de las modalidades de equipo contra prod (service role).
//
// Verifica el pipeline completo productor→cancha→leaderboard con datos reales y
// scores sembrados, usando las funciones REALES del consumidor
// (fetchScrambleTeams + computeScrambleStandings / computeFoursomeStandings).
//
// - SCRAMBLE: sobre el torneo de prueba "a" (real, descartable). Siembra scores,
//   corre el leaderboard, valida thru/orden/neto y el override de handicap.
//   Resetea los scores al terminar (deja el torneo como estaba).
// - FOURSOME: crea una cadena de prueba autocontenida (torneo→grupo→ronda→
//   jugadores→equipo→miembros→scores), valida, y BORRA todo (try/finally).
// - BEST_BALL: documentado como individual (no wired al board); no se siembra.
//
// Uso: node --env-file=.env.local --import tsx scripts/smoke-team-formats.ts

import { createClient } from '@supabase/supabase-js'
import { computeStoredTeamHandicap } from '../src/lib/data/tournaments/teamRounds'
import { fetchScrambleTeams } from '../src/lib/data/tournaments/teamLeaderboard'
import { computeScrambleStandings, computeFoursomeStandings } from '../src/golf/leaderboard/team-standings'
import { fetchCourseHoles, buildFallbackCourseHoles } from '../src/lib/data/tournaments/leaderboard'
import type { FormatoJuego, ModoJuego } from '../src/golf/core/rules'

const SCRAMBLE_TOURNAMENT = '138eb381-484d-4733-91f2-0e6a081f8bb1' // torneo "a" (real, descartable)
const ORGANIZER = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const COURSE = '84be1fc3-21a7-4f8b-965a-a7f2c755553a'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let failures = 0
function log(...a: unknown[]) { console.log('[smoke-formats]', ...a) }
function assert(cond: boolean, msg: string) {
  if (cond) { log(`  ✓ ${msg}`) } else { failures++; log(`  ✗ FALLA: ${msg}`) }
}

async function holesFor(courseId: string, holeCount: number) {
  const real = await fetchCourseHoles(supabase, courseId)
  return real.length > 0 ? real : buildFallbackCourseHoles(holeCount)
}

function printBoard(label: string, rows: Array<{ teamNombre: string; teamHandicap: number; totalGross: number; totalNeto: number; overUnderNeto: number; holesPlayed: number }>) {
  log(`  ${label}:`)
  rows.forEach((r, i) => log(`    #${i + 1} ${r.teamNombre} | hcp=${r.teamHandicap} | gross=${r.totalGross} neto=${r.totalNeto} (${r.overUnderNeto >= 0 ? '+' : ''}${r.overUnderNeto}) | thru=${r.holesPlayed}`))
}

// ─── SCRAMBLE: torneo real "a" ───
async function testScramble() {
  log('── SCRAMBLE (torneo real "a") ──')
  const { teams } = await fetchScrambleTeams(supabase, SCRAMBLE_TOURNAMENT)
  assert(teams.length >= 2, `tiene ${teams.length} equipos (>=2)`)
  if (teams.length < 2) return

  const holes = await holesFor(COURSE, 18)
  const parTotal = holes.reduce((s, h) => s + h.par, 0)
  const seededHoles = holes.slice(0, Math.min(9, holes.length)) // jugamos 9 hoyos

  // Sembrar scores: equipo[0] juega al par, equipo[1] +2 por hoyo (peor gross).
  const eqIds: string[] = []
  for (let i = 0; i < teams.length; i++) {
    const scores: Record<string, number> = {}
    for (const h of seededHoles) scores[String(h.numero)] = h.par + (i === 0 ? 0 : 2)
    const { error } = await supabase.from('ronda_equipos').update({ scores }).eq('id', teams[i].id)
    if (error) throw error
    eqIds.push(teams[i].id)
  }

  try {
    const { teams: t2, memberNames } = await fetchScrambleTeams(supabase, SCRAMBLE_TOURNAMENT)
    const ordered = computeScrambleStandings(t2, holes, parTotal, 'scramble' as FormatoJuego, 'neto' as ModoJuego)
    printBoard('leaderboard scramble (neto, 9 hoyos)', ordered)

    assert(ordered.length === t2.length, 'standings cubre todos los equipos')
    assert(ordered.every((r) => r.holesPlayed === seededHoles.length), `thru = ${seededHoles.length} en todos`)
    for (let i = 0; i < ordered.length - 1; i++) {
      assert(ordered[i].overUnderNeto <= ordered[i + 1].overUnderNeto, `orden neto ascendente (#${i + 1} <= #${i + 2})`)
    }
    // El handicap usado es el almacenado (override), no recalculado.
    for (const r of ordered) {
      const stored = t2.find((x) => x.nombre === r.teamNombre)?.teamHandicap
      assert(stored != null && r.teamHandicap === stored, `${r.teamNombre}: usa handicap almacenado (${stored})`)
      if (r.teamHandicap > 0) assert(r.totalNeto < r.totalGross, `${r.teamNombre}: neto < gross con hcp ${r.teamHandicap}`)
    }
    const topId = t2.find((x) => x.nombre === ordered[0]?.teamNombre)?.id ?? ''
    log(`    jugadores equipo top: [${(memberNames[topId] ?? []).join(', ')}]`)
  } finally {
    // Reset: dejar el torneo como estaba (scores vacíos).
    for (const id of eqIds) await supabase.from('ronda_equipos').update({ scores: {} }).eq('id', id)
    log('  ↺ scores reseteados (torneo "a" como estaba)')
  }
}

// ─── FOURSOME: cadena de prueba autocontenida ───
async function testFoursome() {
  log('── FOURSOME (cadena de prueba autocontenida) ──')
  const created: { table: string; id: string }[] = []
  const slug = 'smoke-foursome-tmp'

  // Limpieza previa por si quedó de una corrida abortada.
  const { data: prev } = await supabase.from('tournaments').select('id').eq('slug', slug)
  for (const p of prev ?? []) await cleanupTournament(p.id)

  try {
    const { data: tour, error: tErr } = await supabase.from('tournaments').insert({
      name: 'SMOKE foursome', slug, organizer_id: ORGANIZER, date_start: '2026-06-02',
      format: 'foursome', formato_juego: 'foursome', modo_juego: 'neto',
      course_id: COURSE, hole_count: 18, status: 'in_progress',
    }).select('id').single()
    if (tErr) throw tErr
    const tournamentId = tour!.id
    created.push({ table: 'tournaments', id: tournamentId })

    const { data: ronda } = await supabase.from('rondas_libres').insert({
      codigo: 'SMK' + tournamentId.slice(0, 5).toUpperCase(), creador_id: ORGANIZER,
      course_id: COURSE, course_name: 'SMOKE', tees: 'blanco', holes: 18,
      fecha: '2026-06-02', estado: 'en_curso', formato_juego: 'foursome',
    }).select('id').single()
    const rondaId = ronda!.id

    const { data: grupo } = await supabase.from('tournament_groups').insert({
      tournament_id: tournamentId, name: 'Equipo SMOKE', ronda_libre_id: rondaId, sort_order: 0,
    }).select('id').single()

    // 2 jugadores (handicaps 12 y 18). Foursome hcp = (12+18)/2 = 15.
    const hcps = [12, 18]
    const jugadorIds: string[] = []
    for (let i = 0; i < 2; i++) {
      const { data: j } = await supabase.from('ronda_libre_jugadores').insert({
        ronda_id: rondaId, nombre: `SMOKE J${i + 1}`, handicap: hcps[i], scores: {},
      }).select('id').single()
      jugadorIds.push(j!.id)
    }

    const handicapEquipo = computeStoredTeamHandicap('foursome', hcps) // 15
    const { data: eq } = await supabase.from('ronda_equipos').insert({
      ronda_id: rondaId, nombre: 'Equipo SMOKE', handicap_equipo: handicapEquipo, scores: {},
    }).select('id').single()
    await supabase.from('ronda_equipo_jugadores').insert(
      jugadorIds.map((jid, idx) => ({ equipo_id: eq!.id, jugador_id: jid, orden: idx })),
    )

    // Sembrar scores (9 hoyos al par).
    const holes = await holesFor(COURSE, 18)
    const parTotal = holes.reduce((s, h) => s + h.par, 0)
    const seeded = holes.slice(0, Math.min(9, holes.length))
    const scores: Record<string, number> = {}
    for (const h of seeded) scores[String(h.numero)] = h.par
    await supabase.from('ronda_equipos').update({ scores }).eq('id', eq!.id)

    // Consumidor REAL.
    const { teams, memberNames } = await fetchScrambleTeams(supabase, tournamentId)
    assert(teams.length === 1, `fetchScrambleTeams → 1 equipo (${teams.length})`)
    const ordered = computeFoursomeStandings(teams, memberNames, holes, parTotal, 'foursome' as FormatoJuego, 'neto' as ModoJuego)
    printBoard('leaderboard foursome (neto, 9 hoyos)', ordered)
    assert(ordered.length === 1, 'standings 1 equipo')
    assert(ordered[0].holesPlayed === seeded.length, `thru = ${seeded.length}`)
    assert(ordered[0].teamHandicap === handicapEquipo, `usa handicap almacenado override (${handicapEquipo})`)
    assert(ordered[0].totalNeto < ordered[0].totalGross, 'neto < gross con hcp 15')
    assert((memberNames[teams[0].id] ?? []).length === 2, 'memberNames trae los 2 jugadores')

    await cleanupTournament(tournamentId)
    log('  🧹 cadena foursome borrada')
  } catch (e) {
    for (const c of created.reverse()) {
      if (c.table === 'tournaments') await cleanupTournament(c.id)
    }
    throw e
  }
}

async function cleanupTournament(tournamentId: string) {
  const { data: groups } = await supabase.from('tournament_groups').select('ronda_libre_id').eq('tournament_id', tournamentId)
  const rondaIds = (groups ?? []).map((g) => g.ronda_libre_id).filter(Boolean) as string[]
  for (const rid of rondaIds) {
    const { data: eqs } = await supabase.from('ronda_equipos').select('id').eq('ronda_id', rid)
    for (const e of eqs ?? []) await supabase.from('ronda_equipo_jugadores').delete().eq('equipo_id', e.id)
    await supabase.from('ronda_equipos').delete().eq('ronda_id', rid)
    await supabase.from('ronda_libre_jugadores').delete().eq('ronda_id', rid)
  }
  await supabase.from('tournament_groups').delete().eq('tournament_id', tournamentId)
  for (const rid of rondaIds) await supabase.from('rondas_libres').delete().eq('id', rid)
  await supabase.from('tournaments').delete().eq('id', tournamentId)
}

async function main() {
  await testScramble()
  await testFoursome()
  log('── BEST_BALL ──')
  log('  ℹ no wired al board (scoring por jugador, no compartido) — cae a individual. No se siembra.')
  log(failures === 0 ? '✅ TODAS LAS MODALIDADES OK' : `❌ ${failures} aserción(es) fallaron`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => { console.error('[smoke-formats] ERROR', e); process.exit(1) })
