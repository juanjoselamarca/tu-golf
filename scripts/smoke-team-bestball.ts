// Smoke de USO REAL de best_ball contra prod (service role).
//
// best_ball es el ÚNICO formato de equipo cuyo scoring es INDIVIDUAL: cada
// jugador anota su propia bola y el equipo toma la mejor neta por hoyo. Este
// smoke arma una cadena de prueba autocontenida (torneo→grupo→ronda→2 jugadores
// con scores INDIVIDUALES→ronda_equipos handicap_equipo null→miembros), corre el
// consumidor REAL (fetchBestBallTeams + computeBestBallStandings) y valida la
// PARIDAD board↔tarjeta: el neto del leaderboard debe coincidir EXACTO con el de
// la tarjeta en cancha (calcBestBallTotals), usando los course handicaps que
// resuelve fetchBestBallTeams desde la cancha real (tee/slope/CR). Borra todo al
// final (try/finally), igual que el smoke de foursome.
//
// Uso: node --env-file=.env.local --import tsx scripts/smoke-team-bestball.ts

import { createClient } from '@supabase/supabase-js'
import { fetchBestBallTeams } from '../src/lib/data/tournaments/teamLeaderboard'
import { computeBestBallStandings } from '../src/golf/leaderboard/team-standings'
import { calcBestBallTotals } from '../src/app/ronda-libre/[codigo]/score-grupo/hooks/useTeamScorecard'
import { fetchCourseHoles, buildFallbackCourseHoles } from '../src/lib/data/tournaments/leaderboard'
import type { FormatoJuego, ModoJuego } from '../src/golf/core/rules'

const ORGANIZER = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const COURSE = '84be1fc3-21a7-4f8b-965a-a7f2c755553a'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let failures = 0
function log(...a: unknown[]) { console.log('[smoke-bestball]', ...a) }
function assert(cond: boolean, msg: string) {
  if (cond) { log(`  ✓ ${msg}`) } else { failures++; log(`  ✗ FALLA: ${msg}`) }
}

