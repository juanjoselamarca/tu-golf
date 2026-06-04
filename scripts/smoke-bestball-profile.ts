// Smoke de la CAPA 2 de best_ball: cómo le pega la ronda al PERFIL de cada jugador.
//
// El leaderboard del campeonato (capa 1) ya está cubierto por smoke-team-bestball.
// Esto verifica la otra mitad: cuando un jugador FINALIZA una ronda best_ball, su
// `historical_round` individual queda bien y aparece en su historial/índice.
//
// Reproduce EXACTO el insert de finalización de score-grupo/page.tsx:636-651 (best_ball
// usa el path INDIVIDUAL: isTeamSharedScore=['scramble','foursome'] NO incluye best_ball,
// así que cada jugador postea su propia tarjeta gross + diferencial WHS), corre el RPC
// real `calcular_indice_golfers`, y lee de vuelta con la MISMA query que usa el historial
// (useHistorialRounds) + el MISMO `formatLabel`. Usa el usuario dev y RESTAURA su perfil
// (borra la ronda + recomputa índice) en finally.
//
// Uso: node --env-file=.env.local --import tsx scripts/smoke-bestball-profile.ts

import { createClient } from '@supabase/supabase-js'
import { calcularDiferencial } from '../src/lib/indice-golfers'
import { formatLabel } from '../src/golf/core/rules'
import { fetchCourseHoles } from '../src/lib/data/tournaments/leaderboard'

const DEV_USER = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const COURSE = '8fb8c2ce-a8ec-4938-bc05-e77e2dcb2281' // Club de Golf La Dehesa (CR 70.9, slope 124, 18h)

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
let failures = 0
function log(...a: unknown[]) { console.log('[smoke-bb-profile]', ...a) }
function assert(cond: boolean, msg: string) {
  if (cond) { log(`  ✓ ${msg}`) } else { failures++; log(`  ✗ FALLA: ${msg}`) }
}

async function main() {
  log('── BEST_BALL · CAPA 2 (perfil del jugador) ──')

  // Estado previo del perfil (para restaurar).
  const { data: before } = await supabase.from('profiles').select('indice, nivel').eq('id', DEV_USER).single()
  log(`  perfil antes: indice=${before?.indice} nivel=${before?.nivel}`)

  // slope/CR: tee blanco → fallback courses (igual que la finalización).
  let slope: number | null = null, cr: number | null = null
  const { data: tee } = await supabase.from('course_tees')
    .select('rating, slope').eq('course_id', COURSE).ilike('nombre', 'blanco%').limit(1).maybeSingle()
  if (tee?.rating && tee?.slope) { cr = tee.rating; slope = tee.slope }
  if (!slope || !cr) {
    const { data: c } = await supabase.from('courses').select('slope_rating, course_rating').eq('id', COURSE).single()
    slope = slope ?? c?.slope_rating ?? null; cr = cr ?? c?.course_rating ?? null
  }
  assert(slope != null && cr != null, `slope/CR de la cancha disponibles (slope=${slope} cr=${cr})`)

  // Tarjeta individual del jugador en una ronda best_ball: 9 hoyos.
  const holes = await fetchCourseHoles(supabase, COURSE)
  const first9 = (holes.length > 0 ? holes : Array.from({ length: 9 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))).slice(0, 9)
  const scoresArray = first9.map((h) => h.par) // juega al par cada hoyo
  const grossTotal = scoresArray.reduce((a, b) => a + b, 0)
  const holesPlayed = scoresArray.length
  const diferencial = (slope && cr && holesPlayed >= 9)
    ? calcularDiferencial(grossTotal, cr, slope, holesPlayed, null)
    : null
  assert(diferencial != null, `diferencial WHS calculado (${diferencial})`)

  let insertedId = ''
  try {
    // ── Insert IDÉNTICO a la finalización (score-grupo:636-651) ──
    const { data: ins, error: insErr } = await supabase.from('historical_rounds').insert({
      user_id: DEV_USER,
      course_name: 'SMOKE BB PROFILE',
      course_id: COURSE,
      played_at: '2026-06-03',
      total_gross: grossTotal,
      scores: scoresArray,
      holes_played: holesPlayed,
      tee_color: 'blanco',
      privacy: 'private',
      slope_rating: slope,
      course_rating: cr,
      diferencial,
      formato_juego: 'best_ball',
      modo_juego: 'neto',
    }).select('id').single()
    if (insErr) throw insErr
    insertedId = ins!.id
    assert(!!insertedId, 'historical_round del jugador creado')

    // ── RPC real de recálculo de índice (igual que la finalización) ──
    const { error: rpcErr } = await supabase.rpc('calcular_indice_golfers', { p_user_id: DEV_USER })
    assert(!rpcErr, `RPC calcular_indice_golfers corre sin error${rpcErr ? ` (${rpcErr.message})` : ''}`)

    // ── Lectura por el MISMO shape que el historial (useHistorialRounds) ──
    const { data: rows, error: readErr } = await supabase
      .from('historical_rounds')
      .select('id, course_name, total_gross, holes_played, played_at, diferencial, scores, formato_juego, modo_juego')
      .eq('user_id', DEV_USER)
      .order('played_at', { ascending: false })
    assert(!readErr, 'historial del jugador legible')
    const round = (rows ?? []).find((r) => r.id === insertedId)
    assert(!!round, 'la ronda best_ball aparece en el historial del jugador')
    if (round) {
      assert(round.formato_juego === 'best_ball', `formato_juego persistido = best_ball (${round.formato_juego})`)
      // El usuario ve el formato + modo en el badge del historial (formatLabel).
      const label = formatLabel(round.formato_juego, round.modo_juego)
      assert(label.startsWith('Best Ball'), `formatLabel arranca con "Best Ball" (lo que ve el usuario: "${label}")`)
      assert(round.total_gross === grossTotal, `gross individual correcto (${round.total_gross})`)
      assert(Array.isArray(round.scores) && (round.scores as number[]).length === 9, `scores individuales por hoyo (${(round.scores as number[])?.length})`)
      assert(round.diferencial != null, `diferencial guardado para el índice (${round.diferencial})`)
    }

    // El índice se recomputó incluyendo esta ronda (puede o no cambiar según las 20 mejores;
    // basta confirmar que el RPC corrió y el perfil sigue válido).
    const { data: mid } = await supabase.from('profiles').select('indice, nivel').eq('id', DEV_USER).single()
    log(`  perfil con la ronda: indice=${mid?.indice} nivel=${mid?.nivel}`)
    assert(mid?.indice != null, 'índice del perfil sigue siendo un número válido tras la ronda best_ball')
  } finally {
    // ── Restaurar el perfil del dev: borrar la ronda + recomputar índice ──
    if (insertedId) await supabase.from('historical_rounds').delete().eq('id', insertedId)
    await supabase.rpc('calcular_indice_golfers', { p_user_id: DEV_USER })
    const { data: after } = await supabase.from('profiles').select('indice, nivel').eq('id', DEV_USER).single()
    log(`  perfil restaurado: indice=${after?.indice} nivel=${after?.nivel}`)
    if (after?.indice !== before?.indice) {
      failures++
      log(`  ✗ FALLA: el índice NO se restauró (antes ${before?.indice}, ahora ${after?.indice})`)
    } else {
      log('  ↺ índice del dev restaurado a su valor original')
    }
  }

  log(failures === 0 ? '✅ CAPA 2 (perfil) OK' : `❌ ${failures} aserción(es) fallaron`)
  if (failures > 0) process.exit(1)
}

main().catch((e) => { console.error('[smoke-bb-profile] ERROR', e); process.exit(1) })
