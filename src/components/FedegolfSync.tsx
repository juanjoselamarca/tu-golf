'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { construirAvisoIndice } from '@/lib/fedegolf/aviso-indice'
import { recordarNoVinculado, sabemosQueNoEstaVinculado } from '@/lib/fedegolf/vinculo-local'
import { avisoYaMostrado, marcarAvisoMostrado } from '@/lib/fedegolf/aviso-local'
import type { CambioIndice } from '@/lib/fedegolf/persistencia-indice'
import { addToast } from '@/hooks/useToast'

/**
 * Sync de índice FedeGolf cuando el usuario tiene cuenta vinculada (respaldo del
 * cron diario /api/cron/fedegolf-indices). Silencioso mientras el índice NO
 * cambia; el último cambio reciente se avisa con un toast una sola vez por
 * dispositivo (aviso-local.ts), aunque lo haya detectado el cron.
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
          // Sin cuenta vinculada: nada que sincronizar por 24 h (vincular borra este memo).
          recordarNoVinculado(user.id)
          return
        }
        // Clave cambiada en fedegolf.cl: el índice sigue (es por RUT), pero las
        // tarjetas necesitan la clave → no se piden hasta que reconecte.
        if (!data?.requiere_reconexion) syncTarjetas()
        // Avisar el último cambio de índice UNA vez por dispositivo, lo haya
        // detectado este request, el cron de la madrugada u otro dispositivo.
        // Antes era un console.log que nadie veía (reporte inbox f7b63d1d).
        const cambio = data?.ultimo_cambio as CambioIndice | null | undefined
        if (cambio && !avisoYaMostrado(user.id, cambio.fecha)) {
          const aviso = construirAvisoIndice(cambio.indice, cambio.anterior)
          if (aviso) {
            addToast({
              type:     aviso.type,
              title:    aviso.title,
              message:  aviso.message,
              duration: 7000,
            })
          }
          marcarAvisoMostrado(user.id, cambio.fecha)
        }
      })
      .catch(() => {
        // El sync de índice falló sin saber si hay vínculo: las tarjetas van igual (D4).
        syncTarjetas()
      })
  }, [user])

  return null
}