async function holesFor(courseId: string, holeCount: number) {
  const real = await fetchCourseHoles(supabase, courseId)
  return real.length > 0 ? real : buildFallbackCourseHoles(holeCount)
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

async function testBestBall() {
  log('── BEST_BALL (cadena de prueba autocontenida, scoring individual) ──')
  const slug = 'smoke-bestball-tmp'

  // Limpieza previa por si quedó de una corrida abortada.
  const { data: prev } = await supabase.from('tournaments').select('id').eq('slug', slug)
  for (const p of prev ?? []) await cleanupTournament(p.id)

  let tournamentId = ''
  try {
    const { data: tour, error: tErr } = await supabase.from('tournaments').insert({
      name: 'SMOKE best ball', slug, organizer_id: ORGANIZER, date_start: '2026-06-02',
      format: 'best_ball', formato_juego: 'best_ball', modo_juego: 'neto',
      course_id: COURSE, hole_count: 18, status: 'in_progress',
    }).select('id').single()
    if (tErr) throw tErr
    tournamentId = tour!.id

    const { data: ronda } = await supabase.from('rondas_libres').insert({
      codigo: 'SMKBB' + tournamentId.slice(0, 4).toUpperCase(), creador_id: ORGANIZER,
      course_id: COURSE, course_name: 'SMOKE', tees: 'blanco', holes: 18,
      fecha: '2026-06-02', estado: 'en_curso', formato_juego: 'best_ball',
    }).select('id').single()
    const rondaId = ronda!.id

    await supabase.from('tournament_groups').insert({
      tournament_id: tournamentId, name: 'Equipo BB', ronda_libre_id: rondaId, sort_order: 0,
    })

    const holes = await holesFor(COURSE, 18)
    const parTotal = holes.reduce((s, h) => s + h.par, 0)
    const seeded = holes.slice(0, Math.min(9, holes.length)) // 9 hoyos

    // Scores INDIVIDUALES: A juega al par, B juega par+1 (peor bruto). En neto, el
    // que recibe golpe puede ganar el hoyo — la mejor bola la decide el motor.
    const playerDefs = [
      { nombre: 'SMOKE BB A', handicap: 5, delta: 0 },
      { nombre: 'SMOKE BB B', handicap: 20, delta: 1 },
    ]
    const jugadorIds: string[] = []
    for (const pd of playerDefs) {
      const scores: Record<string, number> = {}
      for (const h of seeded) scores[String(h.numero)] = h.par + pd.delta
      const { data: j } = await supabase.from('ronda_libre_jugadores').insert({
        ronda_id: rondaId, nombre: pd.nombre, handicap: pd.handicap, scores, tees: 'blanco',
      }).select('id').single()
      jugadorIds.push(j!.id)
    }

    // ronda_equipos SIN handicap de equipo (cada jugador con el suyo) + miembros.
    const { data: eq } = await supabase.from('ronda_equipos').insert({
      ronda_id: rondaId, nombre: 'Equipo BB', handicap_equipo: null, scores: {},
    }).select('id').single()
    await supabase.from('ronda_equipo_jugadores').insert(
      jugadorIds.map((jid, idx) => ({ equipo_id: eq!.id, jugador_id: jid, orden: idx })),
    )

    // ── Consumidor REAL ──
    const { teams, memberNames } = await fetchBestBallTeams(supabase, tournamentId, parTotal)
    assert(teams.length === 1, `fetchBestBallTeams → 1 equipo (${teams.length})`)
    if (teams.length !== 1) return
    const team = teams[0]
    assert(team.jugadores.length === 2, `equipo trae 2 jugadores (${team.jugadores.length})`)
    assert((memberNames[team.id] ?? []).length === 2, 'memberNames trae los 2 jugadores')
    log(`    course handicaps (cancha real, tee blanco): ${team.jugadores.map((j) => `${j.nombre}=${j.handicapIndex}`).join(', ')}`)

    const ordered = computeBestBallStandings(teams, holes, parTotal, 'best_ball' as FormatoJuego, 'neto' as ModoJuego)
    log(`    board best_ball (neto, 9 hoyos): ${ordered[0].teamNombre} | gross=${ordered[0].totalGross} neto=${ordered[0].totalNeto} (${ordered[0].overUnderNeto >= 0 ? '+' : ''}${ordered[0].overUnderNeto}) | thru=${ordered[0].holesPlayed}`)
    assert(ordered.length === 1, 'standings 1 equipo')
    assert(ordered[0].holesPlayed === seeded.length, `thru = ${seeded.length}`)

    // ── PARIDAD board ↔ tarjeta en cancha ──
    // Mismos course handicaps (los que resolvió fetchBestBallTeams) + mismos scores.
    const scorerScores: Record<string, Record<number, number>> = {}
    const playerDotHcps: Record<string, number> = {}
    const strokeIndexByHole: Record<number, number> = {}
    const parMap: Record<number, number> = {}
    for (const h of holes) { strokeIndexByHole[h.numero] = h.stroke_index; parMap[h.numero] = h.par }
    for (const jug of team.jugadores) {
      playerDotHcps[jug.id] = jug.handicapIndex
      const s: Record<number, number> = {}
      for (const [k, v] of Object.entries(jug.scores)) s[Number(k)] = v as number
      scorerScores[jug.id] = s
    }
    const scorer = calcBestBallTotals({
      equipoJugadorIds: team.jugadores.map((j) => j.id),
      totalHoles: 18, scores: scorerScores, modoJuego: 'neto',
      playerDotHcps, strokeIndexByHole, parMap,
    })
    assert(ordered[0].totalNeto === scorer.total, `paridad neto board==tarjeta (${ordered[0].totalNeto} == ${scorer.total})`)
    assert(ordered[0].overUnderNeto === scorer.vsPar, `paridad vsPar board==tarjeta (${ordered[0].overUnderNeto} == ${scorer.vsPar})`)
    assert(ordered[0].holesPlayed === scorer.played, `paridad thru (${ordered[0].holesPlayed} == ${scorer.played})`)

    await cleanupTournament(tournamentId)
    log('  🧹 cadena best_ball borrada')
  } catch (e) {
    if (tournamentId) await cleanupTournament(tournamentId)
    throw e
  }
}

async function main() {
  await testBestBall()
  log(failures === 0 ? '✅ BEST_BALL END-TO-END OK' : `❌ ${failures} aserción(es) fallaron`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => { console.error('[smoke-bestball] ERROR', e); process.exit(1) })
