/**
 * useFinalizeRonda — orquestador de finalizar/descartar ronda libre (scorer
 * individual).
 *
 * Extraído desde page.tsx (Task 6 del scorer-refactor, 14-may-2026). Desde
 * oct-2026 el acceso a datos vive en `@/lib/data/ronda-libre-finalizar`
 * (compartido con el scorer de grupo): guard de "¿ya finalizada?", ratings
 * del tee, INSERT idempotente en historical_rounds, recálculo de índice y
 * nivel. Acá queda sólo la orquestación propia de esta pantalla (toasts,
 * coach, modal final).
 *
 * REGLA: NO modificar formulas, columnas de historical_rounds, ni logica WHS.
 */

'use client'

import { useRef, useState } from 'react'
import type React from 'react'
import { createClient } from '@/lib/supabase'
import { trackEvent } from '@/lib/analytics'
import { addToast } from '@/hooks/useToast'
import { finalizarRondaLibre } from '@/lib/data/ronda-libre-scores'
import {
  fetchEstadoRondaLibre,
  fetchRondaParaCierre,
  avisarAlCoachRondaNueva,
  fetchIndiceDeUsuario,
  guardarTarjetaEnHistorial,
  recalcularIndiceGolfers,
  actualizarNivelDelJugador,
  type RatingsPorTee,
} from '@/lib/data/ronda-libre-finalizar'
import { haptic } from '@/lib/ronda/helpers'
import { esMiTarjeta } from '@/golf/ronda-libre/permisos'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { armarTarjetaHistorica, completarHoyosSinMarcarConPar, hoyosSinMarcar } from '@/golf/ronda-libre/tarjeta-historica'
import { hoyosSinTerminarDeJugador } from '@/golf/ronda-libre/match-de-la-ronda'
import type { MatchResult } from '@/golf/formats/match-play'
import { saveScores as lsSave, clearScores as lsClear } from '@/lib/ronda/score-storage'
import { captureError } from '@/lib/error-tracking'
import { descartarRondaLibre } from '@/lib/data/ronda-libre-cierre'
import type { RondaLibre } from '@/types/ronda'

interface UseFinalizeRondaOptions {
  ronda: RondaLibre | null
  activeJugadorId: string | null
  scores: Record<string, Record<number, number>>
  parMap: Record<number, number>
  /** Match play de la ronda (`useMatchPlayState`, A = primer jugador); `null` en otros formatos. */
  matchResult: MatchResult | null
  codigo: string
  saveScores: (jugadorId: string, holeScores: Record<number, number>) => Promise<void>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  setHasUnsaved: React.Dispatch<React.SetStateAction<boolean>>
  setHistoricalRoundId: React.Dispatch<React.SetStateAction<string | null>>
  onDiscardSuccess?: () => void
  onFinalizeError?: (msg: string) => void
}

export interface UseFinalizeRondaResult {
  finalizeRound: () => Promise<void>
  discardRound: () => Promise<void>
  confirmFinalize: boolean
  setConfirmFinalize: React.Dispatch<React.SetStateAction<boolean>>
  confirmDiscard: boolean
  setConfirmDiscard: React.Dispatch<React.SetStateAction<boolean>>
  discarding: boolean
  roundDone: boolean
  setRoundDone: React.Dispatch<React.SetStateAction<boolean>>
  finalScore: { gross: number; totalPar: number }
}

