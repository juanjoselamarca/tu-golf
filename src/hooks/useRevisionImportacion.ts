// Estado del paso "Revisar rondas" del importador: qué rondas se aceptan o
// descartan, cuáles están abiertas, la corrección de golpes y el formato/modo que
// se aplica a todas al confirmar. La vista vive en components/import/StepReview.
import { useState, useCallback } from 'react'
import type { ImportRoundData } from '@/lib/import-types'
import { useConfirmarImportacion, type ResultadoConfirmacion } from '@/hooks/useConfirmarImportacion'
import { resumenDeRevision, type CardStatus } from '@/components/import/review-helpers'
import { GOLPES_MAX_POR_HOYO, GOLPES_MIN_POR_HOYO } from '@/golf/ronda-libre/golpes-por-hoyo'

export type FormatoImportacion = NonNullable<ImportRoundData['formato_juego']>
export type ModoImportacion = NonNullable<ImportRoundData['modo_juego']>

/** Stableford y Match Play se juegan siempre en neto en Golfers+ (decisión de producto, la misma de
 *  `formatLabel` en @/golf/core/rules; las reglas permiten jugarlos gross): el modo no se elige. */
export function modoEsForzado(formato: FormatoImportacion): boolean {
  return formato === 'stableford' || formato === 'match_play'
}

/** Ronda con el golpe de un hoyo corregido y el total recalculado. */
export function conGolpeCorregido(round: ImportRoundData, hoyo: number, golpes: number): ImportRoundData {
  const scores = { ...round.scores, [String(hoyo)]: golpes }
  const total = Object.values(scores).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0)
  return { ...round, scores, total_gross: total }
}

interface Opciones {
  rondasIniciales: ImportRoundData[]
  jobId: string | null
  onConfirm: (resultado: ResultadoConfirmacion, aceptadas: ImportRoundData[]) => void
}

export function useRevisionImportacion({ rondasIniciales, jobId, onConfirm }: Opciones) {
  const [rounds, setRounds] = useState<ImportRoundData[]>(rondasIniciales)
  const [decisions, setDecisions] = useState<Record<string, CardStatus>>(() =>
    Object.fromEntries(rondasIniciales.map(r => [r.tempId, 'accepted' as const])),
  )
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({})
  const [formato, setFormato] = useState<FormatoImportacion>('stroke_play')
  const [modo, setModo] = useState<ModoImportacion>('gross')
  const { confirmando, error: confirmError, todasDuplicadas, confirmar } = useConfirmarImportacion()

  const modoForzado = modoEsForzado(formato)
  const modoEfectivo: ModoImportacion = modoForzado ? 'neto' : modo

  const toggleExpand = useCallback((tempId: string) => {
    setExpandedCards(prev => ({ ...prev, [tempId]: !prev[tempId] }))
  }, [])

  const decidir = useCallback((tempId: string, status: CardStatus) => {
    setDecisions(prev => ({ ...prev, [tempId]: status }))
    if (status === 'rejected') setExpandedCards(prev => ({ ...prev, [tempId]: false }))
  }, [])

  /** Corrige los golpes de un hoyo. Fuera de rango o no numérico: no cambia nada. */
  const corregirGolpe = useCallback((tempId: string, hoyo: number, golpes: number) => {
    if (!Number.isInteger(golpes) || golpes < GOLPES_MIN_POR_HOYO || golpes > GOLPES_MAX_POR_HOYO) return
    setRounds(prev => prev.map(r => (r.tempId === tempId ? conGolpeCorregido(r, hoyo, golpes) : r)))
  }, [])

  // La celebración cuenta lo que el servidor guardó (ver useConfirmarImportacion).
  const confirmarAceptadas = async () => {
    const aceptadas = rounds
      .filter(r => decisions[r.tempId] === 'accepted')
      .map(r => ({ ...r, formato_juego: formato, modo_juego: modoEfectivo }))
    const resultado = await confirmar(jobId, aceptadas)
    if (!resultado) return
    onConfirm(resultado, aceptadas)
  }

  return {
    rounds,
    decisions,
    expandedCards,
    resumen: resumenDeRevision(rounds, decisions),
    formato,
    setFormato,
    modoEfectivo,
    modoForzado,
    setModo,
    confirmando,
    confirmError,
    todasDuplicadas,
    toggleExpand,
    decidir,
    corregirGolpe,
    confirmarAceptadas,
  }
}
