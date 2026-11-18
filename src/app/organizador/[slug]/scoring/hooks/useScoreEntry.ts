// Entrada de scores hoyo a hoyo del scorer del organizador: selección de
// jugador, scores en vivo, stats opcionales (putts/fairway/GIR), undo,
// finalizar ronda. Toda la cuenta de golf sale de `src/golf/` (course handicap,
// SI normalizado, strokes por hoyo, stableford) — acá sólo se orquesta.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { enviarHoyo, leerTocadas, reconciliar, SIN_TOCAR, tocar, type HoleStatPatch, type VersionesEnviadas } from './envio-hoyo'
import { useCargaTarjeta, type GrossEnVuelo, type TarjetaCargada } from './useCargaTarjeta'
import { useStatsHoyo, type GrossEscrito } from './useStatsHoyo'
import { createClient } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { resolveLegacyPlayerName } from '@/golf/leaderboard/board-rules'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { puntajeDeHoyo, courseHandicapDeScoring } from '@/golf/core/hole-scoring'
import { hcpPctDelTorneo } from '@/golf/core/playing-handicap'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import {
  fetchRoundTotals,
  type ScoringPlayer,
  type ScoringRound,
  type ScoringTournament,
} from '@/lib/data/tournaments/scoring'

interface UseScoreEntryArgs {
  tournament: ScoringTournament | null
  players: ScoringPlayer[]
  courseHoles: CourseHole[]
  courseTees: CourseTeeRow[]
  holeCount: number
  getActiveRound: (player: ScoringPlayer | undefined) => ScoringRound | undefined
  applyRoundTotals: (
    playerId: string,
    roundId: string,
    totals: Pick<ScoringRound, 'total_gross' | 'total_net' | 'total_points'>,
  ) => void
  reloadRoster: () => Promise<unknown>
}

export interface LastAction {
  holeNumber: number
  previousScore: number | undefined
  playerId: string
  /** Tarjeta donde se anotó. El deshacer escribe ahí y no en la ronda que esté
   *  activa cuando llega el tap: en multi-ronda, deshacer el hoyo 18 de la R1
   *  con la R2 ya elegida borraría el hoyo 18 de la R2. */
  roundId: string
  /** Lo que se anotó. Al deshacer, la celda sólo se revierte si sigue mostrando esto. */
  newScore: number
  /** Qué pasó con el guardado que este deshacer revierte:
   *  - 'enviando': todavía sin respuesta. No se puede deshacer aún (`saving` no
   *    alcanza para saberlo: es uno solo para todo el hook y lo baja el primer
   *    guardado que responde aunque haya otro en vuelo).
   *  - 'guardado': el servidor confirmó. Deshacer llega al servidor.
   *  - 'fallo': no dejó nada en la base. Deshacer es sólo limpiar la pantalla;
   *    mandar un borrado se llevaría un golpe que no puso este organizador (el
   *    jugador anotando desde su teléfono), porque "el hoyo estaba vacío" es una
   *    foto local de la tarjeta, no la base. */
  estado: 'enviando' | 'guardado' | 'fallo'
}

export type { HoleStatPatch } from './envio-hoyo'

export type { CargaTarjeta } from './useCargaTarjeta'

