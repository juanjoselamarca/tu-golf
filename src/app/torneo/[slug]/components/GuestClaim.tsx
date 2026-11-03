'use client'

import { useEffect, useRef } from 'react'
import { getGuestId, getGuestToken, clearGuestSession } from '@/lib/guest-session'
import { captureError } from '@/lib/error-tracking'
import { addToast } from '@/hooks/useToast'

/**
 * Componente invisible que migra datos de invitado a la cuenta recién creada.
 *
 * Flujo:
 *   1. Invitado completa la ronda → modal "crear cuenta" → registerUrl(`/torneo/slug`)
 *   2. El usuario se registra → redirect a /torneo/slug
 *   3. Este componente toma el `guestId` y el `guestToken` de localStorage + usuario autenticado
 *   4. Llama POST /api/torneos/[slug]/guest-claim con { guestId, guestToken }
 *      (el token prueba que el guestId es de este dispositivo; ya no se acepta un
 *      ?guestId= de la URL: nadie lo generaba y sin token el servidor lo rechaza)
 *   5. Si OK → limpia localStorage y muestra toast de éxito
 *
 * Se monta en el layout del torneo como componente invisible.
 */
export function GuestClaim({ slug, isAuthenticated }: { slug: string; isAuthenticated: boolean }) {
  const claimAttempted = useRef(false)

  useEffect(() => {
    if (claimAttempted.current) return
    if (!isAuthenticated) return

    const guestId = getGuestId()
    const guestToken = getGuestToken()
    if (!guestId || !guestToken) return

    claimAttempted.current = true

    const claim = async () => {
      try {
        const res = await fetch(`/api/torneos/${encodeURIComponent(slug)}/guest-claim`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestId, guestToken }),
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
        void captureError(e, { context: 'guest-claim', meta: { slug } }) // sin guestId: es la credencial del invitado
        // Fallo silencioso — el guest data sigue en la tabla, se puede reclamar después
      }
    }

    void claim()
  }, [isAuthenticated, slug])

  return null
}
