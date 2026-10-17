'use client'

/**
 * Carga y comparte la tarjeta de una ronda guardada. Lo usan las dos pantallas
 * que la pintan: `/perfil/historial/[id]` (la del dueño) y `/tarjeta/[id]` (la
 * pública del link).
 *
 * Compartir = publicar (modelo Strava). Si la publicación no se concreta, NO se
 * abre el sheet: el link llegaría a un "Tarjeta no encontrada" del otro lado.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { cargarTarjetaGuardada, type CargaDeTarjeta } from '@/lib/data/tarjeta-guardada'
import { publishRound } from '@/lib/data/rounds'
import { armarVistaDeTarjeta, type VistaDeTarjeta } from '@/golf/share/tarjeta-guardada'
import { addToast } from '@/hooks/useToast'

export const AVISO_NO_SE_PUBLICO = {
  titulo: 'No pudimos compartir tu tarjeta',
  detalle: 'Revisa tu conexión e intenta de nuevo.',
} as const

export interface UseTarjetaGuardada {
  /** `null` mientras carga. */
  carga: CargaDeTarjeta | null
  vista: VistaDeTarjeta | null
  reintentar: () => void
  /** Publica (si es del que mira) y abre el sheet. */
  compartir: () => Promise<void>
  publicando: boolean
  shareOpen: boolean
  cerrarShare: () => void
}

export function useTarjetaGuardada(id: string): UseTarjetaGuardada {
  // La carga va con el id al que pertenece: si cambia la ronda en la misma
  // instancia, no se muestra (ni se comparte) la anterior mientras llega la nueva.
  const [cargada, setCargada] = useState<{ id: string; intento: number; carga: CargaDeTarjeta } | null>(null)
  const [intento, setIntento] = useState(0)
  const [publicando, setPublicando] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  useEffect(() => {
    let vigente = true
    void cargarTarjetaGuardada(createClient(), id).then(c => { if (vigente) setCargada({ id, intento, carga: c }) })
    return () => { vigente = false }
  }, [id, intento])

  const reintentar = useCallback(() => setIntento(n => n + 1), [])

  const carga = cargada && cargada.id === id && cargada.intento === intento ? cargada.carga : null

  const vista = useMemo(
    () => (carga?.estado === 'ok' ? armarVistaDeTarjeta(carga.ronda, carga.hoyosDelCatalogo) : null),
    [carga],
  )

  const esDueño = carga?.estado === 'ok' && carga.esDueño

  const compartir = useCallback(async () => {
    if (publicando) return
    if (!esDueño) { setShareOpen(true); return }
    setPublicando(true)
    const publicada = await publishRound(createClient(), id)
    setPublicando(false)
    if (!publicada) {
      addToast({ type: 'error', title: AVISO_NO_SE_PUBLICO.titulo, message: AVISO_NO_SE_PUBLICO.detalle, duration: 5000 })
      return
    }
    setShareOpen(true)
  }, [esDueño, id, publicando])

  const cerrarShare = useCallback(() => setShareOpen(false), [])

  return { carga, vista, reintentar, compartir, publicando, shareOpen, cerrarShare }
}
