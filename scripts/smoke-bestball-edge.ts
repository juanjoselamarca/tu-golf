// Smoke de EDGE CASES de integración de best_ball contra prod (service role).
//
// Los edge cases matemáticos (paridad board↔tarjeta en asimétricos, plus, 3-4
// jugadores, etc.) están en src/golf/formats/best-ball-edge-cases.test.ts (unit).
// Esto cubre los edge cases de INTEGRACIÓN que el unit asume resueltos:
//
//  1. TEE-POR-JUGADOR: dos compañeros con el MISMO índice pero TEE distinto deben
//     resolver course handicaps DISTINTOS. fetchBestBallTeams debe leer j.tees por
//     jugador (no el tee de la ronda) — si se equivoca, el neto del board diverge
//     de la tarjeta. Usa Olivos Golf Club (4 tees con CR/slope distintos).
//  2. INVITADO sin cuenta (user_id null) en el equipo: cuenta para la mejor bola
//     igual; fetchBestBallTeams debe incluirlo.
//  3. Paridad board↔tarjeta con esta mezcla real.
//
// Cadena de prueba autocontenida, BORRA todo en finally.
//
// Uso: node --env-file=.env.local --import tsx scripts/smoke-bestball-edge.ts

import { createClient } from '@supabase/supabase-js'
import { fetchBestBallTeams } from '../src/lib/data/tournaments/teamLeaderboard'
import { computeBestBallStandings } from '../src/golf/leaderboard/team-standings'
import { calcBestBallTotals } from '../src/app/ronda-libre/[codigo]/score-grupo/hooks/useTeamScorecard'
import { resolverCourseData, resolverCourseHandicap } from '../src/golf/core/course-handicap'
import { fetchCourseHoles } from '../src/lib/data/tournaments/leaderboard'
import type { FormatoJuego, ModoJuego } from '../src/golf/core/rules'

const ORGANIZER = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const COURSE = '98318206-7adc-4963-91bb-e1fc46a554f3' // Olivos Golf Club (azul/blanco/rojo/dorado)

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let failures = 0
function log(...a: unknown[]) { console.log('[smoke-bb-edge]', ...a) }
function assert(cond: boolean, msg: string) {
  if (cond) { log(`  ✓ ${msg}`) } else { failures++; log(`  ✗ FALLA: ${msg}`) }
}

