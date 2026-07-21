// Gate del live scorer (post-#269) — verificación OBJETIVA del course handicap
// contra la data REAL sembrada en prod por `scripts/seed-gate-scorer.mjs`.
//
// Por qué existe: el gate del scorer es "recorrer las pantallas y confirmar que
// los P0 aguantan". El walk visual está bloqueado (scorer auth-gated, sin creds
// browse/E2E), pero la CORRECTITUD que esas pantallas mostrarían se computa con
// UNA fuente canónica: `resolverCourseData` + `resolverCourseHandicap`
// (leaderboard.ts:203 y el scorer en cancha llaman EXACTAMENTE estas funciones).
// Correrlas sobre la data seedeada es la verificación fiel del número que Juanjo
// va a ver — sin browser, sin gasto de Máquina de Verdad.
//
// Cubre P0-5 (handicap 9h partido a la mitad) + tee-por-jugador. Read-only: no
// escribe ni borra nada en prod.
//
// Correr: npm run test:integration   (skipea sin SUPABASE_SERVICE_ROLE_KEY,
// así que el `vitest run` de pre-push lo saltea limpio).

import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  resolverCourseData,
  resolverCourseHandicap,
  type CourseData,
} from '@/golf/core/course-handicap'
import {
  fetchCourseHoles,
  sumParDedupByHole,
  buildFallbackCourseHoles,
} from '@/lib/data/tournaments/leaderboard'
import { calcularMatchPlay } from '@/golf/formats/match-play'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { generarOrdenHoyos } from '@/lib/ronda/helpers'
import { fetchScrambleTeams, fetchBestBallTeams } from '@/lib/data/tournaments/teamLeaderboard'
import {
  computeScrambleStandings,
  computeFoursomeStandings,
  computeBestBallStandings,
} from '@/golf/leaderboard/team-standings'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

interface SeededPlayer {
  player_name: string
  handicap_at_registration: number | null
  tees: string | null
}

interface SeededTournament {
  id: string
  slug: string
  hole_count: number | null
  course_id: string
  format: string
}

// Tipos exactos que esperan las funciones canónicas (evita el mismatch de
// genéricos entre el cliente createClient() de este test y el tipado interno).
type HolesClient = Parameters<typeof fetchCourseHoles>[0]
type CourseDataClient = Parameters<typeof resolverCourseData>[0]

// Resuelve, para un torneo sembrado, el CH por jugador con la MISMA cadena que
// el board público. Devuelve filas listas para imprimir + asertar.
async function resolverGate(
  supabase: CourseDataClient,
  slug: string,
) {
  const { data, error } = await supabase
    .from('tournaments')
    .select('id, slug, hole_count, course_id, format')
    .eq('slug', slug)
    .single()
  const t = data as SeededTournament | null
  if (error || !t) throw new Error(`torneo ${slug} no encontrado: ${error?.message}`)

  const courseId = t.course_id
  const holeCount = t.hole_count ?? 18

  // parTotal = suma del par real por hoyo deduplicado (idéntico al board).
  const holes = await fetchCourseHoles(supabase as unknown as HolesClient, courseId)
  const courseHoles = holes.length > 0 ? holes : buildFallbackCourseHoles(holeCount)
  const parTotal = sumParDedupByHole(courseHoles)

  const { data: players } = await supabase
    .from('players')
    .select('player_name, handicap_at_registration, tees')
    .eq('tournament_id', t.id)
    .in('status', ['pending', 'approved', 'waitlist'])

  const cache = new Map<string, CourseData | null>()
  const rows = []
  for (const p of (players ?? []) as SeededPlayer[]) {
    const index = p.handicap_at_registration ?? 0
    const tee = (p.tees || 'azul').toLowerCase()

    const key = `${courseId}|${tee}|${holeCount}`
    if (!cache.has(key)) {
      cache.set(key, await resolverCourseData(supabase, courseId, tee, holeCount, parTotal, null))
    }
    const courseData = cache.get(key) ?? null

    // CH de SCORING: la función canónica que el scorer en cancha (getDotHcp de
    // score-grupo) y el board (leaderboard.ts:203) usan para repartir golpes.
    // Motor A (torneos) NO usa el HCP de "display" 18h — ese path es de motor B.
    const ch = resolverCourseHandicap(index, courseData)
    // Contrafactual: el MISMO cálculo sin partir el índice = el bug de 2× golpes.
    const chSiFuera18h = resolverCourseHandicap(index, courseData ? { ...courseData, is9Hole: false } : null)

    rows.push({
      name: p.player_name?.trim(),
      index,
      tee,
      is9Hole: !!courseData?.is9Hole,
      slope: courseData?.slope,
      cr: courseData?.courseRating,
      par: courseData?.par,
      ch,
      chSiFuera18h,
    })
  }
  return { holeCount, format: t.format as string, parTotal, rows }
}

