'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { getGuestId, clearGuestSession } from '@/lib/guest-session'
import { captureError } from '@/lib/error-tracking'
import { addToast } from '@/hooks/useToast'

/**
 * Componente invisible que migra datos de invitado a la cuenta recién creada.
 *
 * Flujo:
 *   1. Invitado completa la ronda → modal "crear cuenta" → /register?next=/torneo/slug&guestId=X
 *   2. El usuario se registra → redirect a /torneo/slug?guestId=X
 *   3. Este componente detecta `guestId` en la URL + usuario autenticado
 *   4. Llama POST /api/torneos/[slug]/guest-claim con { guestId }
 *   5. Si OK → limpia localStorage y muestra toast de éxito
 *
 * Se monta en el layout del torneo como componente invisible.
 */
export function GuestClaim({ slug, isAuthenticated }: { slug: string; isAuthenticated: boolean }) {
  const searchParams = useSearchParams()
  const claimAttempted = useRef(false)

  useEffect(() => {
    if (claimAttempted.current) return
    if (!isAuthenticated) return

    // Verificar si hay un guestId en la URL o en localStorage
    const urlGuestId = searchParams.get('guestId')
    const localGuestId = getGuestId()
    const guestId = urlGuestId || localGuestId
    if (!guestId) return

    claimAttempted.current = true

    const claim = async () => {
      try {
        const res = await fetch(`/api/torneos/${encodeURIComponent(slug)}/guest-claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestId }),
        })

        if (res.ok) {
          clearGuestSession()
          addToast({
            type: 'success',
            title: 'Cuenta vinculada',
            message: 'Tu ronda como invitado ahora está en tu perfil.',
            duration: 5000,
          })
        } else {
          const body = await res.json().catch(() => ({}))
          // Si ya fue reclamado o ya estaba inscrito, limpiar la sesión igual
          if (body.error === 'already_claimed' || body.error === 'already_registered') {
            clearGuestSession()
          }
          // No mostrar error al usuario si ya reclamado — es idempotente
        }
      } catch (e) {
        void captureError(e, { context: 'guest-claim', meta: { slug, guestId } })
        // Fallo silencioso — el guest data sigue en la tabla, se puede reclamar después
      }
    }

    void claim()
  }, [isAuthenticated, slug, searchParams])

  return null
}
