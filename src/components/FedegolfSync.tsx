'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { construirAvisoIndice } from '@/lib/fedegolf/aviso-indice'
import { recordarNoVinculado, sabemosQueNoEstaVinculado } from '@/lib/fedegolf/vinculo-local'
import { addToast } from '@/hooks/useToast'

/**
 * Sync de índice FedeGolf cuando el usuario tiene cuenta vinculada. Silencioso
 * mientras el índice NO cambia; cuando cambia, avisa con un toast (antes eso era
 * un console.log que nadie veía — ver aviso-indice.ts).
 * Se monta en TODAS las páginas (layout root) así que DEBE chequear sesión
 * antes de tocar el endpoint — si no, dispara 401 en consola para visitantes
 * pre-login (FTUE audit 22-may-2026).
 *
 * Usuarios sin cuenta vinculada (la gran mayoría): la primera respuesta
 * `linked:false` se recuerda 24 h en el dispositivo (vinculo-local.ts) y en ese
 * lapso no se hace ningún request. Antes cada carga disparaba 2 POST inútiles.
 */
export default function FedegolfSync() {
  const synced = useRef(false)
  const { user } = useAuth()

  useEffect(() => {
    if (synced.current || !user) return
    synced.current = true
    if (sabemosQueNoEstaVinculado(user.id)) return

    // Sync de tarjetas del índice — INDEPENDIENTE del de índice (spec D4): un
    // fallo de uno no bloquea al otro. Solo se omite si el server confirmó que
    // no hay cuenta vinculada. Fire-and-forget, silencioso.
    const syncTarjetas = () => {
      fetch('/api/fedegolf/sync-tarjetas', { method: 'POST' }).catch(() => {
        // Silent — fail-soft
      })
    }

    fetch('/api/fedegolf/sync-indice', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data?.linked === false) {
          // Incluye requiere_reconexion (clave cambiada): nada que sincronizar
          // hasta que vuelva a vincular, y vincular borra este memo.
          recordarNoVinculado(user.id)
          return
        }
        syncTarjetas()
        // El índice cambió: AVISARLE al usuario. Antes esto era un console.log
        // que nadie veía — el índice de un jugador pasaba de 9.1 a 9.3 y se
        // enteraba de casualidad (reporte inbox f7b63d1d).
        if (data?.ok && data.cambio) {
          const aviso = construirAvisoIndice(data.indice, data.indice_anterior)
          if (aviso) {
            addToast({
              type:     aviso.type,
              title:    aviso.title,
              message:  aviso.message,
              duration: 7000,
            })
          }
        }
      })
      .catch(() => {
        // El sync de índice falló sin saber si hay vínculo: las tarjetas van igual (D4).
        syncTarjetas()
      })
  }, [user])

  return null
}
