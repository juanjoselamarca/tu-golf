'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * ¿Hay en pantalla un aviso de que lo anotado NO se va a subir solo (sesión cerrada, sin acceso)?
 *
 * Por qué existe (18-nov-2026): `OfflineBanner` vive en el layout, fijo arriba, y con hoyos en el respaldo
 * decía "Sincronizando N hoyos…" encima del encabezado del scorer, al mismo tiempo que el aviso del scorer
 * decía "Tu sesión se cerró… inicia sesión". Prometía algo que no iba a pasar y tapaba el aviso verdadero.
 * Los avisos de los tres scorers (torneo, ronda libre y grupo) se anuncian acá y el banner global se calla.
 */

let activos = 0
const oyentes = new Set<() => void>()
const avisar = () => oyentes.forEach(o => o())

function suscribir(oyente: () => void) {
  oyentes.add(oyente)
  return () => { oyentes.delete(oyente) }
}

/** Lo llama el aviso mientras está a la vista. */
export function useAnunciarAvisoDeSesion(activo: boolean): void {
  useEffect(() => {
    if (!activo) return
    activos++
    avisar()
    return () => { activos--; avisar() }
  }, [activo])
}

export function useHayAvisoDeSesion(): boolean {
  return useSyncExternalStore(suscribir, () => activos > 0, () => false)
}
