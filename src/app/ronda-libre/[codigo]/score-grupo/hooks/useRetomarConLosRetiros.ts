'use client'

import { useEffect, useRef } from 'react'
import type { RondaLibre } from '@/types/ronda'
import { hoyoInicial } from './useRondaGrupoData'

/**
 * Timba libre: el scorer se abre en `hoyoInicial` sin saber los retiros (llegan después, con `GET /juego`), así que
 * con un retirado abría en el hoyo del retiro. Cuando los retiros llegan por PRIMERA vez y el anotador sigue en el
 * hoyo de la carga, lo lleva al hoyo que de verdad le falta al grupo. Una sola vez: después, un retiro nuevo o un
 * cambio de hoyo del anotador nunca lo mueven solo.
 *
 * `retiros`: `null` mientras no se saben (o fuera de una Timba).
 */
export function useRetomarConLosRetiros(input: {
  ronda: RondaLibre | null
  scores: Record<string, Record<number, number>>
  equipos: ReadonlyArray<{ scores: Record<string, number> }>
  retiros: Readonly<Record<string, number>> | null
  currentHole: number
  setCurrentHole: (hoyo: number) => void
}): void {
  const { ronda, scores, equipos, retiros, currentHole, setCurrentHole } = input
  const hecho = useRef(false)
  useEffect(() => {
    if (hecho.current || !ronda || retiros == null) return
    hecho.current = true
    if (Object.keys(retiros).length === 0) return
    if (currentHole !== hoyoInicial(ronda, scores, equipos)) return
    const conRetiros = hoyoInicial(ronda, scores, equipos, retiros)
    if (conRetiros !== currentHole) setCurrentHole(conRetiros)
  }, [ronda, scores, equipos, retiros, currentHole, setCurrentHole])
}
