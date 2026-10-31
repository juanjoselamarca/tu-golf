/**
 * Game actions — lógica de negocio extraída de /api/game/route.ts
 *
 * Cada función es una acción independiente que recibe el contexto
 * necesario (user, body, supabase clients) y retorna un NextResponse.
 *
 * Esto permite:
 * 1. Rutas RESTful nuevas que llaman directamente a la acción
 * 2. /api/game como proxy backward-compatible (transición gradual)
 * 3. Testing independiente de cada acción
 */

import { isUuid } from '@/lib/uuid'
import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { puntajeDeHoyo, courseHandicapDeScoring } from '@/golf/core/hole-scoring'
import { handicapInscrito } from '@/golf/core/compute-player-course-hcp'
import { hoyosDeLaVuelta, PAR_FALLBACK } from '@/golf/courses/vueltas'
import {
  fetchLegacyHcpContext,
  type Client as LeaderboardClient,
} from '@/lib/data/tournaments/leaderboard'
import { guardarRondaDeTorneoEnHistorial } from '@/lib/data/tournaments/historial-torneo'
import { openTournament, revertToDraft, closeTournament, reopenTournament } from '@/lib/data/tournaments/lifecycle'
import { fetchRoundPlayConfig } from '@/lib/data/tournaments/rounds'
import { CLOSED_ROUND_STATUSES_IN, esTarjetaCerrada } from '@/golf/tournament-rounds'

function captureGameError(action: string, error: unknown, extra?: Record<string, unknown>) {
  void captureError(error, {
    context: `game-engine.${action}`,
    level: 'error',
    meta: extra,
  })
}

type Svc = SupabaseClient

// ═══════════════════════════════════════════════════════════
// UPSERT SCORE
// ═══════════════════════════════════════════════════════════

/**
 * Tope de putts por hoyo. No es una regla de golf (no hay máximo), es el tope
 * del dato: `gross_score` ya no puede pasar de 19, así que 19 putts es el techo
 * aritmético de un hoyo. Existe porque `putts` entraba a la tabla sin mirar y
 * alimenta las estadísticas de Mi Golf y del coach: un `99999` o un `2.5`
 * tipeados por un cliente roto (o a mano) corrompían el promedio de putts del
 * jugador para siempre, sin error visible en ninguna pantalla.
 */
const MAX_PUTTS_POR_HOYO = 19

function validateScoreInputs(body: Record<string, unknown>): string | null {
  const { round_id, hole_number, gross_score, par, putts, fairway_hit, gir } = body
  if (!isUuid(round_id))
    return 'round_id inválido'
  if (!Number.isInteger(hole_number) || (hole_number as number) < 1 || (hole_number as number) > 18)
    return 'hole_number debe ser entero entre 1 y 18'
  if (gross_score !== null && gross_score !== undefined) {
    if (!Number.isInteger(gross_score) || (gross_score as number) < 1 || (gross_score as number) > 19)
      return 'El score debe ser entre 1 y 19'
  }
  if (par !== undefined && (!Number.isInteger(par) || (par as number) < 3 || (par as number) > 5))
    return 'El par debe ser 3, 4 o 5'
  if (putts !== null && putts !== undefined) {
    if (!Number.isInteger(putts) || (putts as number) < 0 || (putts as number) > MAX_PUTTS_POR_HOYO)
      return `Los putts deben ser un entero entre 0 y ${MAX_PUTTS_POR_HOYO}`
  }
  // `fairway_hit` y `gir` son booleanos en la tabla: un string los hacía reventar
  // con un 500 de Postgres en vez de un 400 que el scorer sabe mostrar.
  if (fairway_hit !== null && fairway_hit !== undefined && typeof fairway_hit !== 'boolean')
    return 'fairway_hit debe ser booleano'
  if (gir !== null && gir !== undefined && typeof gir !== 'boolean')
    return 'gir debe ser booleano'
  return null
}

