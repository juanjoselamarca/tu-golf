'use client'

/**
 * "Guardar en mi historial" en la ronda terminada.
 *
 * Desde el 01-oct-2026 cada finalizador guarda SÓLO la tarjeta de quien finaliza
 * (`esMiTarjeta`): una ronda no entra al historial de otra persona sin su
 * confirmación. Este es ese camino: el jugador con cuenta cuya tarjeta quedó fuera
 * (la ronda la cerró otro, p. ej. el anotador del grupo) la guarda él mismo.
 * Mismo guardado que los finalizadores (`guardarTarjetaEnHistorial`), idempotente
 * por el índice único de `metadata.ronda_libre_jugador_id`.
 *
 * `vistaPrevia`: la tarjeta tal como va a quedar en el historial (misma función pura
 * que el guardado, `tarjetaParaHistorial`), con los hoyos estimados por WHS
 * (concedidos, ganados sin terminar, no jugados) para marcarlos en "Resumen de tu
 * ronda". Mientras la tarjeta no está guardada, el jugador puede corregirlos
 * (`corregir`): la corrección viaja como su score real y deja de ser estimado.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { isSharedBallFormat } from '@/golf/formats'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import type { HoyoEstimado } from '@/golf/core/ajuste-whs'
import { tarjetaParaHistorial } from '@/golf/ronda-libre/tarjeta-para-historial'
import { buildHolesArr } from '@/lib/ronda/match'
import { limitarGolpes } from '@/golf/ronda-libre/golpes-por-hoyo'
import {
  guardarTarjetaEnHistorial,
  tarjetaYaEnMiHistorial,
  recalcularIndiceGolfers,
  actualizarNivelDelJugador,
  avisarAlCoachRondaNueva,
} from '@/lib/data/ronda-libre-finalizar'
import type { RondaLibre } from '@/types/ronda'
import type { Equipo } from '../types'

/** `guardado` = ya está en el historial (guardada en esta sesión o antes, p. ej. por el finalizador). */
type Estado = 'oculto' | 'disponible' | 'guardando' | 'guardado'

export interface VistaPreviaTarjeta {
  /** Golpes como van al historial: los anotados + los estimados (+ las correcciones). */
  scores: Record<number, number>
  /** Hoyos estimados por WHS, tal como salieron de la tarjeta anotada (no cambian al corregir). */
  estimados: HoyoEstimado[]
  /** Golpes que el jugador corrigió en un hoyo estimado. */
  correcciones: Record<number, number>
}

