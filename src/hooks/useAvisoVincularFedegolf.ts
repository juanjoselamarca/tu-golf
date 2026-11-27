'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { esRutaDeAvisoDeApertura } from '@/lib/rutas'
import { aperturaLibrePara, experienciaPendiente, tomarApertura } from '@/lib/avisos/aviso-de-apertura'
import {
  avisoVincularVistoEnDispositivo,
  avisoVincularYaVisto,
  recordarAvisoVincularVisto,
} from '@/lib/fedegolf/aviso-vincular'

/**
 * Aviso «Vincula tu FedeGolf» al abrir la app. Decide si se muestra y lleva sus pasos:
 * 'oculto' → 'aviso' (la hoja con Vincular / No vincular) → 'formulario' (el modal de vinculación
 * de siempre, FedegolfVincularModal).
 *
 * Cuándo se muestra (todas a la vez):
 *  - hay sesión, y ni la sesión ni este dispositivo dicen que ya se vio;
 *  - la pantalla es de apertura (`esRutaDeAvisoDeApertura`): nunca en rondas, torneos ni scorers;
 *  - la apertura está libre (`aviso-de-apertura`): «Personaliza tu experiencia» va primero y nunca
 *    salen dos avisos en la misma apertura;
 *  - el server confirma: sin FedeGolf vinculado y sin ronda en curso (GET /api/fedegolf/aviso-vincular).
 * Se consulta una vez por apertura. Al mostrarse queda visto para siempre (POST), elija lo que elija.
 *
 * No bloquea el render: todo pasa en un efecto, después de pintar, y sin await en el arranque.
 */
export type FaseAvisoVincular = 'oculto' | 'aviso' | 'formulario'

export function useAvisoVincularFedegolf() {
  const { user } = useAuth()
  const pathname = usePathname()
  const [fase, setFase] = useState<FaseAvisoVincular>('oculto')
  const consultado = useRef(false)
  // La respuesta puede llegar después de navegar: se decide con la pantalla de ESE momento.
  const rutaActual = useRef(pathname)
  useEffect(() => { rutaActual.current = pathname }, [pathname])

  useEffect(() => {
    if (!user || consultado.current) return
    if (!esRutaDeAvisoDeApertura(pathname)) return
    if (avisoVincularYaVisto(user) || avisoVincularVistoEnDispositivo(user.id)) return
    if (experienciaPendiente() || !aperturaLibrePara('vincular-fedegolf')) return
    consultado.current = true

    const userId = user.id
    fetch('/api/fedegolf/aviso-vincular')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { mostrar?: boolean } | null) => {
        if (d?.mostrar !== true) return
        if (!esRutaDeAvisoDeApertura(rutaActual.current)) return
        if (experienciaPendiente() || !tomarApertura('vincular-fedegolf')) return
        setFase('aviso')
        recordarAvisoVincularVisto(userId)
        fetch('/api/fedegolf/aviso-vincular', { method: 'POST' }).catch(() => {
          // Sin red: queda recordado en este dispositivo; en otro se ofrecerá una vez más.
        })
      })
      .catch(() => {
        // Fail-closed: sin respuesta no se muestra; se reintenta en la próxima apertura.
      })
  }, [user, pathname])

  const vincular = useCallback(() => setFase('formulario'), [])
  const cerrar = useCallback(() => setFase('oculto'), [])

  return { fase, vincular, cerrar }
}
