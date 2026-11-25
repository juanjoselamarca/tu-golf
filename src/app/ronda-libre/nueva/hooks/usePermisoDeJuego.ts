'use client'

import { useEffect, useState } from 'react'
import { TIMBA_LIBRE_ABIERTA } from '@/lib/auth/timba-libre-abierta'
import { SKINS_LIBRE_ABIERTO } from '@/lib/auth/skins-libre-abierto'

/** Esperas antes de cada reintento cuando la pregunta falla por red o por un 5xx (en la cancha la señal va y viene). */
export const ESPERAS_REINTENTO_PERMISO_MS: readonly number[] = [500, 1500]

/**
 * Tope de cada pregunta. Con señal que va y viene, un fetch puede quedar colgado sin error ni respuesta: sin tope,
 * el permiso quedaba «cargando» para siempre (y «Repetir» de un Skins, esperando sin avisar). Al vencer cuenta como
 * fallo de red: reintenta y, tras los reintentos, `no`.
 */
export const TOPE_PREGUNTA_PERMISO_MS = 6000

/**
 * Si el usuario de la sesión puede crear un juego personalizado (Timba libre o Skins): no copia la regla, la pregunta
 * a `GET /api/ronda-libre/permiso-timba`, que usa `puedeCrearJuegoPersonalizado` (la misma función que valida
 * `POST /create`). `abierto` es el interruptor del juego: con `false` no se pregunta y la respuesta es `false`.
 * Ante un error de red o un 5xx reintenta (`esperasMs`) antes de rendirse. Falla CERRADO: mientras carga, con un
 * "no", un 4xx o sin señal tras los reintentos, `false` → se ve "Próximamente".
 */
export function usePermisoDeJuegoPersonalizado(
  abierto: boolean, esperasMs: readonly number[] = ESPERAS_REINTENTO_PERMISO_MS,
): boolean {
  return useEstadoDelPermisoDeJuego(abierto, esperasMs) === 'si'
}

/** `cargando` mientras la pregunta (o sus reintentos) sigue en curso; `no` también sin señal tras los reintentos. */
export type EstadoDelPermiso = 'cargando' | 'si' | 'no'

/**
 * El permiso con su estado: quien necesita esperar la respuesta (repetir un Skins, `useRepetirRonda`) distingue
 * «todavía no sé» de «no». Mismo contrato y misma pregunta que `usePermisoDeJuegoPersonalizado`.
 */
export function useEstadoDelPermisoDeJuego(
  abierto: boolean, esperasMs: readonly number[] = ESPERAS_REINTENTO_PERMISO_MS, topeMs: number = TOPE_PREGUNTA_PERMISO_MS,
): EstadoDelPermiso {
  const [puede, setPuede] = useState<EstadoDelPermiso>('cargando')
  useEffect(() => {
    if (!abierto) return
    let vigente = true
    let reloj: ReturnType<typeof setTimeout> | undefined
    let enCurso: { corte: AbortController; tope: ReturnType<typeof setTimeout> } | undefined
    const preguntar = (intento: number) => {
      const reintentar = () => {
        if (!vigente) return
        if (intento >= esperasMs.length) return setPuede('no') // sin señal: falla cerrado; el servidor igual valida al crear
        reloj = setTimeout(() => preguntar(intento + 1), esperasMs[intento])
      }
      const corte = new AbortController()
      const tope = setTimeout(() => corte.abort(), topeMs)
      enCurso = { corte, tope }
      fetch('/api/ronda-libre/permiso-timba', { cache: 'no-store', signal: corte.signal })
        .then(async r => {
          if (r.status >= 500) return reintentar()
          const d = (r.ok ? await r.json() : null) as { puedeCrear?: unknown } | null
          if (vigente) setPuede(d?.puedeCrear === true ? 'si' : 'no')
        })
        .catch(reintentar)
        .finally(() => clearTimeout(tope))
    }
    preguntar(0)
    return () => {
      vigente = false
      if (reloj) clearTimeout(reloj)
      if (enCurso) { clearTimeout(enCurso.tope); enCurso.corte.abort() }
    }
  }, [abierto, esperasMs, topeMs])
  return abierto ? puede : 'no'
}

/**
 * El permiso de juegos del asistente (Timba libre y Skins): una sola pregunta mientras alguno de los dos esté
 * abierto. Cada juego aplica después su interruptor (`useTimbaDeLaRonda`, `useSkinsDeLaRonda`).
 */
export function usePermisoDeJuegosDeLaRonda(esperasMs: readonly number[] = ESPERAS_REINTENTO_PERMISO_MS): boolean {
  return useEstadoDelPermisoDeJuegosDeLaRonda(esperasMs) === 'si'
}

/** `usePermisoDeJuegosDeLaRonda` con su estado (`cargando` / `si` / `no`). */
export function useEstadoDelPermisoDeJuegosDeLaRonda(esperasMs: readonly number[] = ESPERAS_REINTENTO_PERMISO_MS): EstadoDelPermiso {
  return useEstadoDelPermisoDeJuego(TIMBA_LIBRE_ABIERTA || SKINS_LIBRE_ABIERTO, esperasMs)
}
