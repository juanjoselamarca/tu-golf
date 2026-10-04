'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type React from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { saveRondaLibreScores, finalizarRondaLibre, ERRCODE_SIN_RESPUESTA } from '@/lib/data/ronda-libre-scores'
import { conTimeout } from '@/lib/red/con-timeout'
import { PLAZO_CARGA_SCORER_MS } from '@/lib/data/ronda-libre-scorer'
import { descartarRondaLibre, RONDA_ERRCODE } from '@/lib/data/ronda-libre-cierre'
import {
  fetchEstadoRondaLibre,
  guardarTarjetaEnHistorial,
  recalcularIndiceGolfers,
  actualizarNivelDelJugador,
  avisarAlCoachRondaNueva,
  type RatingsPorTee,
} from '@/lib/data/ronda-libre-finalizar'
import { haptic } from '@/lib/ronda/helpers'
import { saveGroupScores, confirmarPendientes, hayPendientes, clearScorerGrupoSnapshot } from '@/lib/ronda/score-storage'
import { isSharedBallFormat } from '@/golf/formats'
import { esMiTarjeta } from '@/golf/ronda-libre/permisos'
import { completarHoyosSinMarcarConPar } from '@/golf/ronda-libre/tarjeta-historica'
import { hoyosSinTerminarDeJugador } from '@/golf/ronda-libre/match-de-la-ronda'
import type { MatchResult } from '@/golf/formats/match-play'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'
import type { RondaLibre } from '@/types/ronda'

/** Cuánto queda armado el "¿Finalizar?" antes de volver solo a "Finalizar ronda". */
export const CONFIRM_FINALIZE_MS = 5000

