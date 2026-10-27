'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Aviso "Activa No molestar" al empezar a jugar (idea de un usuario: WhatsApp e
 * Instagram lo desconcentran en la ronda). La app es PWA: no puede silenciar el
 * teléfono, sólo recomendarlo una vez por ronda.
 *
 * Regla "¿mostrar en esta ronda?" — fuente única, la usan los tres scorers de
 * jugador (ronda libre individual, ronda libre de grupo y torneo):
 *  - Se muestra UNA vez por ronda y teléfono: ni al recargar ni en cada hoyo.
 *    El scorer individual y el de grupo de la misma ronda comparten la clave.
 *  - Se registra como visto ANTES de mostrarlo. Si el almacenamiento falla
 *    (Safari privado, cuota llena, bloqueado) no se muestra: más vale no
 *    recomendar que repetir el aviso en cada recarga en plena cancha.
 *  - Nunca lanza: cualquier error = no se muestra, el scorer sigue igual.
 */

export const CLAVE_STORAGE_AVISO_NO_MOLESTAR = 'gp:aviso-no-molestar:v1'
/** Rondas recordadas: tope para que la lista no crezca para siempre. */
export const MAX_RONDAS_RECORDADAS = 50
/** El scorer pinta primero; el aviso entra después (no retrasa el primer render). */
export const RETRASO_AVISO_MS = 400

type Almacen = Pick<Storage, 'getItem' | 'setItem'>

/** Clave por ronda. `null` mientras el scorer no está listo para anotar. */
export function claveAvisoRondaLibre(codigo: string | null | undefined): string | null {
  return codigo ? `ronda-libre:${codigo}` : null
}

export function claveAvisoTorneo(roundId: string | null | undefined): string | null {
  return roundId ? `torneo:${roundId}` : null
}

function leerVistas(almacen: Almacen): string[] {
  const crudo = almacen.getItem(CLAVE_STORAGE_AVISO_NO_MOLESTAR)
  if (!crudo) return []
  try {
    const lista: unknown = JSON.parse(crudo)
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return [] // dato corrupto: se trata como vacío y se reescribe
  }
}

/**
 * Decide si se muestra el aviso para `clave` y, si corresponde, lo deja
 * registrado como visto. true = mostrar ahora. Nunca lanza.
 */
export function reclamarAvisoNoMolestar(almacen: Almacen | null | undefined, clave: string | null): boolean {
  if (!clave || !almacen) return false
  try {
    const vistas = leerVistas(almacen)
    if (vistas.includes(clave)) return false
    const nuevas = [...vistas, clave].slice(-MAX_RONDAS_RECORDADAS)
    almacen.setItem(CLAVE_STORAGE_AVISO_NO_MOLESTAR, JSON.stringify(nuevas))
    // Confirmar que quedó escrito: si no se puede recordar, no se muestra.
    return leerVistas(almacen).includes(clave)
  } catch {
    return false
  }
}

function almacenLocal(): Almacen | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null // acceder a localStorage puede lanzar (SecurityError)
  }
}

/**
 * @param clave  clave de la ronda (`claveAvisoRondaLibre` / `claveAvisoTorneo`),
 *               o `null` mientras el jugador todavía no puede anotar.
 */
export function useAvisoNoMolestar(clave: string | null): { abierto: boolean; cerrar: () => void } {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!clave) return
    const id = setTimeout(() => {
      if (reclamarAvisoNoMolestar(almacenLocal(), clave)) setAbierto(true)
    }, RETRASO_AVISO_MS)
    return () => clearTimeout(id)
  }, [clave])

  const cerrar = useCallback(() => setAbierto(false), [])
  return { abierto, cerrar }
}
