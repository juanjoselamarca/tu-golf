'use client'

import { useCallback, useState } from 'react'
import { addToast } from '@/hooks/useToast'
import { getGuestId, getGuestName, getGuestToken, getPruebaDeInvitado, setGuestToken } from '@/lib/guest-session'

export type EstadoRecuperacion = 'listo' | 'recuperando' | 'error'

/** Lo que se dice si no se pudo: la salida es el organizador (los golpes siguen en el teléfono). */
export const MENSAJE_RECUPERACION_FALLIDA = 'No pudimos recuperarla. Muéstrale tu tarjeta al organizador y pídele que anote tus golpes.'
export const MENSAJE_RECUPERACION_SIN_CONEXION = 'Sin conexión. Intenta de nuevo.'
/** El servidor no respondió bien (429 / 5xx): hay red, pero no se pudo. "Sin conexión" sería falso (Fable #833 v3). */
export const MENSAJE_RECUPERACION_SERVIDOR = 'No pudimos conectar. Intenta de nuevo.'

/**
 * "Recuperar mi tarjeta" del invitado cuyo token ya no sirve, sin salir del scorer (Fable #833 v2): manda
 * su guestId y la prueba de la que se derivó a `/guest-join`, que le vuelve a firmar el token del MISMO
 * jugador (ya inscrito: no se inscribe de nuevo, rija o no el gate de invitados). Con el token nuevo,
 * `onToken` lo pasa al guardado, que apaga el aviso y reenvía la cola.
 */
export function useRecuperarAccesoInvitado(args: { slug: string; onToken: (token: string) => void }) {
  const { slug, onToken } = args
  const [estado, setEstado] = useState<EstadoRecuperacion>('listo')
  const [mensaje, setMensaje] = useState<string | null>(null)

  const recuperar = useCallback(async () => {
    const guestId = getGuestId()
    const guestProof = getPruebaDeInvitado()
    if (!guestId || !guestProof) { setEstado('error'); setMensaje(MENSAJE_RECUPERACION_FALLIDA); return }
    setEstado('recuperando')
    setMensaje(null)
    try {
      const res = await fetch(`/api/torneos/${slug}/guest-join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // El nombre lo exige la validación; al ya inscrito no se le cambia.
        body: JSON.stringify({ guestId, guestProof, guestToken: getGuestToken() ?? undefined, name: getGuestName() ?? 'Invitado', soloRecuperar: true }),
      })
      const body = (await res.json().catch(() => null)) as { guestToken?: unknown; alreadyRegistered?: unknown } | null
      // Sólo vale si es el MISMO jugador (ya inscrito). Si el servidor lo inscribiera de nuevo, sería otro.
      if (res.ok && typeof body?.guestToken === 'string' && body.alreadyRegistered === true) {
        setGuestToken(body.guestToken)
        setEstado('listo')
        onToken(body.guestToken)
        addToast({ type: 'success', title: 'Tarjeta recuperada', message: 'Enviando los golpes que quedaron en el teléfono.', duration: 4000 })
        return
      }
      setEstado('error')
      setMensaje(res.status >= 500 || res.status === 429 ? MENSAJE_RECUPERACION_SERVIDOR : MENSAJE_RECUPERACION_FALLIDA)
    } catch {
      setEstado('error')
      setMensaje(MENSAJE_RECUPERACION_SIN_CONEXION)
    }
  }, [slug, onToken])

  return { estado, mensaje, recuperar }
}