export async function upsertScore(
  svc: Svc, userId: string | null, body: Record<string, unknown>
): Promise<NextResponse> {
  const validationError = validateScoreInputs(body)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })
  const { round_id, hole_number, par, gross_score, putts, fairway_hit, gir } = body

  const { data: roundCheck } = await svc.from('rounds').select('status').eq('id', round_id).single()
  if (esTarjetaCerrada(roundCheck?.status)) {
    // `code` es lo que lee el scorer del jugador: un 409 por ronda cerrada se
    // trata distinto de un 409 por torneo inactivo (route.ts).
    return NextResponse.json(
      { error: 'La ronda ya está finalizada. No se pueden registrar scores.', code: 'round_closed' },
      { status: 409 },
    )
  }

  // El neto y los puntos NO se leen del body: los deriva el servidor.
  //
  // Los dos scorers (organizador y jugador) los calculan en el navegador y los
  // mandaban en el POST, y este endpoint los persistía tal cual. Eso dejaba
  // `hole_scores.net_score`/`points` y los totales de `rounds` a merced del
  // cliente: con la anon key, su propio JWT y un `fetch` a mano, el jugador de
  // un torneo escribía el neto que quisiera sobre su propia tarjeta (la
  // autorización de más arriba la pasa: es SU ronda). El leaderboard se salvaba
  // sólo porque desde el 03-sep deriva todo del bruto (`build-from-legacy`), no
  // porque el dato guardado fuera confiable: las pantallas que SÍ leen la
  // columna (admin, GWI del torneo, resumen del scorer) y las estadísticas se
  // comían el número inventado.
  //
  // La derivación ya existía como fallback para los callers que mandan sólo el
  // bruto (el "deshacer" y el guardado de putts/fairway/GIR) y usa la MISMA
  // función canónica que los dos scorers (`puntajeDeHoyo` sobre
  // `courseHandicapDeScoring`), así que el número no cambia: lo único que
  // cambia es quién lo firma. "Un concepto, una fuente": el bruto es lo único
  // que el cliente aporta.
  let net_score: number | null = null
  let points: number | null = null
  // El par también sale del catálogo de la cancha, nunca del body: con un par
  // inflado los puntos stableford derivados subían solos. Si el catálogo no
  // tiene el hoyo, se usa `PAR_FALLBACK` — el mismo `?? 4` de los dos scorers
  // (`hole?.par ?? 4`), no el número del cliente. El del body sólo sobrevive en
  // los caminos donde no se deriva nada (borrado o derivación caída), para no
  // cambiarle el comportamiento a un upsert que inserta la fila por primera vez:
  // `hole_scores.par` es NOT NULL sin default.
  let parDelCatalogo: number | undefined

  // Si la derivación falla, el BRUTO se guarda igual con neto y puntos en NULL:
  // en un torneo real no se pierde un golpe por un fallo transitorio de la base,
  // y el leaderboard deriva el neto del bruto. Antes esto devolvía 503, pero
  // entonces la derivación sólo corría en el camino de las estadísticas; ahora
  // corre en CADA save del scorer y un 503 ahí sería perder la tarjeta.
  let derivado = false
  try {
    if (gross_score != null) {
      // El `error` se mira: sin esto un fallo transitorio dejaba `rd` en null,
      // salteaba la derivación sin pasar por el catch y nadie se enteraba.
      const { data: roundData, error: roundErr } = await svc
        .from('rounds')
        .select('player_id, round_number, players(handicap_at_registration, tee_id, tournament_id, genero, categories(default_tee_color, gender))')
        .eq('id', round_id)
        .single()
      if (roundErr) throw roundErr
      const rd = roundData as unknown as {
        player_id: string
        round_number: number | null
        players: {
          handicap_at_registration: number | null
          tee_id: string | null
          tournament_id: string
          genero: string | null
          categories: { default_tee_color: string | null; gender: string | null } | null
        } | null
      } | null

      if (rd?.players) {
        // `handicapInscrito` es la fuente única de este `?? 0` y es la que usan
        // los dos scorers. El `?? 18` que vivía acá no se puede conservar ahora
        // que el servidor FIRMA el número: con un inscrito sin índice
        // (invitado, carga manual) el cliente mandaba CH 0 —neto = bruto— y un
        // 18 le regalaría un golpe por hoyo y ~18 puntos stableford en la vuelta.
        const hcp = handicapInscrito(rd.players)
        const tournId = rd.players.tournament_id
        const roundNumber = rd.round_number ?? 1
        // Esto corre en el camino caliente de escritura de CADA hoyo. La
        // cancha de LA RONDA se resuelve UNA vez (fuente única
        // `@/golf/tournament-rounds`) y se le pasa ya resuelta al contexto de
        // handicap: en un torneo multi-ronda la ronda 2 puede jugarse en otra
        // cancha, con otro slope/CR/par.
        const { data: chData } = await svc
          .from('tournaments')
          .select('id, hole_count, formato_juego, format, modo_juego, course_id, date_start, total_rounds')
          .eq('id', tournId)
          .single()
        const tournInfo = chData as unknown as {
          id: string
          hole_count: number | null
          formato_juego: string | null
          format: string | null
          modo_juego: string | null
          course_id: string | null
          date_start: string | null
          total_rounds: number | null
        } | null
        const ronda = tournInfo ? await fetchRoundPlayConfig(svc, tournInfo, roundNumber) : null
        const hcpCtx = await fetchLegacyHcpContext(svc as unknown as LeaderboardClient, tournId, ronda)
        const courseId = ronda?.courseId ?? undefined
        const roundHoles = ronda?.holeCount ?? 18

        // SI normalizado (permutación 1..N) para ALOCAR golpes: se traen TODOS los
        // hoyos del recorrido (1..roundHoles) y se normaliza, en vez de leer el SI
        // crudo de un solo hoyo. Garantiza que el neto persistido reparta EXACTAMENTE
        // el course handicap aunque el SI de catálogo sea 18h-impar en una ronda de 9h
        // (bug "net +12"). Fallback al SI crudo si no hay data → nunca peor que antes.
        let strokeIndex = hole_number as number
        let courseHoles: Array<{ numero: number; par: number; stroke_index: number }> = []
        if (courseId) {
          const { data: holeRows } = await svc
            .from('course_holes')
            .select('numero, par, stroke_index')
            .eq('course_id', courseId)
            .lte('numero', roundHoles)
          const rows =
            (holeRows as Array<{ numero: number; par: number; stroke_index: number }> | null) ?? []
          if (rows.length > 0) {
            courseHoles = hoyosDeLaVuelta(rows, roundHoles)
            // Sobre los hoyos de la VUELTA (ya expandidos), no sobre `rows`: una
            // cancha de 9 jugada a 18 (o un loop de 27) trae 9 filas, así que el
            // SI de los hoyos 10..18 no existía y caía a `hole_number`. Los dos
            // scorers alocan siempre sobre el expandido: con el crudo, el neto y
            // los puntos por hoyo salían distintos a los suyos.
            const siAlloc = normalizedStrokeIndexByHole(
              courseHoles.map((h) => ({ numero: h.numero, stroke_index: h.stroke_index })),
              roundHoles
            )
            strokeIndex = siAlloc[hole_number as number] ?? strokeIndex
            parDelCatalogo = courseHoles.find((h) => h.numero === hole_number)?.par ?? undefined
          }
        }

        // El MISMO gate que usan los dos scorers y el board: por eso derivar
        // siempre no cambia el número, sólo quién lo firma. Con el índice crudo,
        // marcar una estadística REESCRIBÍA el neto correcto que el scorer
        // acababa de persistir: en un torneo WHS el dato bueno se corrompía solo.
        const courseHcp = courseHandicapDeScoring({
          mode: hcpCtx.mode,
          player: {
            handicap_at_registration: hcp,
            tee_id: rd.players.tee_id ?? null,
            categories: rd.players.categories,
            genero: rd.players.genero,
          },
          tournament: { tees: hcpCtx.tees, courses: hcpCtx.course },
          courseTees: hcpCtx.courseTees,
          courseHoles,
          holeCount: roundHoles,
          hcpPct: hcpCtx.hcpPct,
        })

        const puntaje = puntajeDeHoyo({
          gross: gross_score as number,
          par: parDelCatalogo ?? PAR_FALLBACK,
          courseHandicap: courseHcp,
          strokeIndex,
          holeCount: roundHoles,
          formato: { formato_juego: tournInfo?.formato_juego, format: tournInfo?.format },
          // Stableford Gross: los puntos se cuentan contra el par, sin golpes.
          modo: tournInfo?.modo_juego,
        })

        net_score = puntaje.neto
        points = puntaje.puntos
        derivado = true
      }
    }
  } catch (err) {
    captureGameError('upsertScore.derivarNeto', err, { round_id, hole_number })
    // Sin 503: el golpe se guarda con neto y puntos en NULL (ver arriba). Lo que
    // NO se hace es caer al número del cliente.
    net_score = null
    points = null
  }

  const upsertData: Record<string, unknown> = {
    round_id, hole_number, gross_score,
    source: 'manual_organizer', status: 'loaded',
  }
  // El neto y los puntos se escriben si se derivaron, o si el golpe se está
  // BORRANDO (gross null → la fila queda sin puntaje, que es lo correcto). Si la
  // derivación se cayó, se OMITEN: en el `ON CONFLICT DO UPDATE` un null
  // borraría el neto bueno que ya estaba guardado —y `rounds.total_net` lo
  // volvería a sumar como 0, mostrando un neto mejor que el real.
  if (derivado || gross_score == null) {
    upsertData.net_score = net_score
    upsertData.points = points
  }
  // Mismo criterio para `par`: omitirlo deja intacta la columna (PostgREST sólo
  // pone en el `DO UPDATE SET` las columnas del payload).
  const parEfectivo = parDelCatalogo ?? (derivado ? PAR_FALLBACK : (par as number | undefined))
  if (parEfectivo !== undefined) upsertData.par = parEfectivo
  if (putts !== undefined && putts !== null) upsertData.putts = putts
  if (fairway_hit !== undefined && fairway_hit !== null) upsertData.fairway_hit = fairway_hit
  if (gir !== undefined && gir !== null) upsertData.gir = gir

  const { data: guardado, error } = await svc.from('hole_scores').upsert(
    upsertData,
    { onConflict: 'round_id,hole_number' }
  ).select('id').single()

  if (error) {
    captureGameError('upsert_score', error, { round_id, hole_number })
    return NextResponse.json({ error: 'No se pudo guardar el score. Intenta de nuevo.' }, { status: 500 })
  }

  // Auditoría de cada golpe que carga el organizador. hole_score_id es el uuid de la fila de hole_scores
  // (antes se armaba `round_id_hoyo`, que no es uuid: el insert fallaba siempre y nadie se enteraba).
  // previous_value no se escribe: la historia de un hoyo se lee en el orden de sus entradas. Sin userId
  // (invitado: changed_by exige un perfil) no se audita. Si falla, el score ya quedó guardado: se
  // reporta y no se bloquea.
  if (gross_score != null && userId) {
    try {
      const { error: auditError } = await svc.from('score_audit_log').insert({
        hole_score_id: (guardado as { id: string }).id,
        changed_by: userId,
        new_value: gross_score,
        reason: 'manual_organizer',
      })
      if (auditError) captureGameError('upsert_score.auditoria', auditError, { round_id, hole_number })
    } catch (err) {
      captureGameError('upsert_score.auditoria', err, { round_id, hole_number })
    }
  }

  const { data: allScores } = await svc
    .from('hole_scores')
    .select('gross_score, net_score, points')
    .eq('round_id', round_id)
    .not('gross_score', 'is', null)

  const totalGross = allScores?.reduce((s, h) => s + (h.gross_score ?? 0), 0) ?? 0
  const totalNet = allScores?.reduce((s, h) => s + (h.net_score ?? 0), 0) ?? 0
  const totalPoints = allScores?.reduce((s, h) => s + (h.points ?? 0), 0) ?? 0

  await svc
    .from('rounds')
    .update({ total_gross: totalGross, total_net: totalNet, total_points: totalPoints })
    .eq('id', round_id)

  return NextResponse.json({ success: true, totalGross, totalNet, totalPoints })
}