export interface FinalizeGrupo {
  finalizeRound: () => Promise<void>
  finalizing: boolean
  confirmFinalize: boolean
  discardRound: () => Promise<void>
  discarding: boolean
  showDiscardConfirm: boolean
  setShowDiscardConfirm: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Finalizar / descartar desde el scorer de GRUPO: rellena con par los hoyos
 * sin marcar DE LA RONDA (todas las tarjetas), guarda, escribe en el historial
 * SÓLO la tarjeta de quien anota (`esMiTarjeta`; idempotente),
 * recalcula índice y nivel sin bloquear, y cierra la ronda por la capa de
 * datos. El acceso a datos es el MISMO que usa el scorer individual
 * (`@/lib/data/ronda-libre-finalizar`).
 */
export function useFinalizeGrupo(input: {
  ronda: RondaLibre | null
  codigo: string
  currentHole: number
  /** Hoyos de la ronda en orden de juego — la misma lista que navega la página. */
  hoyos: readonly number[]
  scores: Record<string, Record<number, number>>
  setScores: React.Dispatch<React.SetStateAction<Record<string, Record<number, number>>>>
  parMap: Record<number, number>
  teamEquipos: EquipoDelScorer[]
  /** Match play de la ronda (`useMatchPlayState`, A = primer jugador); `null` en otros formatos. */
  matchResult: MatchResult | null
  /**
   * Quién anota (sesión del teléfono, `useRondaGrupoData`). Antes se pedía `getUser()` al
   * servidor: con Auth caído volvía null y la ronda se cerraba SIN la tarjeta del marcador.
   */
  authUserId: string | null
  /** Envía todo lo pendiente (jugadores y equipos) — `useGrupoScoreSave.saveAllScores`. */
  enviarPendientes: () => Promise<void>
}): FinalizeGrupo {
  const { ronda, codigo, currentHole, hoyos, scores, setScores, parMap, teamEquipos, matchResult, authUserId, enviarPendientes } = input
  const router = useRouter()

  const [finalizing, setFinalizing] = useState(false)
  const [confirmFinalize, setConfirmFinalize] = useState(false)
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── Reset confirmation when changing holes ── */
  useEffect(() => {
    setConfirmFinalize(false)
    if (confirmTimeoutRef.current) { clearTimeout(confirmTimeoutRef.current); confirmTimeoutRef.current = null }
  }, [currentHole])

  const discardRound = useCallback(async () => {
    if (!ronda || discarding) return
    setDiscarding(true)
    setShowDiscardConfirm(false)
    haptic(30)
    const { error } = await descartarRondaLibre(createClient(), codigo)
    if (error) {
      setDiscarding(false)
      addToast({ type: 'error', title: 'No se descartó la ronda', message: error, duration: 5000 })
      return
    }
    clearScorerGrupoSnapshot(codigo)
    router.push('/dashboard?discarded=1')
  }, [ronda, discarding, codigo, router])

  const finalizeRound = async () => {
    if (!ronda || finalizing) return
    if (!confirmFinalize) {
      setConfirmFinalize(true)
      haptic([20, 50, 20])
      // Auto-reset after 5 seconds
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
      confirmTimeoutRef.current = setTimeout(() => setConfirmFinalize(false), CONFIRM_FINALIZE_MS)
      return
    }
    if (confirmTimeoutRef.current) { clearTimeout(confirmTimeoutRef.current); confirmTimeoutRef.current = null }
    setFinalizing(true)
    haptic(30)

    // Guard: verificar que la ronda no fue finalizada por otro dispositivo/organizador
    const supabase = createClient()
    // Sin identidad o sin servidor no se cierra nada (caída 04-oct-2026): se avisa y se reintenta.
    const avisarSinServidor = () => {
      addToast({
        type: 'error',
        title: 'No se pudo finalizar todavía',
        message: 'Sin conexión con el servidor. Tus golpes están guardados en este teléfono; vuelve a tocar Finalizar en un momento.',
        duration: 7000,
      })
      setFinalizing(false)
    }
    if (!authUserId) { avisarSinServidor(); return }
    let estado: string | null
    try {
      estado = await conTimeout(fetchEstadoRondaLibre(supabase, codigo), PLAZO_CARGA_SCORER_MS)
    } catch {
      avisarSinServidor()
      return
    }
    if (estado === 'finalizada') {
      addToast({ title: 'Esta ronda ya fue finalizada', type: 'info' })
      setFinalizing(false)
      router.push(`/ronda-libre/${codigo}?finished=true`)
      return
    }

    // Bug fix 30-abr-2026: si el último hoyo se jugó en par y el usuario no
    // tap +/-, el state queda undefined (la UI mostraba par como placeholder
    // visual, dándole sensación de registrado). goToNextHole sí auto-rellena
    // con par, pero en el último hoyo no hay siguiente. Detectar todos los
    // hoyos sin marcar y completarlos con par antes de persistir.
    // Sólo los hoyos DE ESTA RONDA: una de 9 desde el 10 no recibe hoyos 1..9.
    const filledScores: typeof scores = { ...scores }
    for (const j of ronda.ronda_libre_jugadores) {
      // Match play: los hoyos que el rival concedió y los posteriores a decidirse el
      // match no se jugaron: no se inventan con par (el historial los estima con par neto).
      const noRellenar = hoyosSinTerminarDeJugador(matchResult, ronda.ronda_libre_jugadores, j.id)
      const { scores: completos, rellenados } = completarHoyosSinMarcarConPar(filledScores[j.id] ?? {}, hoyos, parMap, noRellenar)
      if (rellenados.length > 0) filledScores[j.id] = completos
    }
    setScores(filledScores)
    saveGroupScores(codigo, filledScores)
    const guardados = await Promise.all(ronda.ronda_libre_jugadores.map(j => {
      const delta: Record<string, number> = {}
      for (const [k, v] of Object.entries(filledScores[j.id] ?? {})) {
        if (v != null) delta[String(k)] = v
      }
      // Audit 2026-05-17 P0 #1: merge server-side vía RPC también en finalize.
      return saveRondaLibreScores(supabase, { codigo, jugadorId: j.id, delta })
    }))
    // Sin servidor no se cierra la ronda a medias (caída del 04-oct-2026): los golpes
    // ya están en el teléfono; se avisa y el marcador reintenta cuando vuelva la señal.
    // P0002 (otro dispositivo ya la cerró) sigue el camino normal hacia el resultado.
    ronda.ronda_libre_jugadores.forEach((j, i) => {
      if (!guardados[i].error) confirmarPendientes(codigo, j.id, filledScores[j.id] ?? {})
    })
    const sinServidor = guardados.some(g => g.error && g.error.code !== RONDA_ERRCODE.FINALIZED)
    if (sinServidor) { avisarSinServidor(); return }
    // Lo que quede pendiente (scores de equipo de scramble/foursome) también tiene que llegar.
    await enviarPendientes()
    if (hayPendientes(codigo)) { avisarSinServidor(); return }

    // Historial: SÓLO la tarjeta de quien anota (`esMiTarjeta`, P0 01-oct-2026).
    // Antes se insertaba la de cada jugador con cuenta: la RLS de historical_rounds
    // (own_rounds) rechazaba las ajenas y la ronda NUNCA se cerraba. Los demás con
    // cuenta la guardan con "Guardar en mi historial" en la ronda terminada.
    const anotador = { id: authUserId }
    const ratingsPorTee: RatingsPorTee = new Map()
    const bolaCompartida = isSharedBallFormat(ronda.formato_juego)
    for (const j of ronda.ronda_libre_jugadores) {
      if (!esMiTarjeta(j, anotador?.id)) continue
      try {
        // Para Scramble/Foursome: usar score del equipo (es el score real de la ronda)
        let playerScores: Record<string | number, number> = filledScores[j.id] ?? {}
        if (bolaCompartida) {
          const equipoDelJugador = teamEquipos.find(eq => eq.jugadorIds.includes(j.id))
          if (equipoDelJugador) playerScores = equipoDelJugador.scores
        }
        const guardado = await guardarTarjetaEnHistorial(supabase, {
          ronda, jugador: j, userId: j.user_id, scores: playerScores, scoresPorJugador: filledScores,
          hoyos, parMap, ratingsPorTee, conId: true,
        })
        if (guardado.status === 'sin_hoyos') continue // no jugó ningún hoyo
        if (guardado.status === 'duplicada') {
          // Ya guardada (el jugador la finalizó desde su teléfono, o reintento):
          // queda la primera. Se registra para poder auditar si difieren.
          void captureError(new Error('historical_rounds duplicada'), { context: 'score_grupo_finalize_historical.duplicada', level: 'info', meta: { codigo, jugadorId: j.id } })
          continue
        }
        if (guardado.status === 'error') {
          // Sólo puede fallar la tarjeta PROPIA (las ajenas ya no se insertan).
          captureError(guardado.error, { context: 'score_grupo_finalize_historical' })
          addToast({ type: 'error', title: 'Error guardando tu tarjeta', message: 'Tus scores están seguros. Intenta de nuevo.', duration: 5000 })
          // El toast invita a reintentar: el botón no puede quedar deshabilitado.
          setFinalizing(false)
          return
        }

        // Recalcular índice y nivel del jugador (non-blocking). El error del
        // RPC se reporta (antes se descartaba con `.then(() => {})`): el RPC
        // es SECURITY DEFINER sin `EXCEPTION WHEN OTHERS`, así que lo que
        // falle en la BD llega hasta acá.
        // Tarjeta propia nueva: el coach aprende de la ronda, igual que en el individual.
        if (guardado.status === 'insertada' && guardado.id) avisarAlCoachRondaNueva(guardado.id, j.user_id)
        void recalcularIndiceGolfers(supabase, j.user_id, {
          context: 'score_grupo_finalize.calcular_indice',
          level: 'warning',
          meta: { codigo, userId: j.user_id },
        })
        void actualizarNivelDelJugador(supabase, j.user_id).catch(() => {})
      } catch { /* no bloquear finalización si falla un jugador */ }
    }

    // Finalizar ronda
    const { error: updateErr } = await finalizarRondaLibre(supabase, codigo, { jugadorId: ronda.ronda_libre_jugadores[0]?.id })
    if (updateErr?.code === ERRCODE_SIN_RESPUESTA) {
      // El cierre no llegó (o no sabemos si llegó): no se navega a "terminada" en falso.
      // Reintentar es seguro: el historial es idempotente y el cierre devuelve P0002 si ya cerró.
      avisarSinServidor()
      return
    }
    if (!updateErr) clearScorerGrupoSnapshot(codigo)
    if (updateErr) {
      // No se reintenta acá: las filas de historical_rounds ya se crearon
      // arriba (el índice único las protege solo si hay course_id). La ronda
      // queda en_curso hasta el cierre automático; cierre transaccional e
      // idempotente = follow-up en REORDENAMIENTO_TRACKING.
      captureError(updateErr, { context: 'score_grupo_finalize_update_estado' })
    }
    router.push(`/ronda-libre/${codigo}?finished=true`)
  }

  return { finalizeRound, finalizing, confirmFinalize, discardRound, discarding, showDiscardConfirm, setShowDiscardConfirm }
}
