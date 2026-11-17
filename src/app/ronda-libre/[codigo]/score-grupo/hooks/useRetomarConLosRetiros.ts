'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { RondaLibre } from '@/types/ronda'
import { hoyoInicial } from './useRondaGrupoData'

/**
 * Timba libre: el scorer se abre en `hoyoInicial` sin saber los retiros (llegan después, con `GET /juego`, que con
 * mala señal puede tardar decenas de segundos), así que con un retirado abría en el hoyo del retiro. Cuando los
 * retiros llegan por PRIMERA vez y el anotador NO tocó nada desde la carga, lo lleva al hoyo que de verdad le falta
 * al grupo. "Tocar" se registra, no se infiere: cambiar de hoyo (aunque vuelva al de la carga) o anotar/marcar
 * (`marcarInteraccion`). Una sola vez: después, un retiro nuevo nunca mueve la pantalla bajo el dedo.
 *
 * `listo`: la carga terminó (el hoyo en pantalla ya es el de la carga).
 * `retiros`: `null` mientras no se saben (o fuera de una Timba).
 */
export function useRetomarConLosRetiros(input: {
  ronda: RondaLibre | null
  listo: boolean
  scores: Record<string, Record<number, number>>
  equipos: ReadonlyArray<{ scores: Record<string, number> }>
  retiros: Readonly<Record<string, number>> | null
  currentHole: number
  setCurrentHole: (hoyo: number) => void
}): { marcarInteraccion: () => void } {
  const { ronda, listo, scores, equipos, retiros, currentHole, setCurrentHole } = input
  const hecho = useRef(false)
  const hoyoDeLaCarga = useRef<number | null>(null)
  const tocado = useRef(false)
  const marcarInteraccion = useCallback(() => { tocado.current = true }, [])
  useEffect(() => {
    if (hecho.current || !ronda || !listo) return
    if (hoyoDeLaCarga.current == null) hoyoDeLaCarga.current = currentHole
    else if (currentHole !== hoyoDeLaCarga.current) tocado.current = true
    if (retiros == null) return
    hecho.current = true
    if (tocado.current || Object.keys(retiros).length === 0) return
    const destino = hoyoInicial(ronda, scores, equipos, retiros)
    if (destino !== currentHole) setCurrentHole(destino)
  }, [ronda, listo, scores, equipos, retiros, currentHole, setCurrentHole])
  return { marcarInteraccion }
}