// ═══════════════════════════════════════════════════════════
// FINALIZE ROUND
// ═══════════════════════════════════════════════════════════

export async function finalizeRound(
  svc: Svc, tournamentId: string, body: Record<string, unknown>
): Promise<NextResponse> {
  const { round_id } = body
  const { data: currentRound } = await svc.from('rounds').select('status').eq('id', round_id).single()
  if (esTarjetaCerrada(currentRound?.status)) {
    // `code`: el scorer del organizador reconcilia (la cerró otro dispositivo o
    // se perdió la respuesta del primer cierre) en vez de pedir que reintente.
    return NextResponse.json({ error: 'La ronda ya está finalizada', code: 'round_closed' }, { status: 409 })
  }

  const { error } = await svc
    .from('rounds')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', round_id)

  if (error) return NextResponse.json({ error: 'No se pudo finalizar la ronda. Intenta de nuevo.' }, { status: 500 })

  // La tarjeta al historial del jugador (índice + nivel). No bloquea la
  // finalización: si falla, se reporta y la ronda queda cerrada igual.
  try {
    await guardarRondaDeTorneoEnHistorial(svc, round_id as string)
  } catch (err) {
    captureGameError('finalizeRound.historial', err, { round_id })
  }

  // Check next round availability
  let nextRoundInfo: { ready: boolean; currentRound: number; totalRounds: number } | null = null
  try {
    const { data: roundInfo } = await svc.from('rounds').select('round_number').eq('id', round_id).single()
    const { data: tInfo } = await svc.from('tournaments').select('id, total_rounds').eq('id', tournamentId).single()
    const currentRoundNum = (roundInfo as { round_number: number } | null)?.round_number ?? 1
    const totalRounds = (tInfo as { id: string; total_rounds: number } | null)?.total_rounds ?? 1
    if (totalRounds > 1) {
      const { count: openCount } = await svc
        .from('rounds')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('round_number', currentRoundNum)
        .not('status', 'in', CLOSED_ROUND_STATUSES_IN)
      nextRoundInfo = { ready: (openCount ?? 0) === 0 && currentRoundNum < totalRounds, currentRound: currentRoundNum, totalRounds }
    }
  } catch { /* non-blocking */ }

  return NextResponse.json({ success: true, nextRoundInfo })
}