describe('Gate scorer — course handicap sobre data real de prod (P0-5 + tee-por-jugador)', () => {
  // Sin creds (ej. `vitest run` de pre-push): registra UN test skipped para que el
  // archivo no quede con cero tests (vitest lo marcaría "failed / no tests").
  if (!supabaseUrl || !supabaseKey) {
    it.skip('skipped: sin SUPABASE_SERVICE_ROLE_KEY (correr con npm run test:integration)', () => {})
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  }) as unknown as CourseDataClient

  it('T1 · 9 hoyos individual — el índice se parte a la mitad (P0-5, no 2× golpes)', async () => {
    const { holeCount, rows } = await resolverGate(supabase, 'gate-scorer-9h-individual')
    expect(holeCount).toBe(9)
    expect(rows.length).toBeGreaterThanOrEqual(4)

    // eslint-disable-next-line no-console
    console.log('\n=== T1 · 9h individual (P0-5) ===')
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${r.name.padEnd(16)} idx=${String(r.index).padStart(4)} tee=${(r.tee).padEnd(7)}` +
          ` is9Hole=${r.is9Hole} slope=${r.slope} CR=${r.cr} par=${r.par}` +
          ` → CH(9h)=${r.ch}  [si NO se partiera (bug 2×)=${r.chSiFuera18h}]`,
      )
    }

    for (const r of rows) {
      // El flag que la ausencia del cual causaba el 2× de golpes.
      expect(r.is9Hole, `${r.name} debe puntuar como 9h`).toBe(true)

      if (r.index > 0) {
        // El CH de 9h SIEMPRE es menor que el mismo cálculo sin partir (2× bug).
        expect(r.ch, `${r.name}: CH 9h debe ser < CH sin partir`).toBeLessThan(r.chSiFuera18h)
        // Y a lo sumo ~la mitad del índice (banda 9h sana), nunca ~el índice completo.
        expect(r.ch, `${r.name}: CH 9h no puede acercarse al índice completo`).toBeLessThanOrEqual(
          Math.round(r.index / 2) + 3,
        )
      }
    }

    // Paty (índice 30) es el caso canónico del bug: recibía ~30 golpes, debe recibir ~15.
    const paty = rows.find((r) => r.name.startsWith('Paty'))
    expect(paty, 'Paty Demo debe existir en el seed').toBeTruthy()
    expect(paty!.ch, 'Paty idx30: CH 9h debe estar en banda ~13-18, jamás ~30').toBeLessThanOrEqual(18)
    expect(paty!.ch).toBeGreaterThan(8)
  })

  it('T3 · 18 hoyos mixto — CH completo (no 9h) y tee-por-jugador', async () => {
    const { holeCount, rows } = await resolverGate(supabase, 'gate-scorer-18h-mixto')
    expect(holeCount).toBe(18)

    // eslint-disable-next-line no-console
    console.log('\n=== T3 · 18h mixto (SI norm + tee-por-jugador) ===')
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(
        `  ${r.name.padEnd(16)} idx=${String(r.index).padStart(4)} tee=${(r.tee).padEnd(7)}` +
          ` is9Hole=${r.is9Hole} slope=${r.slope} CR=${r.cr} → CH(18h)=${r.ch}`,
      )
    }

    for (const r of rows) {
      // Ronda de 18h: NO se parte el índice.
      expect(r.is9Hole, `${r.name} NO debe puntuar como 9h`).toBe(false)
      if (r.index > 0) {
        // CH 18h razonable: dentro de ±10 del índice (slope/CR realistas).
        expect(Math.abs(r.ch - Math.round(r.index)), `${r.name}: CH 18h fuera de banda`).toBeLessThanOrEqual(10)
      }
    }

    // Monotonía: más índice → más CH (mismo o mayor). Elena(36) > Andrés(6).
    const elena = rows.find((r) => r.name.startsWith('Elena'))
    const andres = rows.find((r) => r.name.startsWith('Andrés') || r.name.startsWith('Andres'))
    if (elena && andres) {
      expect(elena.ch, 'Elena(36) debe tener más CH que Andrés(6)').toBeGreaterThan(andres.ch)
    }
  })

  it('T2 · match play 18h — holes-won con SI normalizado (P0-2), no el crudo', async () => {
    const { holeCount, format, rows } = await resolverGate(supabase, 'gate-scorer-matchplay-18h')
    expect(holeCount).toBe(18)
    expect(format).toBe('match_play')

    const chA = rows.find((r) => r.name.startsWith('Retador A'))
    const chB = rows.find((r) => r.name.startsWith('Retador B'))
    expect(chA && chB, 'ambos retadores deben existir').toBeTruthy()

    // Cancha + SI + scores reales del seed (la MISMA cadena que la pantalla).
    const { data: t } = await supabase
      .from('tournaments')
      .select('id, course_id')
      .eq('slug', 'gate-scorer-matchplay-18h')
      .single()
    const tt = t as { id: string; course_id: string }
    const holes = await fetchCourseHoles(supabase as unknown as HolesClient, tt.course_id)
    const holesTyped = holes as Array<{ numero: number; par: number; stroke_index: number }>

    // scores por jugador: players → rounds → hole_scores.
    async function scoresDe(nombreStartsWith: string): Promise<Record<string, number>> {
      const { data: pl } = await supabase
        .from('players')
        .select('id, player_name')
        .eq('tournament_id', tt.id)
      const player = ((pl ?? []) as Array<{ id: string; player_name: string }>).find((p) =>
        p.player_name?.trim().startsWith(nombreStartsWith),
      )
      if (!player) return {}
      const { data: rnd } = await supabase.from('rounds').select('id').eq('player_id', player.id).single()
      const roundId = (rnd as { id: string } | null)?.id
      if (!roundId) return {}
      const { data: hs } = await supabase
        .from('hole_scores')
        .select('hole_number, gross_score')
        .eq('round_id', roundId)
      const out: Record<string, number> = {}
      for (const s of (hs ?? []) as Array<{ hole_number: number; gross_score: number | null }>) {
        if (s.gross_score != null) out[String(s.hole_number)] = s.gross_score
      }
      return out
    }

    const scoresA = await scoresDe('Retador A')
    const scoresB = await scoresDe('Retador B')
    expect(Object.keys(scoresA).length, 'Retador A debe tener scores').toBe(18)
    expect(Object.keys(scoresB).length, 'Retador B debe tener scores').toBe(18)

    const result = calcularMatchPlay(scoresA, scoresB, holesTyped, {
      courseHandicapA: chA!.ch,
      courseHandicapB: chB!.ch,
      totalHoles: 18,
      modo: 'neto',
    })

    // El SI normalizado que P0-2 obliga a usar: debe ser una permutación 1..18
    // (el bug repartía golpes con el SI CRUDO, que podía tener huecos/dups).
    const siAlloc = normalizedStrokeIndexByHole(holesTyped, 18)
    const siVals = Object.values(siAlloc).sort((a, b) => a - b)

    // eslint-disable-next-line no-console
    console.log('\n=== T2 · match play 18h (P0-2) ===')
    // eslint-disable-next-line no-console
    console.log(`  CH: A(idx${chA!.index})=${chA!.ch}  B(idx${chB!.index})=${chB!.ch}  → diff=${Math.abs(chA!.ch - chB!.ch)}`)
    // eslint-disable-next-line no-console
    console.log(`  resultado: ${result.display} | ganados A=${result.holesWonA} B=${result.holesWonB} halved=${result.holesHalved} | winner=${result.winner}`)
    // eslint-disable-next-line no-console
    console.log(`  SI normalizado (siAlloc) = permutación 1..18? min=${siVals[0]} max=${siVals[siVals.length - 1]} n=${siVals.length}`)

    // P0-2 core: la asignación de golpes usa un SI que es permutación completa 1..18.
    expect(siVals, 'siAlloc debe cubrir 18 hoyos').toHaveLength(18)
    expect(siVals[0], 'siAlloc empieza en 1').toBe(1)
    expect(siVals[siVals.length - 1], 'siAlloc termina en 18').toBe(18)
    expect(new Set(siVals).size, 'siAlloc sin duplicados').toBe(18)

    // El match cierra coherente: los hoyos se particionan sin perderse ninguno.
    expect(result.holesWonA + result.holesWonB + result.holesHalved).toBe(result.holesPlayed)
    // Retador A se sembró decisivamente mejor (delta −1 vs +1) → gana el match.
    expect(result.holesWonA, 'A ganó más hoyos que B').toBeGreaterThan(result.holesWonB)
    expect(result.winner, 'winner debe ser A').toBe('a')
  })
})

// ─── Batch 2 · formatos por equipo (best_ball / scramble / foursome) ─────────
// Corre la MISMA cadena que el board público: fetchXTeams (motor B, rondas_libres
// + ronda_equipos) → computeXStandings. Verifica que los boards de equipo salen
// coherentes, ordenados y con el team handicap aplicado sobre la data seedeada.
describe('Gate scorer — formatos por equipo sobre batch 2 (best_ball / scramble / foursome)', () => {
  if (!supabaseUrl || !supabaseKey) {
    it.skip('skipped: sin SUPABASE_SERVICE_ROLE_KEY (correr con npm run test:integration)', () => {})
    return
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  }) as unknown as CourseDataClient

  interface TeamTournamentCtx {
    id: string
    holeCount: number
    modo: ModoJuego
    formato: FormatoJuego
    holes: Awaited<ReturnType<typeof fetchCourseHoles>>
    parTotal: number
  }

  async function ctxDe(slug: string): Promise<TeamTournamentCtx> {
    const { data, error } = await supabase
      .from('tournaments')
      .select('id, hole_count, course_id, modo_juego, formato_juego')
      .eq('slug', slug)
      .single()
    if (error || !data) throw new Error(`torneo ${slug} no encontrado: ${error?.message}`)
    const t = data as {
      id: string
      hole_count: number | null
      course_id: string
      modo_juego: string | null
      formato_juego: string | null
    }
    const holes = await fetchCourseHoles(supabase as unknown as HolesClient, t.course_id)
    return {
      id: t.id,
      holeCount: t.hole_count ?? 18,
      modo: (t.modo_juego ?? 'neto') as ModoJuego,
      formato: (t.formato_juego ?? 'best_ball') as FormatoJuego,
      holes,
      parTotal: sumParDedupByHole(holes),
    }
  }

  // Aserciones comunes a un board de equipos neto: equipos presentes, hoyos
  // jugados, handicap aplicado (neto ≤ gross) y orden best-first por neto.
  function asertarBoardNeto(
    label: string,
    standings: Array<{ teamNombre: string; totalGross: number; totalNeto: number; holesPlayed: number; overUnderNeto: number }>,
    nEsperado: number,
    holeCount: number,
  ) {
    // eslint-disable-next-line no-console
    console.log(`\n=== ${label} ===`)
    for (const s of standings) {
      // eslint-disable-next-line no-console
      console.log(`  ${s.teamNombre.padEnd(14)} gross=${s.totalGross} neto=${s.totalNeto} jugados=${s.holesPlayed} vsPar(neto)=${s.overUnderNeto}`)
    }
    expect(standings.length, `${label}: nº de equipos`).toBe(nEsperado)
    for (const s of standings) {
      expect(s.holesPlayed, `${s.teamNombre}: hoyos jugados`).toBe(holeCount)
      expect(s.totalNeto, `${s.teamNombre}: neto > 0`).toBeGreaterThan(0)
      expect(s.totalNeto, `${s.teamNombre}: neto ≤ gross (handicap aplicado)`).toBeLessThanOrEqual(s.totalGross)
    }
    // Ordenado best-first: neto vs par no decreciente.
    for (let i = 1; i < standings.length; i++) {
      expect(standings[i].overUnderNeto, `${label}: orden best-first`).toBeGreaterThanOrEqual(standings[i - 1].overUnderNeto)
    }
  }

  it('best_ball — mejor bola neta por hoyo, board ordenado y con handicap', async () => {
    const c = await ctxDe('gate-scorer-bestball')
    const { teams } = await fetchBestBallTeams(supabase as never, c.id, c.parTotal)
    expect(teams.length, 'equipos best_ball seedeados').toBeGreaterThanOrEqual(2)
    const standings = computeBestBallStandings(teams, c.holes, c.parTotal, c.formato, c.modo, c.holeCount)
    asertarBoardNeto('best_ball', standings, teams.length, c.holeCount)
  })

  it('scramble — bola compartida, team handicap USGA aplicado', async () => {
    const c = await ctxDe('gate-scorer-scramble')
    const { teams } = await fetchScrambleTeams(supabase as never, c.id)
    expect(teams.length, 'equipos scramble seedeados').toBeGreaterThanOrEqual(2)
    const standings = computeScrambleStandings(teams, c.holes, c.parTotal, c.formato, c.modo, c.holeCount)
    asertarBoardNeto('scramble', standings, teams.length, c.holeCount)
  })

  it('foursome — bola compartida alterna, team handicap (A+B)/2', async () => {
    const c = await ctxDe('gate-scorer-foursome')
    const { teams, memberNames } = await fetchScrambleTeams(supabase as never, c.id)
    expect(teams.length, 'equipos foursome seedeados').toBeGreaterThanOrEqual(2)
    const standings = computeFoursomeStandings(teams, memberNames, c.holes, c.parTotal, c.formato, c.modo, c.holeCount)
    asertarBoardNeto('foursome', standings, teams.length, c.holeCount)
  })
})

// ─── P0-1 · orden de hoyos back-9 (generarOrdenHoyos) ────────────────────────
// Función PURA → corre siempre (no depende de prod), regresión permanente.
// Bug: `generarOrdenHoyos` wrappeaba sobre los hoyos JUGADOS (9) en vez del
// tamaño de cancha (18), así una ronda que empieza en el hoyo 10 mapeaba a
// [1,2,3,…] en vez de [10,11,…,18]. Cubre el back-9 del batch 2 (ronda GATEB2BN,
// hoyo_inicio=10). Ver [[reference_stroke_index_permutacion_net]].
describe('Gate scorer — P0-1 orden de hoyos back-9 (generarOrdenHoyos)', () => {
  it('ronda 9h con hoyoInicio=10 mapea a [10..18], no wrappea sobre hoyos jugados', () => {
    expect(generarOrdenHoyos(10, 9, 18)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
  })

  it('front-9 (hoyoInicio=1) sigue siendo [1..9]', () => {
    expect(generarOrdenHoyos(1, 9, 18)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('18h completa desde el hoyo 1 = [1..18]', () => {
    expect(generarOrdenHoyos(1, 18, 18)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1))
  })

  it('shotgun: hoyoInicio=16, 18 hoyos → wrap correcto 16-18 luego 1-15', () => {
    expect(generarOrdenHoyos(16, 18, 18)).toEqual([16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
  })

  it('regresión: el bug (courseHoles = hoyos jugados = 9) NO produce [10..18]', () => {
    // Con el default viejo (wrap sobre 9) hoyoInicio=10 daba [1,2,…], no el back-9.
    expect(generarOrdenHoyos(10, 9, 9)).not.toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18])
  })
})
