'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type React from 'react'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'

/**
 * Navegación entre hoyos de una ronda libre — la MISMA para el scorer
 * individual y el de grupo. Antes cada uno derivaba la lista de hoyos por su
 * cuenta (y el individual además navegaba con `currentHole ± 1`, que en una
 * vuelta de 9 desde el 10 se salía de la ronda al deslizar).
 *
 * Fuente única de la lista: `hoyosDeLaRonda` (`@/golf/core/hoyos-jugados`).
 * Anterior / siguiente / deslizar recorren esa lista, nunca el número de hoyo.
 *
 * `progressRowRef` va en la fila de progreso; cada celda lleva
 * `data-hoyo={n}` y el hoyo actual se centra solo. Por número, no por
 * posición: la fila puede tener un separador entre front y back, y una ronda
 * desde el 10 no tiene celdas 1..9.
 */
export interface HoleNavigationOptions {
  hoyoInicio: number
  totalHoles: number
  currentHole: number
  setCurrentHole: React.Dispatch<React.SetStateAction<number>>
}

export interface HoleNavigation {
  /** Hoyos de la ronda en orden de juego. Memoizado: es dependencia de otros memos. */
  ordenHoyos: number[]
  currentHoleIdx: number
  isLastHole: boolean
  goToPrevHole: () => void
  /** Pasa al siguiente hoyo y lo devuelve; `null` si ya estaba en el último. */
  advanceHole: () => number | null
  swipeHandlers: {
    onTouchStart: (e: React.TouchEvent) => void
    onTouchEnd: (e: React.TouchEvent) => void
  }
  progressRowRef: React.RefObject<HTMLDivElement | null>
}

/** Umbral de deslizar: horizontal dominante y al menos 40px. */
export function esSwipeHorizontal(dx: number, dy: number): boolean {
  return Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 40
}

export function useHoleNavigation(opts: HoleNavigationOptions): HoleNavigation {
  const { hoyoInicio, totalHoles, currentHole, setCurrentHole } = opts

  const ordenHoyos = useMemo(() => hoyosDeLaRonda(hoyoInicio, totalHoles), [hoyoInicio, totalHoles])
  const currentHoleIdx = ordenHoyos.indexOf(currentHole)
  const isLastHole = currentHoleIdx >= totalHoles - 1

  const progressRowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = progressRowRef.current
    if (!row) return
    const cell = row.querySelector<HTMLElement>(`[data-hoyo="${currentHole}"]`)
    if (cell) cell.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [currentHole])

  const goToPrevHole = useCallback(() => {
    const prevIdx = ordenHoyos.indexOf(currentHole) - 1
    if (prevIdx >= 0) setCurrentHole(ordenHoyos[prevIdx])
  }, [ordenHoyos, currentHole, setCurrentHole])

  const advanceHole = useCallback((): number | null => {
    const nextIdx = ordenHoyos.indexOf(currentHole) + 1
    if (nextIdx <= 0 || nextIdx >= ordenHoyos.length) return null
    const next = ordenHoyos[nextIdx]
    setCurrentHole(next)
    return next
  }, [ordenHoyos, currentHole, setCurrentHole])

  const swipeRef = useRef({ startX: 0, startY: 0 })
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    swipeRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY }
  }, [])
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - swipeRef.current.startX
    const dy = e.changedTouches[0].clientY - swipeRef.current.startY
    if (!esSwipeHorizontal(dx, dy)) return
    const idx = ordenHoyos.indexOf(currentHole)
    if (dx < 0 && idx < ordenHoyos.length - 1) setCurrentHole(ordenHoyos[idx + 1])
    else if (dx > 0 && idx > 0) setCurrentHole(ordenHoyos[idx - 1])
  }, [ordenHoyos, currentHole, setCurrentHole])

  return {
    ordenHoyos,
    currentHoleIdx,
    isLastHole,
    goToPrevHole,
    advanceHole,
    swipeHandlers: { onTouchStart, onTouchEnd },
    progressRowRef,
  }
}