// ═══════════════════════════════════════════════════════════
// START NEXT ROUND
// ═══════════════════════════════════════════════════════════

export async function startNextRound(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede iniciar la siguiente ronda' }, { status: 403 })
  }

  const { data: tInfo } = await svc.from('tournaments').select('id, total_rounds').eq('id', tournamentId).single()
  const totalRounds = (tInfo as { id: string; total_rounds: number } | null)?.total_rounds ?? 1

  const { data: maxRoundData } = await svc
    .from('rounds').select('round_number')
    .eq('tournament_id', tournamentId)
    .order('round_number', { ascending: false })
    .limit(1).single()

  const currentRound = (maxRoundData as { round_number: number } | null)?.round_number ?? 1
  const nextRound = currentRound + 1

  if (nextRound > totalRounds) {
    return NextResponse.json({ error: 'Ya se completaron todas las rondas del torneo' }, { status: 409 })
  }

  const { count: openCount } = await svc
    .from('rounds')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('round_number', currentRound)
    .not('status', 'in', CLOSED_ROUND_STATUSES_IN)

  if ((openCount ?? 0) > 0) {
    return NextResponse.json({ error: `Hay rondas de la ronda ${currentRound} sin finalizar` }, { status: 409 })
  }

  const { data: playersData } = await svc.from('players').select('id').eq('tournament_id', tournamentId)
  if (!playersData || playersData.length === 0) {
    return NextResponse.json({ error: 'No hay jugadores en el torneo' }, { status: 400 })
  }

  const newRounds = playersData.map((p: { id: string }) => ({
    tournament_id: tournamentId,
    player_id: p.id,
    round_number: nextRound,
    status: 'in_progress',
  }))

  const { error: insertErr } = await svc.from('rounds').insert(newRounds)
  if (insertErr) return NextResponse.json({ error: 'No se pudieron crear las rondas. Intenta de nuevo.' }, { status: 500 })

  return NextResponse.json({ success: true, roundNumber: nextRound, playersCount: playersData.length })
}