export function useScoreEntry({
  tournament,
  players,
  courseHoles,
  courseTees,
  holeCount,
  getActiveRound,
  applyRoundTotals,
  reloadRoster,
}: UseScoreEntryArgs) {
  const { showError, showSuccess, showWarning } = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentScores, setCurrentScores] = useState<Record<number, number>>({})
  const [errorHoles, setErrorHoles] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [lastAction, setLastAction] = useState<LastAction | null>(null)
  /** Cuenta las tarjetas abiertas o cerradas. Una respuesta que llega tarde la
   *  compara con la que había al salir: si cambió (otro jugador, otra ronda), la
   *  pantalla ya es de otra tarjeta y no se toca. Se escribe en los handlers, no
   *  en el render. */
  const tarjetaRef = useRef(0)
  const [holePutts, setHolePutts] = useState<Record<number, number | null>>({})
  const [holeFairway, setHoleFairway] = useState<Record<number, boolean | null>>({})
  const [holeGir, setHoleGir] = useState<Record<number, boolean | null>>({})
  /** Stats que el organizador fijó a mano en la tarjeta abierta (ver `envio-hoyo.ts`). Se lee sin el closure del
   *  render: un tap de GIR y uno de putts salen en el mismo tick. */
  const statsTocadasRef = useRef(SIN_TOCAR)
  /** Jugador abierto, leído en los handlers: tocar de nuevo al que ya está abierto no recarga nada. */
  const selectedIdRef = useRef<string | null>(null)
  /** Golpes enviados sin respuesta todavía: la recarga los deja en pantalla (ver `armarTarjeta`). */
  const grossEnVueloRef = useRef<GrossEnVuelo>(new Map())
  /** Último golpe mandado a cada hoyo mientras la pantalla no lo refleja (ver `useStatsHoyo`). */
  const grossEscritoRef = useRef<GrossEscrito>(new Map())

  /** Foto de las stats del hoyo con `patch` encima, y queda como vigente. El servidor ordena los envíos por hoyo
   *  (`guardar_hole_score`): con un parche parcial por envío, putts (seq 7) que llega después de GIR (seq 8) se
   *  descartaba y los putts se perdían. Con la foto, el más nuevo siempre trae lo del anterior. */
  const fotoStatsDelHoyo = useCallback((roundId: string, holeNumber: number, patch: HoleStatPatch = {}) => {
    const { tocadas, foto, versiones } = tocar(statsTocadasRef.current, roundId, holeNumber, patch)
    statsTocadasRef.current = tocadas
    return { foto, versiones }
  }, [])
  /** El servidor aplicó el envío: lo tocado que no se volvió a tocar después ya está en la base y deja de viajar. */
  const confirmarStats = useCallback((roundId: string, holeNumber: number, enviadas: VersionesEnviadas) => {
    statsTocadasRef.current = reconciliar(statsTocadasRef.current, roundId, holeNumber, enviadas)
  }, [])

  const holes = useMemo(() => Array.from({ length: holeCount }, (_, i) => i + 1), [holeCount])
  // SI normalizado (permutación 1..N) para alocar golpes de neto/stableford (idempotente).
  const siAllocByHole = useMemo(
    () => normalizedStrokeIndexByHole(courseHoles, holeCount),
    [courseHoles, holeCount],
  )
  const holeByNumero = useMemo(
    () => new Map(courseHoles.map((h) => [h.numero, h])),
    [courseHoles],
  )

  const selectedPlayer = players.find((p) => p.id === selectedId)
  const selectedRound = getActiveRound(selectedPlayer)

  const resetHoleState = useCallback(() => {
    setCurrentScores({})
    setHolePutts({})
    setHoleFairway({})
    setHoleGir({})
  }, [])

  const aplicarTarjeta = useCallback((t: TarjetaCargada) => {
    setCurrentScores(t.scores)
    setHolePutts(t.putts)
    setHoleFairway(t.fairway)
    setHoleGir(t.gir)
  }, [])

  const { cargaTarjeta, cargaLenta, tarjetaLista, marcarCargando, invalidarCargas, reintentarCarga } =
    useCargaTarjeta({
      selectedId, players, getActiveRound, tarjetaRef, statsTocadasRef, grossEnVueloRef,
      aplicar: aplicarTarjeta, resetHoleState, showError,
    })

  const parDelHoyo = useCallback((h: number) => holeByNumero.get(h)?.par ?? 4, [holeByNumero])
  const {
    saveHoleStat, cambiarStat, enviarPendientes, statsGuardadas, statsFallidas, fotoParaEnviar, leerParaEnviar,
    retomarFallidas,
  } = useStatsHoyo({
    tournament, selectedId, players, getActiveRound, currentScores, parDelHoyo, tarjetaLista, statsTocadasRef,
    grossEscritoRef, fotoStatsDelHoyo, confirmarStats, showWarning,
  })

  const selectPlayer = useCallback(
    (playerId: string) => {
      // El mismo jugador ya está abierto: nada que cambiar. Marcar "cargando" acá dejaba la tarjeta en
      // "Cargando…" para siempre (la carga corre al cambiar de jugador, y no cambió).
      if (playerId === selectedIdRef.current) return
      selectedIdRef.current = playerId
      // Lo que esperaba el fin de los toques sale ahora, con la foto de ESTA tarjeta (después ya no está).
      enviarPendientes()
      tarjetaRef.current += 1
      // Todo lo de la tarjeta anterior se va YA, no cuando termine la carga: si la carga tarda o falla, anotar el
      // hoyo 1 de B mandaba putts, fairway y GIR de A a la ronda de B.
      statsTocadasRef.current = SIN_TOCAR
      grossEscritoRef.current = new Map()
      // Lo que falló en esta tarjeta vuelve a quedar tocado: se ve al cargar y viaja al reintentar.
      const ronda = getActiveRound(players.find((p) => p.id === playerId))
      if (ronda) retomarFallidas(ronda.id)
      marcarCargando()
      setSelectedId(playerId)
      resetHoleState()
      setLastAction(null)
    },
    [resetHoleState, marcarCargando, enviarPendientes, getActiveRound, players, retomarFallidas],
  )

  const clearSelection = useCallback(() => {
    selectedIdRef.current = null
    enviarPendientes()
    tarjetaRef.current += 1
    statsTocadasRef.current = SIN_TOCAR
    grossEscritoRef.current = new Map()
    marcarCargando()
    setSelectedId(null)
    resetHoleState()
    // Cerrar la tarjeta (o cambiar de ronda) descarta el deshacer pendiente: el
    // botón "Deshacer hoyo N" quedaba vivo en el header sin tarjeta a la vista.
    setLastAction(null)
  }, [resetHoleState, marcarCargando, enviarPendientes])

  // ── Derivados de la tarjeta seleccionada ──
  const filledCount = holes.filter((h) => currentScores[h] != null).length
  const allFilled = filledCount === holeCount

  // Par acumulado SOLO de hoyos jugados (no del recorrido completo).
  const parJugado = holes.reduce((s, h) => {
    if (!currentScores[h]) return s
    return s + (holeByNumero.get(h)?.par ?? 4)
  }, 0)

  const grossTotal = holes.reduce((s, h) => s + (currentScores[h] ?? 0), 0)
  const outGross = holes.filter((h) => h <= 9).reduce((s, h) => s + (currentScores[h] ?? 0), 0)
  const inGross = holes.filter((h) => h > 9).reduce((s, h) => s + (currentScores[h] ?? 0), 0)

  // Par de los hoyos que se juegan (no el de la cancha): con el CR de 9h y el
  // par de 18 la fórmula WHS devolvía course handicaps NEGATIVOS.
  const selectedCourseHcp =
    tournament && selectedPlayer
      ? courseHandicapDeScoring({
          mode: tournament.hcp_calc_mode,
          player: selectedPlayer,
          tournament,
          courseTees,
          courseHoles,
          holeCount,
          hcpPct: hcpPctDelTorneo(tournament),
        })
      : 0

  const netTotal = holes.reduce((s, h) => {
    if (!currentScores[h]) return s
    const si = siAllocByHole[h] ?? holeByNumero.get(h)?.stroke_index ?? h
    return s + (currentScores[h] - strokesRecibidosEnHoyo(selectedCourseHcp, si, holeCount))
  }, 0)

  // Los puntos que se MUESTRAN salen de la misma fuente que los que se
  // persisten (`puntajeDeHoyo`): en Stableford Gross, contra el par sin golpes.
  const stablefordPtsAt = useCallback(
    (holeNumber: number, gross: number) => {
      const hole = holeByNumero.get(holeNumber)
      const si = siAllocByHole[holeNumber] ?? hole?.stroke_index ?? holeNumber
      return puntajeDeHoyo({
        gross, par: hole?.par ?? 4, courseHandicap: selectedCourseHcp, strokeIndex: si, holeCount,
        formato: 'stableford', modo: tournament?.modo_juego,
      }).puntos
    },
    [holeByNumero, siAllocByHole, selectedCourseHcp, holeCount, tournament?.modo_juego],
  )

  // ── Guardado de un hoyo ──
  const saveScore = useCallback(
    async (holeNumber: number, value: string) => {
      const gross = parseInt(value)
      if (isNaN(gross) || !tournament || !selectedId) return
      if (gross < 1 || gross > 19) {
        showWarning('Score inválido', 'El score debe ser entre 1 y 19 golpes.')
        return
      }
      const player = players.find((p) => p.id === selectedId)
      if (!player) return
      const round = getActiveRound(player)
      if (round && !tarjetaLista(round.id)) {
        // Sin ESTA ronda cargada no se sabe qué hay en el hoyo (ver `CargaTarjeta`): la tarjeta recién creada o
        // la ronda que cambió todavía muestra lo de antes. La grilla ya está bloqueada.
        showWarning('Espera un momento', 'La tarjeta todavía no carga. Anota cuando aparezca.')
        return
      }
      if (!round) {
        // Sin tarjeta en la ronda en juego no hay dónde guardar: se dice, no se pierde en silencio. El panel
        // ofrece "Crear su tarjeta" (POST /api/torneos/[slug]/tarjeta).
        showWarning('No se guardó', `${resolveLegacyPlayerName(player)} no tiene tarjeta en esta ronda. Créala con "Crear su tarjeta" y vuelve a anotar.`)
        void captureError(new Error('Scorer del organizador: jugador sin tarjeta en la ronda en juego'), {
          context: 'organizador.score.sinTarjeta', level: 'warning', meta: { tournamentId: tournament.id, playerId: player.id, holeNumber },
        })
        return
      }

      const hole = holeByNumero.get(holeNumber)
      const par = hole?.par ?? 4
      const si = siAllocByHole[holeNumber] ?? hole?.stroke_index ?? holeNumber
      const courseHcp = courseHandicapDeScoring({
        mode: tournament.hcp_calc_mode, player, tournament, courseTees, courseHoles, holeCount,
        hcpPct: hcpPctDelTorneo(tournament),
      })
      // Neto y puntos por la MISMA fuente que el scorer del jugador y el
      // servidor: los tres escriben en las mismas columnas.
      const { neto: netScore, puntos: points } = puntajeDeHoyo({
        gross, par, courseHandicap: courseHcp, strokeIndex: si, holeCount, formato: tournament,
        modo: tournament.modo_juego,
      })

      const accion: LastAction = {
        holeNumber, previousScore: currentScores[holeNumber], newScore: gross,
        playerId: selectedId, roundId: round.id, estado: 'enviando',
      }
      const marcar = (estado: LastAction['estado']) =>
        setLastAction((actual) => (actual === accion ? { ...accion, estado } : actual))
      setLastAction(accion)
      setCurrentScores((prev) => ({ ...prev, [holeNumber]: gross }))
      setErrorHoles((prev) => {
        const next = new Set(prev)
        next.delete(holeNumber)
        return next
      })

      setSaving(true)
      const { foto: stats, versiones } = fotoParaEnviar(round.id, holeNumber)
      const claveVuelo = `${round.id}:${holeNumber}`
      const enVuelo = { valor: gross }
      grossEnVueloRef.current.set(claveVuelo, enVuelo)
      const escrito = { valor: gross as number | null }
      grossEscritoRef.current.set(claveVuelo, escrito)
      const tarjeta = tarjetaRef.current
      const res = await enviarHoyo({
        tournament_id: tournament.id,
        round_id: round.id,
        hole_number: holeNumber,
        par,
        gross_score: gross,
        net_score: netScore,
        points,
        ...stats,
      })
      if (grossEnVueloRef.current.get(claveVuelo) === enVuelo) grossEnVueloRef.current.delete(claveVuelo)
      if (grossEscritoRef.current.get(claveVuelo) === escrito) {
        // No llegó: un envío de stats posterior sale con el golpe de antes (el que sigue en la base).
        if (res.ok) grossEscritoRef.current.delete(claveVuelo)
        else grossEscritoRef.current.set(claveVuelo, { valor: accion.previousScore ?? null })
      }
      setSaving(false)

      if (!res.ok) {
        marcar('fallo')
        showError('Error al guardar', `No pudimos guardar el score del hoyo ${holeNumber}. Intenta nuevamente.`)
        setErrorHoles((prev) => new Set(prev).add(holeNumber))
        return
      }
      marcar('guardado')
      if (res.aplicado) {
        confirmarStats(round.id, holeNumber, versiones)
        statsGuardadas(round.id, holeNumber)
      }
      // Una recarga pedida antes de que el golpe llegara a la base no se aplica: lo borraría de la pantalla (ya no
      // está en vuelo para superponerlo). La que sigue a este guardado ya lo trae. Sólo si la tarjeta sigue siendo
      // la misma: un guardado de A que responde con B abierta dejaba la carga de B en "Cargando…".
      if (tarjetaRef.current === tarjeta) invalidarCargas()
      showSuccess('Score guardado', '', { duration: 1500 })

      // Refrescar los totales denormalizados de la ficha (no los usa el Resumen).
      try {
        const totals = await fetchRoundTotals(createClient(), round.id)
        if (totals) applyRoundTotals(selectedId, round.id, totals)
      } catch (e) {
        void captureError(e, { context: 'scoring.useScoreEntry.refreshTotals', meta: { roundId: round.id } })
      }
    },
    [
      tournament, selectedId, players, getActiveRound, holeByNumero, siAllocByHole,
      courseHoles, courseTees, holeCount, currentScores, fotoParaEnviar, confirmarStats,
      applyRoundTotals, showError, showSuccess, showWarning, tarjetaLista, statsGuardadas, invalidarCargas,
    ],
  )

  const undoLast = useCallback(async () => {
    if (!lastAction || !tournament || saving) return
    const { holeNumber, previousScore, newScore, playerId, roundId, estado } = lastAction
    if (estado === 'enviando') {
      // El guardado sigue en vuelo (otro que respondió antes bajó `saving`).
      // Deshacer ahora limpiaría la pantalla y el golpe llegaría igual a la base.
      showWarning('Espera un momento', `El hoyo ${holeNumber} todavía se está guardando.`)
      return
    }
    // Lo que esperaba el fin de los toques sale ANTES que el deshacer: con secuencia más nueva y el golpe de la
    // pantalla, salía después y volvía a escribir el golpe deshecho.
    enviarPendientes()
    const tarjeta = tarjetaRef.current
    /** Revierte la celda, sólo si la tarjeta a la vista sigue siendo la misma y
     *  la celda sigue mostrando lo que se está deshaciendo (si mientras tanto se
     *  escribió otro valor en ese hoyo, ese valor manda). */
    const revertirPantalla = () => {
      if (tarjetaRef.current !== tarjeta) return
      setCurrentScores((prev) => {
        if (prev[holeNumber] !== newScore) return prev
        const next = { ...prev }
        if (previousScore !== undefined) next[holeNumber] = previousScore
        else delete next[holeNumber]
        return next
      })
    }
    if (estado === 'fallo') {
      // El guardado no llegó a la base: no hay nada que deshacer allá.
      setLastAction((actual) => (actual === lastAction ? null : actual))
      revertirPantalla()
      if (tarjetaRef.current === tarjeta) {
        setErrorHoles((prev) => {
          const next = new Set(prev)
          next.delete(holeNumber)
          return next
        })
      }
      showSuccess('Deshacer', `Hoyo ${holeNumber} restaurado`, { duration: 1500 })
      return
    }
    // El deshacer SIEMPRE llega al servidor. Si el hoyo estaba vacío antes de
    // anotar, deshacer es borrar el golpe (`gross_score: null`, que
    // `upsert_score` ya soporta). Antes ese caso sólo quitaba el número de la
    // pantalla y decía "restaurado": el golpe seguía en la base, contaba en el
    // leaderboard y reaparecía al recargar.
    //
    // La respuesta SE MIRA: este caller manda sólo el gross, así que el
    // servidor deriva el neto — y esa derivación puede fallar (503). Sin el
    // chequeo, el deshacer se perdía en silencio y el organizador quedaba
    // creyendo que el score volvió atrás.
    //
    // `saving` marca el round-trip: como la tarjeta no revierte de forma
    // optimista, sin esto el botón queda vivo y aparentemente muerto durante
    // 1-2s en 3G — pidiendo el segundo tap. `ScoringHeader` lo esconde con
    // `lastAction && !saving` y muestra "Guardando…".
    setSaving(true)
    // Lleva lo tocado del hoyo: con secuencia más nueva que un GIR en vuelo, sin la foto ese GIR se descartaba
    // en el servidor. Se lee sin tocar nada (el deshacer no fija stats).
    const { foto: stats, versiones } = leerParaEnviar(roundId, holeNumber)
    const claveHoyo = `${roundId}:${holeNumber}`
    const escrito = { valor: previousScore ?? null }
    grossEscritoRef.current.set(claveHoyo, escrito)
    const envio = await enviarHoyo({
      tournament_id: tournament.id,
      round_id: roundId,
      hole_number: holeNumber,
      par: holeByNumero.get(holeNumber)?.par ?? 4,
      gross_score: previousScore ?? null,
      ...stats,
    })
    const ok = envio.ok
    if (envio.aplicado) confirmarStats(roundId, holeNumber, versiones)
    // Resuelto: el golpe vigente vuelve a ser el de la pantalla (revertida abajo si salió bien).
    if (grossEscritoRef.current.get(claveHoyo) === escrito) grossEscritoRef.current.delete(claveHoyo)
    setSaving(false)
    if (!ok) {
      // La pantalla NO se toca si el servidor no deshizo. Aplicar el undo
      // optimista y no revertirlo dejaba un score en pantalla y otro en la
      // base. `lastAction` queda vivo para poder reintentar.
      showWarning('No pudimos deshacer', `El hoyo ${holeNumber} sigue como estaba en el servidor. Reintenta.`)
      return
    }
    // Sólo se consume ESTE deshacer: si mientras tanto se anotó otro hoyo, su
    // deshacer sigue disponible.
    setLastAction((actual) => (actual === lastAction ? null : actual))
    showSuccess('Deshacer', `Hoyo ${holeNumber} restaurado`, { duration: 1500 })
    // Mismo predicado que al guardar: una recarga pedida antes del deshacer traería el golpe deshecho.
    if (tarjetaRef.current === tarjeta) invalidarCargas()
    // Si mientras tanto se abrió otra tarjeta (otro jugador u otra ronda), la
    // respuesta no toca esa pantalla: el hoyo N que está a la vista es de otra.
    revertirPantalla()
    // Los totales de la ficha se refrescan igual que al guardar.
    try {
      const totals = await fetchRoundTotals(createClient(), roundId)
      if (totals) applyRoundTotals(playerId, roundId, totals)
    } catch (e) {
      void captureError(e, { context: 'scoring.useScoreEntry.undoTotals', meta: { roundId } })
    }
  }, [
    lastAction, tournament, saving, holeByNumero, applyRoundTotals, showSuccess, showWarning, confirmarStats,
    enviarPendientes, leerParaEnviar, invalidarCargas,
  ])

  const finalizeRound = useCallback(async () => {
    if (!tournament || !selectedId) return
    const player = players.find((p) => p.id === selectedId)
    const round = getActiveRound(player)
    if (!round) return
    // Las stats que esperaban salen antes del cierre (después el servidor las rechazaría).
    enviarPendientes()
    setSaving(true)
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'finalize_round',
        tournament_id: tournament.id,
        round_id: round.id,
      }),
    }).catch(() => null)
    setSaving(false)
    const cuerpo: { error?: unknown; code?: unknown } | null = res && !res.ok
      ? await res.json().catch(() => null)
      : null
    // Ya estaba cerrada (la cerró otro dispositivo, o el primer cierre llegó y se
    // perdió la respuesta): reconciliar con el servidor, no pedir que reintente.
    if (cuerpo?.code === 'round_closed') {
      showWarning('La tarjeta ya estaba cerrada', 'Actualizamos el listado.')
      await reloadRoster()
      clearSelection()
      return
    }
    // Sin esto, un cierre que falló se veía igual que uno exitoso: la tarjeta
    // seguía abierta y el organizador no se enteraba ("el botón no hace nada").
    // El motivo del servidor (torneo cerrado, tarjeta de otro torneo) dice más
    // que "intenta de nuevo", que no arregla esos casos.
    if (!res?.ok) {
      showError('No se cerró la tarjeta', typeof cuerpo?.error === 'string' ? cuerpo.error : 'Intenta de nuevo.')
      return
    }
    await reloadRoster()
    clearSelection()
  }, [tournament, selectedId, players, getActiveRound, reloadRoster, clearSelection, showError, showWarning, enviarPendientes])

  return {
    selectedId,
    selectedPlayer,
    selectedRound,
    selectPlayer,
    clearSelection,
    cargaTarjeta,
    cargaLenta,
    reintentarCarga,
    currentScores,
    errorHoles,
    saving,
    lastAction,
    undoLast,
    holes,
    filledCount,
    allFilled,
    parJugado,
    grossTotal,
    outGross,
    inGross,
    netTotal,
    selectedCourseHcp,
    stablefordPtsAt,
    saveScore,
    finalizeRound,
    holePutts,
    setHolePutts,
    holeFairway,
    setHoleFairway,
    holeGir,
    setHoleGir,
    saveHoleStat,
    cambiarStat,
    statsFallidas,
  }
}

export type UseScoreEntryReturn = ReturnType<typeof useScoreEntry>
