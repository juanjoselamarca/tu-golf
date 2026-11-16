'use client'

import { useState } from 'react'
import type { ModoJuego } from '@/golf/core/rules'
import { prepararJuegoDeRondaNueva } from '@/golf/ronda-libre/juego-de-ronda-nueva'
import type { ProblemaDeLaRonda } from '@/golf/ronda-libre/validar-nueva-ronda'
import { usePuedeCrearTimba } from './usePuedeCrearTimba'
import {
  configParaEnviar, problemaDeLaTimba, timbaDePlantilla, type JugadorDeLaTimba, type TimbaDelFormulario,
} from './timba-del-formulario'

const TITULO = 'Revisa el juego'

/** Plantilla con la que abre "elegir el juego" (la primera del catálogo, como en la maqueta). */
export const PLANTILLA_INICIAL = 'colombiana' as const

/**
 * Lo que pide la Timba para crearse, con la MISMA función que corre la API (`prepararJuegoDeRondaNueva`):
 * cancha del catálogo, validador canónico y modo del juego = modo de la ronda. Si pasa acá, pasa allá.
 */
export function problemaParaCrearLaTimba(
  timba: TimbaDelFormulario, jugadores: readonly JugadorDeLaTimba[], holes: number, modo: ModoJuego, courseId: string | null,
): ProblemaDeLaRonda | null {
  const r = prepararJuegoDeRondaNueva({
    reglasJuego: configParaEnviar(timba, jugadores.map(j => j.id), modo),
    modoDeLaRonda: modo,
    jugadores,
    holes,
    courseId,
    nuevoId: () => '',
  })
  return r.ok ? null : { titulo: TITULO, detalle: r.error }
}

/** Lo que frena el paso Jugadores: todo menos las parejas, que se eligen en Confirmar. */
export function problemaDeLaTimbaEnJugadores(
  timba: TimbaDelFormulario, jugadores: readonly JugadorDeLaTimba[], holes: number, modo: ModoJuego, courseId: string | null,
): ProblemaDeLaRonda | null {
  // Mismo texto que la API (prepararJuegoDeRondaNueva): sin cancha del catálogo no hay par por hoyo.
  if (!courseId) return problemaParaCrearLaTimba(timba, jugadores, holes, modo, courseId)
  return problemaDeLaTimba(timba, jugadores, holes, modo, { conParejas: false })
}

/**
 * Timba libre en el asistente. Solo existe si la regla única (`puedeCrearJuegoPersonalizado`, vía la API) lo
 * permite: sin permiso, `timba` es siempre null y la ronda se crea como siempre.
 */
export function useTimbaDeLaRonda() {
  const puedeElegir = usePuedeCrearTimba()
  const [elegida, setTimba] = useState<TimbaDelFormulario | null>(null)
  return {
    puedeElegir,
    timba: puedeElegir ? elegida : null,
    setTimba,
    elegir: () => setTimba(t => t ?? timbaDePlantilla(PLANTILLA_INICIAL)),
    soltar: () => setTimba(null),
  }
}