// ═══════════════════════════════════════════════════════════
// CANCEL TOURNAMENT
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// ABRIR INSCRIPCIONES (draft → open) / VOLVER A BORRADOR (open → draft)
// ═══════════════════════════════════════════════════════════

/**
 * Abre las inscripciones de un torneo: draft → open. Es la única vía para que
 * un torneo alcance 'open', el estado que habilita la auto-inscripción en
 * `/torneo/[slug]/unirse`. Sólo el organizador, sólo desde 'draft'.
 * La validación de organizador del route ya corrió (no está en selfAuthActions),
 * pero re-chequeamos acá por defensa en profundidad.
 */
export async function openInscriptions(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, status: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede abrir las inscripciones' }, { status: 403 })
  }
  if (status !== 'draft') {
    return NextResponse.json({ error: 'Solo se pueden abrir inscripciones desde un torneo en borrador' }, { status: 409 })
  }
  try {
    await openTournament(svc, tournamentId)
  } catch (e) {
    captureGameError('open_inscriptions', e, { tournamentId })
    return NextResponse.json({ error: 'No se pudieron abrir las inscripciones' }, { status: 500 })
  }
  return NextResponse.json({ success: true, status: 'open' })
}

/**
 * Vuelve un torneo a borrador: open → draft. Conserva los jugadores ya
 * inscritos (no borra `players`). Sirve para pausar inscripciones sin destruir.
 */