export function useFinalizeRonda(opts: UseFinalizeRondaOptions): UseFinalizeRondaResult {
  const {
    ronda, activeJugadorId, scores, parMap, matchResult, codigo,
    saveScores, setScores, setHasUnsaved, setHistoricalRoundId,
    onDiscardSuccess,
  } = opts

  const [roundDone, setRoundDone] = useState(false)
  const [finalScore, setFinalScore] = useState({ gross: 0, totalPar: 0 })
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  // Un solo finalizar en vuelo: el segundo toque confirma, un tercero y cuarto
  // rápidos (o un reintento con mala señal) no deben correr el flujo dos veces.
  const finalizando = useRef(false)

  const discardRound = async () => {
    if (!ronda || discarding) return
    if (!confirmDiscard) {
      setConfirmDiscard(true)
      haptic([20, 40, 20])
      setTimeout(() => setConfirmDiscard(false), 5000)
      return
    }
    setDiscarding(true)
    haptic(30)
    const { error } = await descartarRondaLibre(createClient(), codigo)
    if (error) { setDiscarding(false); setConfirmDiscard(false); addToast({ title: error, type: 'error' }); return }
    // Limpia localStorage para esta ronda
    try {
      for (const j of ronda.ronda_libre_jugadores) lsClear(codigo, j.id)
    } catch { /* no bloquear */ }
    addToast({ title: 'Ronda descartada', type: 'info' })
    onDiscardSuccess?.()
  }

  const finalizeRound = async () => {
    if (!ronda || !activeJugadorId || finalizando.current) return
    if (!confirmFinalize) {
      setConfirmFinalize(true)
      haptic(15)
      return
    }
    setConfirmFinalize(false)
    haptic(30)
    finalizando.current = true
    try {
      await finalizarUnaVez(ronda, activeJugadorId)
    } finally {
      finalizando.current = false
    }
  }

  const finalizarUnaVez = async (ronda: RondaLibre, activeJugadorId: string) => {

    // Ronda ya cerrada por otro dispositivo/jugador (en match play pasa siempre que el
    // ganador cierra primero: la ronda se cierra cuando cada tarjeta tiene los hoyos que
    // el match exige). No se reescriben los golpes ni se vuelve a cerrar, pero la tarjeta
    // propia SÍ se guarda en el historial (idempotente): antes este camino volvía sin
    // guardarla y el perdedor se quedaba sin la ronda.
    const supabase = createClient()
    const yaFinalizada = (await fetchEstadoRondaLibre(supabase, codigo)) === 'finalizada'
    if (yaFinalizada) addToast({ title: 'Esta ronda ya fue finalizada', type: 'info' })

    // Bug fix 30-abr-2026: el ultimo hoyo en par no se persistia. La UI mostraba
    // par como placeholder visual (sensacion de registrado), pero el state era
    // undefined porque sin tap +/- nunca se disparaba handleScoreChange. Y como
    // goToNextHole no corre en el ultimo hoyo, el auto-fill no aplicaba.
    // Detectar todos los hoyos sin marcar y rellenarlos con par antes de guardar.
    // Sólo los hoyos DE ESTA RONDA: una de 9 desde el 10 no recibe hoyos 1..9.
    const totalHolesForSave = ronda.holes ?? 18
    const hoyos = hoyosDeLaRonda(ronda.hoyo_inicio, totalHolesForSave)
    const currentScores = scores[activeJugadorId] ?? {}
    // Match play: los hoyos que el rival concedió y los posteriores a decidirse el
    // match no se jugaron: no se inventan con par (el historial los estima con par neto).
    const sinTerminar = (jugadorId: string) => hoyosSinTerminarDeJugador(matchResult, ronda.ronda_libre_jugadores, jugadorId)
    const { scores: playerScores, rellenados } = completarHoyosSinMarcarConPar(currentScores, hoyos, parMap, sinTerminar(activeJugadorId))
    if (rellenados.length > 0) {
      setScores(prev => ({ ...prev, [activeJugadorId]: playerScores }))
      lsSave(codigo, activeJugadorId, playerScores)
    }
    if (!yaFinalizada) await saveScores(activeJugadorId, playerScores)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!yaFinalizada) await trackEvent(supabase, authUser?.id ?? null, 'ronda_completada', { codigo })

    // Save to historical_rounds — posicional en orden de juego (ver tarjeta-historica).
    // holes_played = hoyos REALMENTE jugados (no el config de la ronda).
    // Sin esto, una ronda de 15/18 se guardaba como "18 hoyos" y el diferencial WHS salia mal.
    const tarjeta = armarTarjetaHistorica({ scores: playerScores, hoyos, roundHoles: totalHolesForSave, parMap })
    if (tarjeta.holesPlayed === 0) {
      // Sin scores = no tiene sentido crear historial. Usar "Descartar ronda".
      addToast({ title: 'Sin hoyos jugados', message: 'Usa "Descartar ronda" si no quieres guardarla.', type: 'info' })
      setRoundDone(true)
      setHasUnsaved(false)
      return
    }
    const activePlayer = ronda.ronda_libre_jugadores.find(p => p.id === activeJugadorId)
    // Historial: sólo si la tarjeta es de quien finaliza (`esMiTarjeta`, fuente única
    // con el scorer de grupo). La de otra cuenta la guarda su dueño desde la ronda
    // terminada ("Guardar en mi historial"); la de un invitado no es de nadie con
    // historial (antes entraba al historial de quien anotaba y movía su índice).
    const historicalUserId = esMiTarjeta(activePlayer, authUser?.id) ? activePlayer.user_id : null
    let historialFallo = false
    // La tarjeta tal como quedó en el historial (con los hoyos estimados) para el modal final.
    let tarjetaGuardada = tarjeta
    if (!historicalUserId) {
      addToast({
        title: activePlayer?.user_id
          ? `${activePlayer.nombre} puede guardar esta tarjeta en su historial desde su cuenta`
          : 'La tarjeta de un invitado no se guarda en ningún historial',
        type: 'info',
      })
    } else try {
      // Match play ("Ganó 3&2"), ajuste WHS de los hoyos sin terminar y equipo: todo
      // dentro de `guardarTarjetaEnHistorial` (fuente única con los otros dos caminos).
      const ratingsPorTee: RatingsPorTee = new Map()
      const guardado = await guardarTarjetaEnHistorial(supabase, {
        ronda, jugador: activePlayer ?? { id: activeJugadorId, tees: null }, userId: historicalUserId,
        scores: playerScores, scoresPorJugador: { ...scores, [activeJugadorId]: playerScores },
        hoyos, parMap, ratingsPorTee, conId: true,
      })
      if (guardado.status !== 'error') tarjetaGuardada = guardado.tarjeta
      // No guardada (RLS, red…): no se anuncia "Ronda guardada" ni se recalcula el
      // índice sobre un historial que no cambió. Los golpes siguen en la tarjeta.
      if (guardado.status === 'error') {
        void captureError(guardado.error, { context: 'finalize-ronda.historial', meta: { codigo, jugadorId: activeJugadorId } })
        addToast({
          title: 'No pudimos guardar la ronda en tu historial',
          message: 'Tus golpes quedaron en la tarjeta. Vuelve a finalizar en un momento.',
          type: 'error',
        })
        historialFallo = true
        throw new Error('historial-no-guardado')
      }
      // Duplicate entry (unique constraint): silently continue — round already saved
      if (guardado.status === 'insertada' && guardado.id) {
        setHistoricalRoundId(guardado.id)
        // Cerebro v2: el coach aprende de la ronda (plan-outcome + post-ronda). No bloquea.
        avisarAlCoachRondaNueva(guardado.id, historicalUserId)
      }

      // ── Task 2.8: capturar índice ANTES del recálculo ──
      const indiceBefore = await fetchIndiceDeUsuario(supabase, historicalUserId)

      // Recalcular Indice Golfers+ con retry exponencial (no bloquea la finalización)
      const rpcSucceeded = await recalcularIndiceGolfers(supabase, historicalUserId, { reintentos: 3 })

      // ── Task 2.8: capturar índice DESPUÉS y mostrar toast ──
      if (rpcSucceeded) {
        const indiceAfter = await fetchIndiceDeUsuario(supabase, historicalUserId)

        if (indiceBefore != null && indiceAfter != null && indiceBefore !== indiceAfter) {
          const direction = indiceAfter < indiceBefore ? 'bajó' : 'subió'
          addToast({
            title: `Tu índice ${direction}`,
            message: `${indiceBefore.toFixed(1)} → ${indiceAfter.toFixed(1)}`,
            type: indiceAfter < indiceBefore ? 'success' : 'info',
          })
        } else if (indiceAfter != null) {
          addToast({
            title: 'Ronda guardada',
            message: `Índice actual: ${indiceAfter.toFixed(1)}`,
            type: 'success',
          })
        }
      } else {
        addToast({
          title: 'Ronda guardada',
          message: 'Tu índice se actualizará pronto',
          type: 'info',
        })
      }

      void actualizarNivelDelJugador(supabase, historicalUserId).catch(() => {})

      // Detectar patrones del dueno de la sesion (tAIger+ patterns es del usuario logged-in)
      if (authUser?.id) {
        fetch('/api/taiger/patterns', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(() => {}).catch(() => {})
      }
    } catch { /* don't block finalization */ }

    // La tarjeta propia no quedó en el historial: no se cierra la ronda ni se pasa
    // a la pantalla final, para que "Finalizar" se pueda reintentar.
    if (historialFallo) return

    // Check if ALL players have completed all holes -> finalize round
    // Guard: verificar que la ronda no fue finalizada por otro jugador simultaneamente
    const freshRonda = yaFinalizada ? { estado: 'finalizada', jugadores: [] } : await fetchRondaParaCierre(supabase, codigo)
    if (!freshRonda) {
      // Lectura fallida: NO se cierra la ronda para todos (`[].every` daba true).
      void captureError(new Error('fetchRondaParaCierre sin datos'), { context: 'finalize-ronda.cierre', level: 'warning', meta: { codigo } })
    } else if (freshRonda.estado === 'finalizada') {
      // Otro jugador ya finalizo — no duplicar
      setRoundDone(true)
    } else {
      // Completa = todos los hoyos de la ronda anotados, salvo los que el match no exige.
      const allDone = freshRonda.jugadores.length > 0 && freshRonda.jugadores.every(j => {
        const excluir = new Set(sinTerminar(j.id))
        return hoyosSinMarcar(j.scores ?? {}, hoyos.filter(h => !excluir.has(h))).length === 0
      })
      if (allDone) {
        // RPC: cierra solo si sigue en_curso (sin carrera), valida quién puede y,
        // si ESTA llamada la cerró, manda el "Resultado final" a los seguidores.
        const { error: finErr } = await finalizarRondaLibre(supabase, codigo, { jugadorId: activeJugadorId ?? undefined })
        if (finErr) void captureError(finErr, { context: 'finalize-ronda.finalizar_ronda_libre', meta: { codigo } })
      }
    }

    // Modal final: la misma tarjeta que quedó en el historial (relleno del último
    // hoyo en par y hoyos de match play estimados incluidos).
    let finalTotalPar = 0
    tarjetaGuardada.hoyos.forEach((h, i) => { if (tarjetaGuardada.scores[i] != null) finalTotalPar += parMap[h] ?? 4 })
    setFinalScore({ gross: tarjetaGuardada.totalGross, totalPar: finalTotalPar })
    setRoundDone(true)
    setHasUnsaved(false)
  }

  return {
    finalizeRound,
    discardRound,
    confirmFinalize,
    setConfirmFinalize,
    confirmDiscard,
    setConfirmDiscard,
    discarding,
    roundDone,
    setRoundDone,
    finalScore,
  }
}
