'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { haptic } from '@/lib/ronda/helpers'
import { addToast } from '@/hooks/useToast'
import { liberarEquipoDeRonda, reclamarEquipoDeRonda } from '@/lib/data/ronda-libre-anotador'

/**
 * Un celular por equipo: reclamar un equipo (`ElegirEquipo`) o liberarlo (franja de equipos de otro celular, solo el
 * creador). Tras cualquier respuesta la pantalla relee quién anota qué (`recargar`): el servidor manda.
 *  - `enCurso`: el equipo cuyo pedido está en vuelo (un segundo toque no dispara otro).
 *  - `aviso`: el mensaje del último intento que no resultó, junto al equipo que lo produjo.
 */
export function useAnotadorDeEquipo({ codigo, recargar }: { codigo: string; recargar: () => Promise<void> }) {
  const router = useRouter()
  const [enCurso, setEnCurso] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ equipoId: string; mensaje: string } | null>(null)

  const reclamar = useCallback(async (equipoId: string) => {
    if (enCurso) return
    haptic(30)
    setEnCurso(equipoId)
    setAviso(null)
    const r = await reclamarEquipoDeRonda(createClient(), codigo, equipoId)
    if (r.estado === 'error' && r.ronda === 'cerrada') {
      setEnCurso(null)
      router.replace(`/ronda-libre/${codigo}`)
      return
    }
    // ok / ya_tienes_equipo: al releer, el scorer abre en su equipo. tomado / error: queda el aviso y la lista al día.
    if (r.estado === 'tomado' || r.estado === 'error') setAviso({ equipoId, mensaje: r.mensaje })
    await recargar()
    setEnCurso(null)
  }, [codigo, enCurso, recargar, router])

  const liberar = useCallback(async (equipoId: string, nombreEquipo: string) => {
    if (enCurso) return
    haptic(30)
    setEnCurso(equipoId)
    const r = await liberarEquipoDeRonda(createClient(), codigo, equipoId)
    if (r.estado === 'ok') addToast({ type: 'success', title: `${nombreEquipo} queda en tu celular`, duration: 4000 })
    else addToast({ type: 'error', title: r.mensaje, duration: 6000 })
    await recargar()
    setEnCurso(null)
  }, [codigo, enCurso, recargar])

  return { reclamar, liberar, enCurso, aviso }
}