export async function revertInscriptions(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, status: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede cerrar las inscripciones' }, { status: 403 })
  }
  if (status !== 'open') {
    return NextResponse.json({ error: 'Solo se puede volver a borrador un torneo con inscripciones abiertas' }, { status: 409 })
  }
  try {
    await revertToDraft(svc, tournamentId)
  } catch (e) {
    captureGameError('revert_to_draft', e, { tournamentId })
    return NextResponse.json({ error: 'No se pudo volver a borrador' }, { status: 500 })
  }
  return NextResponse.json({ success: true, status: 'draft' })
}

/**
 * Cierra el torneo (in_progress → closed) y CONGELA sus rondas para que no se
 * puedan editar scores tras el cierre. Server-side + service client: valida
 * organizador acá (defensa en profundidad; el route ya lo exige) y evita depender
 * del RLS del cliente para las escrituras de freeze (a diferencia del update
 * directo que hacía el hook antes). Ver `closeTournament` en data/lifecycle.
 */
export async function closeTournamentAction(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, status: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede cerrar el torneo' }, { status: 403 })
  }
  if (status !== 'in_progress') {
    return NextResponse.json({ error: 'Solo se puede cerrar un torneo en curso' }, { status: 409 })
  }
  try {
    await closeTournament(svc, tournamentId)
  } catch (e) {
    captureGameError('close_tournament', e, { tournamentId })
    return NextResponse.json({ error: 'No se pudo cerrar el torneo' }, { status: 500 })
  }
  return NextResponse.json({ success: true, status: 'closed' })
}

/**
 * Reabre un torneo cerrado (closed → in_progress). Descongela rondas y
 * rondas_libres para que los scores puedan volver a editarse.
 */
export async function reopenTournamentAction(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, status: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede reabrir el torneo' }, { status: 403 })
  }
  if (status !== 'closed') {
    return NextResponse.json({ error: 'Solo se puede reabrir un torneo cerrado' }, { status: 409 })
  }
  try {
    await reopenTournament(svc, tournamentId)
  } catch (e) {
    captureGameError('reopen_tournament', e, { tournamentId })
    return NextResponse.json({ error: 'No se pudo reabrir el torneo' }, { status: 500 })
  }
  return NextResponse.json({ success: true, status: 'in_progress' })
}