async function cleanup(tournamentId: string) {
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
  log('── BEST_BALL · EDGE CASES de integración (tee-por-jugador + invitado) ──')
  const slug = 'smoke-bestball-edge-tmp'
  const { data: prev } = await supabase.from('tournaments').select('id').eq('slug', slug)
  for (const p of prev ?? []) await cleanup(p.id)

  const holes = await fetchCourseHoles(supabase, COURSE)
  const parTotal = Array.from(new Map(holes.map((h) => [h.numero, h.par])).values()).reduce((s, p) => s + p, 0)
  const seeded = holes.slice(0, 9)

  // Índice común; lo que cambia es el TEE.
  const INDEX = 10
  // Expectativa independiente: course handicap por tee, vía el MISMO resolver del scorer.
  const cdAzul = await resolverCourseData(supabase, COURSE, 'azul', 18, parTotal, null)
  const cdBlanco = await resolverCourseData(supabase, COURSE, 'blanco', 18, parTotal, null)
  const chAzulEsperado = resolverCourseHandicap(INDEX, cdAzul)
  const chBlancoEsperado = resolverCourseHandicap(INDEX, cdBlanco)
  log(`  course handicap esperado @índice ${INDEX}: azul=${chAzulEsperado} (CR ${cdAzul?.courseRating}/${cdAzul?.slope}), blanco=${chBlancoEsperado} (CR ${cdBlanco?.courseRating}/${cdBlanco?.slope})`)
  assert(chAzulEsperado !== chBlancoEsperado, `tees distintos → course handicaps distintos (azul ${chAzulEsperado} ≠ blanco ${chBlancoEsperado})`)

  let tournamentId = ''
  try {
    const { data: tour } = await supabase.from('tournaments').insert({
      name: 'SMOKE bb edge', slug, organizer_id: ORGANIZER, date_start: '2026-06-03',
      format: 'best_ball', formato_juego: 'best_ball', modo_juego: 'neto',
      course_id: COURSE, hole_count: 18, status: 'in_progress',
    }).select('id').single()
    tournamentId = tour!.id

    const { data: ronda } = await supabase.from('rondas_libres').insert({
      codigo: 'SMKBE' + tournamentId.slice(0, 4).toUpperCase(), creador_id: ORGANIZER,
      course_id: COURSE, course_name: 'Olivos', tees: 'azul', holes: 18,
      fecha: '2026-06-03', estado: 'en_curso', formato_juego: 'best_ball',
    }).select('id').single()
    const rondaId = ronda!.id

    await supabase.from('tournament_groups').insert({
      tournament_id: tournamentId, name: 'Equipo Edge', ronda_libre_id: rondaId, sort_order: 0,
    })

    // 3 miembros: A (azul, cuenta), B (blanco, mismo índice, otro tee), Invitado (azul, sin user_id).
    const defs = [
      { nombre: 'EDGE A azul', tees: 'azul', handicap: INDEX, user_id: ORGANIZER, delta: 1 },
      { nombre: 'EDGE B blanco', tees: 'blanco', handicap: INDEX, user_id: null as string | null, delta: 0 },
      { nombre: 'EDGE Invitado', tees: 'azul', handicap: INDEX, user_id: null as string | null, delta: 2 },
    ]
    const jugadorIds: string[] = []
    for (const d of defs) {
      const scores: Record<string, number> = {}
      for (const h of seeded) scores[String(h.numero)] = h.par + d.delta
      const { data: j } = await supabase.from('ronda_libre_jugadores').insert({
        ronda_id: rondaId, nombre: d.nombre, handicap: d.handicap, scores, tees: d.tees, user_id: d.user_id,
      }).select('id').single()
      jugadorIds.push(j!.id)
    }

    const { data: eq } = await supabase.from('ronda_equipos').insert({
      ronda_id: rondaId, nombre: 'Equipo Edge', handicap_equipo: null, scores: {},
    }).select('id').single()
    await supabase.from('ronda_equipo_jugadores').insert(
      jugadorIds.map((jid, idx) => ({ equipo_id: eq!.id, jugador_id: jid, orden: idx })),
    )

    // ── Consumidor REAL ──
    const { teams } = await fetchBestBallTeams(supabase, tournamentId, parTotal)
    assert(teams.length === 1, `fetchBestBallTeams → 1 equipo (${teams.length})`)
    const team = teams[0]
    assert(team.jugadores.length === 3, `incluye los 3 miembros, incl. invitado sin cuenta (${team.jugadores.length})`)

    const a = team.jugadores.find((j) => j.nombre === 'EDGE A azul')
    const b = team.jugadores.find((j) => j.nombre === 'EDGE B blanco')
    assert(!!a && a.handicapIndex === chAzulEsperado, `A (tee azul) resolvió course handicap ${chAzulEsperado} (obtuvo ${a?.handicapIndex})`)
    assert(!!b && b.handicapIndex === chBlancoEsperado, `B (tee blanco) resolvió course handicap ${chBlancoEsperado} (obtuvo ${b?.handicapIndex})`)
    assert(!!a && !!b && a!.handicapIndex !== b!.handicapIndex, 'mismo índice, distinto tee → course handicaps distintos en el board')

    // ── Paridad board ↔ tarjeta con los handicaps reales resueltos ──
    const ordered = computeBestBallStandings(teams, holes, parTotal, 'best_ball' as FormatoJuego, 'neto' as ModoJuego)
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
    assert(ordered[0].totalNeto === scorer.total, `paridad neto board==tarjeta con tees mixtos (${ordered[0].totalNeto} == ${scorer.total})`)
    assert(ordered[0].overUnderNeto === scorer.vsPar, `paridad vsPar (${ordered[0].overUnderNeto} == ${scorer.vsPar})`)

    await cleanup(tournamentId)
    log('  🧹 cadena edge borrada')
  } catch (e) {
    if (tournamentId) await cleanup(tournamentId)
    throw e
  }

  log(failures === 0 ? '✅ EDGE CASES de integración OK' : `❌ ${failures} aserción(es) fallaron`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => { console.error('[smoke-bb-edge] ERROR', e); process.exit(1) })
