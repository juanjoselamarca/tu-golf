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
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import { isSharedBallFormat } from '@/golf/formats'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import {
  guardarTarjetaEnHistorial,
  tarjetaYaEnMiHistorial,
  recalcularIndiceGolfers,
  actualizarNivelDelJugador,
  avisarAlCoachRondaNueva,
  extrasDeTarjeta,
} from '@/lib/data/ronda-libre-finalizar'
import type { RondaLibre } from '@/types/ronda'
import type { Equipo } from '../types'

type Estado = 'oculto' | 'disponible' | 'guardando' | 'guardado'

export function useGuardarEnMiHistorial(input: {
  ronda: RondaLibre | null
  isFinished: boolean
  currentUserId: string | null | undefined
  parMap: Record<number, number>
  equipos: Equipo[]
}): { estado: Estado; guardar: () => Promise<void> } {
  const { ronda, isFinished, currentUserId, parMap, equipos } = input
  const miJugador = ronda?.ronda_libre_jugadores.find(j => !!currentUserId && j.user_id === currentUserId) ?? null
  const [estado, setEstado] = useState<Estado>('oculto')

  const miJugadorId = miJugador?.id ?? null
  useEffect(() => {
    if (!isFinished || !miJugadorId) { setEstado('oculto'); return }
    let vivo = true
    void tarjetaYaEnMiHistorial(createClient(), miJugadorId).then(ya => {
      // Lectura fallida (null): no se ofrece, para no invitar a duplicar.
      if (vivo) setEstado(ya === false ? 'disponible' : 'oculto')
    })
    return () => { vivo = false }
  }, [isFinished, miJugadorId])

  const guardar = useCallback(async () => {
    if (!ronda || !miJugador || !currentUserId || estado !== 'disponible') return
    setEstado('guardando')
    const supabase = createClient()
    const equipo = isSharedBallFormat(ronda.formato_juego) ? equipos.find(e => e.jugadorIds.includes(miJugador.id)) : undefined
    const misScores = equipo?.scores ?? miJugador.scores ?? {}
    const hoyos = hoyosDeLaRonda(ronda.hoyo_inicio, ronda.holes ?? 18)
    // Misma fila que guarda el finalizador: match play ("3&2") y equipo incluidos.
    const { matchResult, teamName } = await extrasDeTarjeta(supabase, {
      ronda,
      jugadorId: miJugador.id,
      scoresPorJugador: { ...Object.fromEntries(ronda.ronda_libre_jugadores.map(j => [j.id, j.scores ?? {}])), [miJugador.id]: misScores },
      hoyos,
    })
    const resultado = await guardarTarjetaEnHistorial(supabase, {
      ronda,
      jugador: miJugador,
      userId: currentUserId,
      scores: misScores,
      hoyos,
      parMap,
      ratingsPorTee: new Map(),
      matchResult,
      teamName,
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
      setEstado('oculto')
      return
    }
    if (resultado.id) avisarAlCoachRondaNueva(resultado.id, currentUserId)
    void recalcularIndiceGolfers(supabase, currentUserId, { context: 'ronda-terminada.calcular_indice', level: 'warning' })
    void actualizarNivelDelJugador(supabase, currentUserId).catch(() => {})
    addToast({ title: 'Ronda guardada en tu historial', type: 'success' })
    setEstado('guardado')
  }, [ronda, miJugador, currentUserId, estado, equipos, parMap])

  return { estado, guardar }
}
