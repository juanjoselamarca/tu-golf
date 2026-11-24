'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { haptic } from '@/lib/ronda/helpers'
import { addToast } from '@/hooks/useToast'
import {
  liberarEquipoDeRonda, reclamarEquipoDeRonda, MENSAJE_DEJAR_CON_PENDIENTES, MENSAJE_EQUIPOS_TARDAN,
} from '@/lib/data/ronda-libre-anotador'
import { PLAZO_CARGA_SCORER_MS } from '@/lib/data/ronda-libre-scorer'
import { conTimeout, TiempoAgotadoError } from '@/lib/red/con-timeout'

/**
 * La relectura tras reclamar/liberar/dejar espera a lo más `PLAZO_CARGA_SCORER_MS`: `enCurso` congela la tarjeta y
 * Finalizar (`tarjetaCongelada`), y una relectura colgada (mala señal) los dejaba congelados hasta recargar. Si vence,
 * la lectura sigue en segundo plano y pone la lista al día cuando termine (mientras siga en vuelo, el refresco
 * periódico no lee otra: `useRondaGrupoData` no superpone lecturas), y se avisa: sin aviso, la lista vieja parecía la
 * respuesta.
 */
async function releer(recargar: () => Promise<void>): Promise<void> {
  try {
    await conTimeout(recargar(), PLAZO_CARGA_SCORER_MS)
  } catch (e) {
    if (!(e instanceof TiempoAgotadoError)) throw e
    addToast({ type: 'info', title: MENSAJE_EQUIPOS_TARDAN, duration: 5000 })
  }
}

/**
 * Un celular por equipo: reclamar un equipo (`ElegirEquipo`), liberarlo (franja de equipos de otro celular, solo el
 * creador) o dejar el propio (`DejarEsteEquipo`, quien anota sin ser el creador; la misma RPC `liberar_equipo_de_ronda`
 * acepta al propio anotador). Tras cualquier respuesta la pantalla relee quién anota qué (`recargar`): el servidor manda.
 *  - `enCurso`: el equipo cuyo pedido está en vuelo (un segundo toque no dispara otro).
 *  - `aviso`: el mensaje del último intento que no resultó, junto al equipo que lo produjo.
 */
export function useAnotadorDeEquipo({ codigo, recargar, recargarTrasDejarEquipo }: {
  codigo: string
  recargar: () => Promise<void>
  /** Tras dejar el equipo propio: vuelve a «Elige tu equipo» sin el aviso «Ya no anotas» (`useRondaGrupoData`). */
  recargarTrasDejarEquipo: () => Promise<void>
}) {
  const router = useRouter()
  const [enCurso, setEnCurso] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ equipoId: string; mensaje: string } | null>(null)

  const reclamar = useCallback(async (equipoId: string) => {
    if (enCurso) return
    haptic(30)
    setEnCurso(equipoId)
    setAviso(null)
    // try/finally: si la RPC o la relectura lanzan, la tarjeta no queda congelada (`tarjetaCongelada`) para siempre.
    try {
      const r = await reclamarEquipoDeRonda(createClient(), codigo, equipoId)
      if (r.estado === 'error' && r.ronda === 'cerrada') {
        router.replace(`/ronda-libre/${codigo}`)
        return
      }
      // ok / ya_tienes_equipo: al releer, el scorer abre en su equipo. tomado / error: queda el aviso y la lista al día.
      if (r.estado === 'tomado' || r.estado === 'error') setAviso({ equipoId, mensaje: r.mensaje })
      await releer(recargar)
    } finally {
      setEnCurso(null)
    }
  }, [codigo, enCurso, recargar, router])

  const liberar = useCallback(async (equipoId: string, nombreEquipo: string) => {
    if (enCurso) return
    haptic(30)
    setEnCurso(equipoId)
    try {
      const r = await liberarEquipoDeRonda(createClient(), codigo, equipoId)
      if (r.estado === 'ok') addToast({ type: 'success', title: `${nombreEquipo} queda en tu celular`, duration: 4000 })
      else addToast({ type: 'error', title: r.mensaje, duration: 6000 })
      await releer(recargar)
    } finally {
      setEnCurso(null)
    }
  }, [codigo, enCurso, recargar])

  /**
   * Suelta el equipo de este celular. Antes sube lo anotado (`subirPendientes` → false si algo quedó en el teléfono):
   * después de soltarlo el servidor ya no acepta golpes de este celular para ese equipo, y se perderían.
   */
  const dejar = useCallback(async (equipoId: string, nombreEquipo: string, subirPendientes: () => Promise<boolean>) => {
    if (enCurso) return
    haptic(30)
    setEnCurso(equipoId)
    try {
      if (!(await subirPendientes())) {
        addToast({ type: 'error', title: MENSAJE_DEJAR_CON_PENDIENTES, duration: 6000 })
        return
      }
      const r = await liberarEquipoDeRonda(createClient(), codigo, equipoId)
      if (r.estado !== 'ok') {
        addToast({ type: 'error', title: r.mensaje, duration: 6000 })
        return
      }
      addToast({ type: 'success', title: `Dejaste ${nombreEquipo}`, duration: 4000 })
      await releer(recargarTrasDejarEquipo)
    } finally {
      setEnCurso(null)
    }
  }, [codigo, enCurso, recargarTrasDejarEquipo])

  return { reclamar, liberar, dejar, enCurso, aviso }
}
