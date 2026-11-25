'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { esFormatoSkins } from '@/golf/formats/skins/clave'
import type { ContextoValidacionSkins, FueraPorJugador } from '@/golf/formats/skins'
import { leerReglasSkins, valorDelHoyoSkins, type ValorDelHoyoSkins } from '@/golf/ronda-libre/skins-del-scorer'
import { contextoSkinsDeRondaNueva } from '@/lib/data/skins-ronda-nueva'
import type { RondaLibre } from '@/types/ronda'

/** Sin señal al abrir, se vuelve a pedir el contexto cada tanto (el «Vale N» aparece apenas vuelve). */
export const REINTENTO_CONTEXTO_SKINS_MS = 30_000

/**
 * «Vale N skins» del hoyo en pantalla. Fuera del skins no pide nada y devuelve `null`. El contexto (CH congelado de
 * cada jugador y SI de los hoyos) se lee una vez con `contextoSkinsDeRondaNueva`, el mismo que validó al crear: el
 * índice de `ronda_libre_jugadores.handicap` (fijado al crear) con el tee de cada uno. Mientras no se pueda leer, o
 * si el motor bloquea, no se muestra cifra.
 */
export function useValorDelHoyoSkins(input: {
  ronda: RondaLibre | null
  scores: Readonly<Record<string, Readonly<Record<number, number>>>>
  fuera: FueraPorJugador | undefined
  currentHole: number
}): ValorDelHoyoSkins | null {
  const { ronda, scores, fuera, currentHole } = input
  const reglas = useMemo(
    () => (ronda && esFormatoSkins(ronda.formato_juego) ? leerReglasSkins(ronda.reglas_juego) : null),
    [ronda],
  )
  const [contexto, setContexto] = useState<ContextoValidacionSkins | null>(null)

  useEffect(() => {
    if (!ronda || !reglas || !ronda.course_id) return
    const jugadores = reglas.jugadorIds.map(id => ronda.ronda_libre_jugadores.find(j => j.id === id))
    if (jugadores.some(j => !j)) return
    const courseId = ronda.course_id
    let vivo = true
    let reintento: ReturnType<typeof setTimeout> | null = null
    const cargar = async () => {
      try {
        const ctx = await contextoSkinsDeRondaNueva(createClient(), {
          courseId, holes: ronda.holes, hoyoInicio: ronda.hoyo_inicio ?? null, recorridos: ronda.recorridos ?? null,
          tees: ronda.tees, modo: reglas.config.modo,
          jugadores: jugadores.map(j => ({ nombre: j!.nombre, indice: j!.handicap ?? null, tees: j!.tees ?? null })),
        })
        if (vivo) setContexto(ctx)
      } catch (err) {
        void captureError(err, { context: 'score_grupo.skins_contexto', level: 'warning', meta: { codigo: ronda.codigo } })
        if (vivo) reintento = setTimeout(() => { void cargar() }, REINTENTO_CONTEXTO_SKINS_MS)
      }
    }
    void cargar()
    return () => { vivo = false; if (reintento) clearTimeout(reintento) }
    // La ronda llega una vez; sus jugadores y reglas no cambian a mitad de un skins.
  }, [ronda?.id, reglas != null]) // eslint-disable-line react-hooks/exhaustive-deps

  return useMemo(
    () => (reglas && contexto ? valorDelHoyoSkins({ reglas, contexto, scores, fuera, hoyo: currentHole }) : null),
    [reglas, contexto, scores, fuera, currentHole],
  )
}
