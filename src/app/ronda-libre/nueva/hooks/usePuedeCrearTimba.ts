'use client'

import { useEffect, useState } from 'react'
import { TIMBA_LIBRE_ABIERTA } from '@/lib/auth/timba-libre-abierta'

/** Esperas antes de cada reintento cuando la pregunta falla por red o por un 5xx (en la cancha la señal va y viene). */
export const ESPERAS_REINTENTO_PERMISO_MS: readonly number[] = [500, 1500]

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
  const [puede, setPuede] = useState(false)
  useEffect(() => {
    if (!abierto) return
    let vigente = true
    let reloj: ReturnType<typeof setTimeout> | undefined
    const preguntar = (intento: number) => {
      const reintentar = () => {
        if (!vigente || intento >= esperasMs.length) return // sin señal: queda en false; el servidor igual valida al crear
        reloj = setTimeout(() => preguntar(intento + 1), esperasMs[intento])
      }
      fetch('/api/ronda-libre/permiso-timba', { cache: 'no-store' })
        .then(async r => {
          if (r.status >= 500) return reintentar()
          const d = (r.ok ? await r.json() : null) as { puedeCrear?: unknown } | null
          if (vigente) setPuede(d?.puedeCrear === true)
        })
        .catch(reintentar)
    }
    preguntar(0)
    return () => { vigente = false; if (reloj) clearTimeout(reloj) }
  }, [abierto, esperasMs])
  return abierto && puede
}

/** Si el usuario puede elegir Timba libre: el permiso, con el interruptor `TIMBA_LIBRE_ABIERTA`. */
export function usePuedeCrearTimba(esperasMs: readonly number[] = ESPERAS_REINTENTO_PERMISO_MS): boolean {
  return usePermisoDeJuegoPersonalizado(TIMBA_LIBRE_ABIERTA, esperasMs)
}