export function useGuardarEnMiHistorial(input: {
  ronda: RondaLibre | null
  isFinished: boolean
  currentUserId: string | null | undefined
  parMap: Record<number, number>
  siMap: Record<number, number>
  /** Course handicap de SCORING por jugador (`loadRondaLibre`). */
  courseHcpMap: Record<string, number>
  sinIndice: readonly string[]
  equipos: Equipo[]
}): {
  estado: Estado
  guardar: () => Promise<void>
  vistaPrevia: VistaPreviaTarjeta | null
  corregir: (hoyo: number, golpes: number) => void
} {
  const { ronda, isFinished, currentUserId, parMap, siMap, courseHcpMap, sinIndice, equipos } = input
  const miJugador = ronda?.ronda_libre_jugadores.find(j => !!currentUserId && j.user_id === currentUserId) ?? null
  const [estado, setEstado] = useState<Estado>('oculto')
  const [correcciones, setCorrecciones] = useState<Record<number, number>>({})

  const equipo = ronda && miJugador && isSharedBallFormat(ronda.formato_juego)
    ? equipos.find(e => e.jugadorIds.includes(miJugador.id))
    : undefined
  const misScores = useMemo(
    () => (equipo?.scores ?? miJugador?.scores ?? {}) as Record<string | number, number>,
    [equipo, miJugador],
  )
  const hoyos = useMemo(() => (ronda ? hoyosDeLaRonda(ronda.hoyo_inicio, ronda.holes ?? 18) : []), [ronda])

  const base = useMemo(() => {
    if (!ronda || !miJugador) return null
    return tarjetaParaHistorial({
      ronda, jugadorId: miJugador.id, scores: misScores,
      scoresPorJugador: Object.fromEntries(ronda.ronda_libre_jugadores.map(j => [j.id, j.scores ?? {}])),
      hoyos, parMap, hoyosConSi: buildHolesArr(parMap, siMap),
      courseHcpPorJugador: courseHcpMap, sinIndice: new Set(sinIndice),
    })
  }, [ronda, miJugador, misScores, hoyos, parMap, siMap, courseHcpMap, sinIndice])

  const vistaPrevia = useMemo<VistaPreviaTarjeta | null>(() => {
    if (!base) return null
    const scores: Record<number, number> = {}
    for (const [k, v] of Object.entries(base.scores)) if (typeof v === 'number' && v >= 1) scores[Number(k)] = v
    return { scores: { ...scores, ...correcciones }, estimados: base.estimados, correcciones }
  }, [base, correcciones])

  const corregir = useCallback((hoyo: number, golpes: number) => {
    if (!Number.isInteger(golpes)) return
    // Mismo rango que el scorer (fuente única `golpes-por-hoyo`).
    setCorrecciones(prev => ({ ...prev, [hoyo]: limitarGolpes(golpes) }))
  }, [])

  const miJugadorId = miJugador?.id ?? null
  useEffect(() => {
    if (!isFinished || !miJugadorId) { setEstado('oculto'); return }
    let vivo = true
    void tarjetaYaEnMiHistorial(createClient(), miJugadorId).then(ya => {
      // Lectura fallida (null, p. ej. sin señal): se ofrece igual. El guardado es idempotente
      // (`duplicada` se maneja), y ocultarlo dejaría la ronda fuera del historial para siempre.
      if (vivo) setEstado(ya === true ? 'guardado' : 'disponible')
    })
    return () => { vivo = false }
  }, [isFinished, miJugadorId])

  const guardar = useCallback(async () => {
    if (!ronda || !miJugador || !currentUserId || estado !== 'disponible') return
    setEstado('guardando')
    const supabase = createClient()
    // Misma fila que guarda el finalizador: `guardarTarjetaEnHistorial` resuelve match
    // play ("Ganó 3&2"), el ajuste WHS de los hoyos sin terminar y el equipo.
    const resultado = await guardarTarjetaEnHistorial(supabase, {
      ronda,
      jugador: miJugador,
      userId: currentUserId,
      // Una corrección del jugador es su score real: el guardado ya no la estima.
      scores: { ...misScores, ...correcciones },
      scoresPorJugador: Object.fromEntries(ronda.ronda_libre_jugadores.map(j => [j.id, j.scores ?? {}])),
      hoyos,
      parMap,
      ratingsPorTee: new Map(),
      conId: true,
    })
    if (resultado.status === 'error') {
      void captureError(resultado.error, { context: 'ronda-terminada.guardar-en-mi-historial', meta: { codigo: ronda.codigo } })
      addToast({ title: 'No pudimos guardar la ronda', message: 'Intenta de nuevo en un momento.', type: 'error' })
      setEstado('disponible')
      return
    }
    // Nada que guardar: no se celebra ni se recalcula el índice sobre un historial que no cambió.
    if (resultado.status === 'sin_hoyos') {
      addToast({ title: 'Sin hoyos anotados', message: 'Esta tarjeta no tiene golpes para guardar.', type: 'info' })
      setEstado('oculto')
      return
    }
    if (resultado.status === 'duplicada') {
      void captureError(new Error('historical_rounds duplicada'), { context: 'ronda-terminada.guardar-en-mi-historial.duplicada', level: 'info', meta: { codigo: ronda.codigo } })
      addToast({ title: 'Esta tarjeta ya estaba registrada', type: 'info' })
      setEstado('guardado')
      return
    }
    if (resultado.id) avisarAlCoachRondaNueva(resultado.id, currentUserId)
    void recalcularIndiceGolfers(supabase, currentUserId, { context: 'ronda-terminada.calcular_indice', level: 'warning' })
    void actualizarNivelDelJugador(supabase, currentUserId).catch(() => {})
    addToast({ title: 'Ronda guardada en tu historial', type: 'success' })
    setEstado('guardado')
  }, [ronda, miJugador, currentUserId, estado, misScores, correcciones, hoyos, parMap])

  return { estado, guardar, vistaPrevia, corregir }
}