export async function cancelTournament(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, status: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede cancelar el torneo' }, { status: 403 })
  }
  // Se puede eliminar un torneo mientras esté en borrador o con inscripciones
  // abiertas (ambos pre-inicio). Una vez 'in_progress'/'closed' no se borra.
  if (status !== 'draft' && status !== 'open') {
    return NextResponse.json({ error: 'Solo se puede eliminar un torneo antes de iniciarlo' }, { status: 409 })
  }

  const { data: rounds } = await svc.from('rounds').select('id').eq('tournament_id', tournamentId)
  if (rounds && rounds.length > 0) {
    const roundIds = rounds.map((r: { id: string }) => r.id)
    await svc.from('hole_scores').delete().in('round_id', roundIds)
    await svc.from('rounds').delete().eq('tournament_id', tournamentId)
  }

  const { data: grps } = await svc.from('tournament_groups').select('id').eq('tournament_id', tournamentId)
  if (grps && grps.length > 0) {
    const grpIds = grps.map((g: { id: string }) => g.id)
    await svc.from('tournament_group_players').delete().in('group_id', grpIds)
    await svc.from('tournament_groups').delete().eq('tournament_id', tournamentId)
  }

  await svc.from('players').delete().eq('tournament_id', tournamentId)
  await svc.from('categories').delete().eq('tournament_id', tournamentId)
  await svc.from('tournaments').delete().eq('id', tournamentId)

  return NextResponse.json({ success: true })
}

// ═══════════════════════════════════════════════════════════
// WITHDRAW PLAYER
// ═══════════════════════════════════════════════════════════

/**
 * Marca un jugador como retirado (WD) o descalificado (DQ).
 * NUNCA borra scores, rondas, ni el registro del jugador — el reglamento
 * USGA requiere preservar el historial. El leaderboard filtra por status.
 *
 * - WD (withdrawn): retiro voluntario. Puede solicitarlo el jugador o el organizador.
 * - DQ (disqualified): descalificación. Solo organizador.
 */
async function setPlayerStatus(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, tournamentStatus: string, body: Record<string, unknown>,
  newStatus: 'withdrawn' | 'disqualified'
): Promise<NextResponse> {
  const { player_id, reason } = body
  if (!player_id) return NextResponse.json({ error: 'player_id requerido' }, { status: 400 })

  const { data: playerData } = await svc
    .from('players')
    .select('id, user_id, status')
    .eq('id', player_id)
    .eq('tournament_id', tournamentId)
    .single()

  if (!playerData) return NextResponse.json({ error: 'Jugador no encontrado en este torneo' }, { status: 404 })

  const isOrganizer = organizerId === userId
  const isSelf = playerData.user_id === userId

  // DQ solo lo puede aplicar el organizador
  if (newStatus === 'disqualified' && !isOrganizer) {
    return NextResponse.json({ error: 'Solo el organizador puede descalificar jugadores' }, { status: 403 })
  }
  // WD: jugador a sí mismo o el organizador
  if (newStatus === 'withdrawn' && !isOrganizer && !isSelf) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  if (tournamentStatus === 'closed') {
    return NextResponse.json({ error: 'No se puede modificar jugadores de un torneo cerrado' }, { status: 409 })
  }

  const { error } = await svc
    .from('players')
    .update({
      status: newStatus,
      status_reason: typeof reason === 'string' ? reason : null,
      status_changed_at: new Date().toISOString(),
    })
    .eq('id', player_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, status: newStatus })
}

export async function withdrawPlayer(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, tournamentStatus: string, body: Record<string, unknown>
): Promise<NextResponse> {
  return setPlayerStatus(svc, userId, tournamentId, organizerId, tournamentStatus, body, 'withdrawn')
}

export async function disqualifyPlayer(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, tournamentStatus: string, body: Record<string, unknown>
): Promise<NextResponse> {
  return setPlayerStatus(svc, userId, tournamentId, organizerId, tournamentStatus, body, 'disqualified')
}
