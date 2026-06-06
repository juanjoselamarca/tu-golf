// Smoke del leaderboard INDIVIDUAL (stroke/stableford) neto contra prod (service role).
//
// Prueba el fix del bug de course handicap: la tabla pública de un torneo individual
// debe calcular el neto con el COURSE HANDICAP por tee (como la tarjeta en cancha),
// no con el índice crudo. Antes divergían en canchas reales (slope ≠ 113).
//
// Camino "ronda-libre" (el moderno, vía wizard). Cadena autocontenida en Olivos GC
// (azul slope 132 / CR 73), borra todo en finally.
//
// Uso: node --env-file=.env.local --import tsx scripts/smoke-individual-leaderboard.ts

import { createClient } from '@supabase/supabase-js'
import { fetchRondaLibreJugadoresConCourseHcp, fetchRondaLibreJugadores, fetchCourseHoles } from '../src/lib/data/tournaments/leaderboard'
import { buildLeaderboardFromRondaLibre } from '../src/golf/leaderboard/build-from-ronda-libre'
import { resolverCourseData, resolverCourseHandicap } from '../src/golf/core/course-handicap'
import { strokesRecibidosEnHoyo } from '../src/golf/core/scoring'
import type { TournamentLeaderboardContext } from '../src/golf/leaderboard/types'

const ORGANIZER = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const COURSE = '98318206-7adc-4963-91bb-e1fc46a554f3' // Olivos GC (azul 73/132)

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let failures = 0
function log(...a: unknown[]) { console.log('[smoke-indiv-lb]', ...a) }
function assert(cond: boolean, msg: string) {
  if (cond) { log(`  ✓ ${msg}`) } else { failures++; log(`  ✗ FALLA: ${msg}`) }
}

async function cleanup(tournamentId: string) {
  const { data: groups } = await supabase.from('tournament_groups').select('ronda_libre_id').eq('tournament_id', tournamentId)
  const rondaIds = (groups ?? []).map((g) => g.ronda_libre_id).filter(Boolean) as string[]
  for (const rid of rondaIds) await supabase.from('ronda_libre_jugadores').delete().eq('ronda_id', rid)
  await supabase.from('tournament_groups').delete().eq('tournament_id', tournamentId)
  for (const rid of rondaIds) await supabase.from('rondas_libres').delete().eq('id', rid)
  await supabase.from('tournaments').delete().eq('id', tournamentId)
}

async function main() {
  log('── LEADERBOARD INDIVIDUAL · neto con course handicap por tee ──')
  const slug = 'smoke-indiv-lb-tmp'
  const { data: prev } = await supabase.from('tournaments').select('id').eq('slug', slug)
  for (const p of prev ?? []) await cleanup(p.id)

  const holes = await fetchCourseHoles(supabase, COURSE)
  const parTotal = Array.from(new Map(holes.map((h) => [h.numero, h.par])).values()).reduce((s, p) => s + p, 0)
  const seeded = holes.slice(0, 9)
  const INDEX = 10

  // Course handicap esperado (tee azul) — el MISMO resolver que usa el scorer.
  const cd = await resolverCourseData(supabase, COURSE, 'azul', 18, parTotal, null)
  const courseHcpEsperado = resolverCourseHandicap(INDEX, cd)
  log(`  índice ${INDEX} en azul (CR ${cd?.courseRating}/${cd?.slope}) → course handicap ${courseHcpEsperado}`)
  assert(courseHcpEsperado !== INDEX, `course handicap (${courseHcpEsperado}) ≠ índice (${INDEX}) — cancha no estándar, hay divergencia que tapar`)

  let tournamentId = ''
  try {
    const { data: tour } = await supabase.from('tournaments').insert({
      name: 'SMOKE indiv lb', slug, organizer_id: ORGANIZER, date_start: '2026-06-05',
      format: 'stroke_play', formato_juego: 'stroke_play', modo_juego: 'neto',
      course_id: COURSE, hole_count: 18, status: 'in_progress',
    }).select('id').single()
    tournamentId = tour!.id

    const { data: ronda } = await supabase.from('rondas_libres').insert({
      codigo: 'SMKIL' + tournamentId.slice(0, 4).toUpperCase(), creador_id: ORGANIZER,
      course_id: COURSE, course_name: 'Olivos', tees: 'azul', holes: 18,
      fecha: '2026-06-05', estado: 'en_curso', formato_juego: 'stroke_play',
    }).select('id').single()
    const rondaId = ronda!.id

    await supabase.from('tournament_groups').insert({
      tournament_id: tournamentId, name: 'Grupo 1', ronda_libre_id: rondaId, sort_order: 0,
    })

    // Jugador individual: índice 10 (lo que guarda el productor), tee azul, 9 hoyos al par+1.
    const scores: Record<string, number> = {}
    for (const h of seeded) scores[String(h.numero)] = h.par + 1
    await supabase.from('ronda_libre_jugadores').insert({
      ronda_id: rondaId, nombre: 'SMOKE Jugador', handicap: INDEX, scores, tees: 'azul', user_id: null,
    })

    // ── Consumidor REAL con el fix ──
    const jugadores = await fetchRondaLibreJugadoresConCourseHcp(supabase, [rondaId], COURSE, 18, parTotal)
    assert(jugadores.length === 1, `fetch trae 1 jugador (${jugadores.length})`)
    assert(jugadores[0].handicap === courseHcpEsperado, `handicap resuelto a course handicap ${courseHcpEsperado} (obtuvo ${jugadores[0].handicap}), NO el índice`)

    // Neto manual con COURSE handicap (lo que ve la tarjeta) vs con índice crudo (el bug).
    const netoCon = (hcp: number) => seeded.reduce((sum, h) => {
      const si = holes.find((x) => x.numero === h.numero)!.stroke_index
      return sum + ((h.par + 1) - strokesRecibidosEnHoyo(hcp, si))
    }, 0)
    const netoCourse = netoCon(courseHcpEsperado)
    const netoIndice = netoCon(INDEX)
    log(`  neto esperado(course hcp)=${netoCourse} | neto que daba el bug(índice)=${netoIndice}`)
    assert(netoCourse !== netoIndice, `el neto correcto (${netoCourse}) difiere del que daba el índice crudo (${netoIndice}) → el fix corrige una diferencia real`)

    // El builder consume el handicap ya resuelto: con el fix usa course handicap.
    const ctx: TournamentLeaderboardContext = {
      parTotal, totalHoyos: 18, modoJuego: 'neto', formatoJuego: 'stroke_play', courseHoles: holes,
    }
    const board = buildLeaderboardFromRondaLibre(jugadores, ctx).playersByNeto
    assert(board.length === 1, 'el builder produce el ranking neto sin crashear')

    await cleanup(tournamentId)
    log('  🧹 cadena borrada')
  } catch (e) {
    if (tournamentId) await cleanup(tournamentId)
    throw e
  }

  log(failures === 0 ? '✅ LEADERBOARD INDIVIDUAL neto OK (course handicap)' : `❌ ${failures} aserción(es) fallaron`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => { console.error('[smoke-indiv-lb] ERROR', e); process.exit(1) })
