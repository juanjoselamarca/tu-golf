'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { haptic } from '@/lib/ronda/helpers'

/** A1 anti-toque: cuánto dura el pedido de "toca otra vez". */
export const PENDING_CONFIRM_MS = 2000
/** A3: ventana de ediciones libres sobre el mismo jugador/hoyo tras confirmar. */
export const EDIT_WINDOW_MS = 3000

export interface PendingScoreConfirm {
  jugadorId: string
  hole: number
}

/**
 * Anti-toque del scorer de grupo (sacado de `useGrupoScoreSave` sin cambiar el comportamiento):
 *   - A1: cambiar un valor ya anotado pide 2 toques (2 s).
 *   - A3: tras un cambio, 3 s de ediciones libres sobre el mismo jugador/hoyo (correcciones 9→4 sin re-confirmar).
 * Al cambiar de hoyo se limpian los dos.
 */
export function useAntiToque(currentHole: number) {
  const [pendingScoreConfirm, setPendingScoreConfirm] = useState<PendingScoreConfirm | null>(null)
  const pendingScoreConfirmRef = useRef<PendingScoreConfirm | null>(null)
  const pendingConfirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editWindowRef = useRef<PendingScoreConfirm | null>(null)
  const editWindowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (pendingConfirmTimeoutRef.current) clearTimeout(pendingConfirmTimeoutRef.current)
    if (editWindowTimeoutRef.current) clearTimeout(editWindowTimeoutRef.current)
  }, [])

  useEffect(() => {
    setPendingScoreConfirm(null)
    pendingScoreConfirmRef.current = null
    if (pendingConfirmTimeoutRef.current) { clearTimeout(pendingConfirmTimeoutRef.current); pendingConfirmTimeoutRef.current = null }
    editWindowRef.current = null
    if (editWindowTimeoutRef.current) { clearTimeout(editWindowTimeoutRef.current); editWindowTimeoutRef.current = null }
  }, [currentHole])

  /**
   * ¿Se aplica el cambio? Con valor ya anotado y fuera de la ventana de edición, el 1er toque solo pide confirmar
   * (false) y el 2º dentro de 2 s confirma (true). Al aplicar abre/renueva la ventana de edición.
   */
  const puedeCambiar = useCallback((jugadorId: string, hole: number, hayValor: boolean): boolean => {
    const editWin = editWindowRef.current
    const inEditWindow = editWin?.jugadorId === jugadorId && editWin?.hole === hole
    if (hayValor && !inEditWindow) {
      const ref = pendingScoreConfirmRef.current
      const isConfirmed = ref?.jugadorId === jugadorId && ref?.hole === hole
      if (!isConfirmed) {
        const pending = { jugadorId, hole }
        setPendingScoreConfirm(pending)
        pendingScoreConfirmRef.current = pending
        haptic([15, 40, 15])
        if (pendingConfirmTimeoutRef.current) clearTimeout(pendingConfirmTimeoutRef.current)
        pendingConfirmTimeoutRef.current = setTimeout(() => {
          setPendingScoreConfirm(null)
          pendingScoreConfirmRef.current = null
        }, PENDING_CONFIRM_MS)
        return false
      }
      setPendingScoreConfirm(null)
      pendingScoreConfirmRef.current = null
      if (pendingConfirmTimeoutRef.current) {
        clearTimeout(pendingConfirmTimeoutRef.current)
        pendingConfirmTimeoutRef.current = null
      }
    }
    editWindowRef.current = { jugadorId, hole }
    if (editWindowTimeoutRef.current) clearTimeout(editWindowTimeoutRef.current)
    editWindowTimeoutRef.current = setTimeout(() => {
      editWindowRef.current = null
    }, EDIT_WINDOW_MS)
    return true
  }, [])

  return { pendingScoreConfirm, puedeCambiar }
}
