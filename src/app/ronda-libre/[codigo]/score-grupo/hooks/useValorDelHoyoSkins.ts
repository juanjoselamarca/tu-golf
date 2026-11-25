'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { esFormatoSkins } from '@/golf/formats/skins/clave'
import type { ContextoValidacionSkins, FueraPorJugador } from '@/golf/formats/skins'
import { leerReglasSkins, valorDelHoyoSkins, type ValorDelHoyoSkins } from '@/golf/ronda-libre/skins-del-scorer'
import { contextoSkinsDeRondaNueva, esFalloDeSenalDelContextoSkins } from '@/lib/data/skins-ronda-nueva'
import { PLAZO_CARGA_SCORER_MS } from '@/lib/data/ronda-libre-scorer'
import { conPlazoCancelable, LecturaCanceladaError } from '@/lib/red/con-timeout'
import { clienteConSenal } from '@/lib/red/cliente-con-senal'
import type { RondaLibre } from '@/types/ronda'

/**
 * Esperas entre lecturas tras un fallo de señal: 30 s, 60 s y 120 s; desde ahí, cada 120 s (tope). Sin señal en la
 * cancha la cifra aparece apenas vuelve, sin martillar la red.
 */
export const ESPERAS_CONTEXTO_SKINS_MS: readonly number[] = [30_000, 60_000, 120_000]

/** Espera antes del reintento `n` (1 = el primero): la de la tabla, o la última si ya se pasó. */
export function esperaDelReintento(n: number, esperas: readonly number[] = ESPERAS_CONTEXTO_SKINS_MS): number {
  return esperas[Math.min(Math.max(n, 1), esperas.length) - 1]
}

/**
 * «Vale N skins» del hoyo en pantalla. Fuera del skins no pide nada y devuelve `null`. El contexto (CH de cada jugador
 * y SI de los hoyos) se lee con `contextoSkinsDeRondaNueva`, el mismo que validó al crear: el índice de
 * `ronda_libre_jugadores.handicap` (fijado al crear) con el tee de cada uno. Mientras no se pueda leer, o si el motor
 * bloquea, no se muestra cifra.
 *
 * Cada lectura tiene plazo y se cancela de verdad (la señal llega al fetch) al vencer o al desmontar. Solo se
 * reintenta un fallo de señal (`esFalloDeSenalDelContextoSkins`), con `ESPERAS_CONTEXTO_SKINS_MS`; un dato que falta
 * en la cancha (un tee sin rating) no se arregla releyendo y no se reintenta. El fallo se reporta una sola vez por
 * montaje.
 */
export function useValorDelHoyoSkins(input: {
  ronda: RondaLibre | null
  scores: Readonly<Record<string, Readonly<Record<number, number>>>>
  fuera: FueraPorJugador | undefined
  currentHole: number
  /** Solo tests: plazo de cada lectura y esperas entre reintentos. */
  plazoMs?: number
  esperasMs?: readonly number[]
}): ValorDelHoyoSkins | null {
  const { ronda, scores, fuera, currentHole, plazoMs = PLAZO_CARGA_SCORER_MS, esperasMs = ESPERAS_CONTEXTO_SKINS_MS } = input
  const reglas = useMemo(
    () => (ronda && esFormatoSkins(ronda.formato_juego) ? leerReglasSkins(ronda.reglas_juego) : null),
    [ronda],
  )
  const [contexto, setContexto] = useState<ContextoValidacionSkins | null>(null)
  const reportadoRef = useRef(false)

  useEffect(() => {
    if (!ronda || !reglas || !ronda.course_id) return
    const jugadores = reglas.jugadorIds.map(id => ronda.ronda_libre_jugadores.find(j => j.id === id))
    if (jugadores.some(j => !j)) return
    const courseId = ronda.course_id
    const vida = new AbortController()
    let reintento: ReturnType<typeof setTimeout> | null = null
    const cargar = async (fallos: number) => {
      try {
        const supabase = createClient()
        const ctx = await conPlazoCancelable(senal => contextoSkinsDeRondaNueva(clienteConSenal(supabase, senal), {
          courseId, holes: ronda.holes, hoyoInicio: ronda.hoyo_inicio ?? null, recorridos: ronda.recorridos ?? null,
          tees: ronda.tees, modo: reglas.config.modo,
          jugadores: jugadores.map(j => ({ nombre: j!.nombre, indice: j!.handicap ?? null, tees: j!.tees ?? null })),
        }), plazoMs, { signal: vida.signal })
        if (!vida.signal.aborted) setContexto(ctx)
      } catch (err) {
        if (vida.signal.aborted || err instanceof LecturaCanceladaError) return
        if (!reportadoRef.current) {
          reportadoRef.current = true
          void captureError(err, { context: 'score_grupo.skins_contexto', level: 'warning', meta: { codigo: ronda.codigo } })
        }
        if (!esFalloDeSenalDelContextoSkins(err)) return
        reintento = setTimeout(() => { void cargar(fallos + 1) }, esperaDelReintento(fallos + 1, esperasMs))
      }
    }
    void cargar(0)
    return () => { vida.abort(); if (reintento) clearTimeout(reintento) }
    // La ronda llega una vez; sus jugadores y reglas no cambian a mitad de un skins.
  }, [ronda?.id, reglas != null]) // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(
    () => (reglas && contexto ? valorDelHoyoSkins({ reglas, contexto, scores, fuera, hoyo: currentHole }) : null),
    [reglas, contexto, scores, fuera, currentHole],
  )
}
