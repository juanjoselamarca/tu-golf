'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { addToast } from '@/hooks/useToast'
import { fetchEquiposConAnotador, type EquipoConAnotadorLeido } from '@/lib/data/ronda-libre'
import { reabrirEquipoDeRonda } from '@/lib/data/ronda-libre-anotador'
import { leerEquiposTomados } from '@/lib/ronda/equipos-tomados'
import { equiposSinTerminar, equiposTerminadosDelCelular, liberaEquipos, ofreceAnotarMiEquipo, type RondaDeEquipos } from '@/golf/ronda-libre/anotador-de-equipo'

export interface BotonDeMiEquipo {
  /** Se muestra el botón del pie («Anotar mi equipo» o «Corregir mi tarjeta»). */
  ofrece: boolean
  /**
   * «Terminar mi equipo» ya cerró todos los equipos que anota esta cuenta y la ronda sigue: el botón dice «Corregir mi
   * tarjeta» y, al tocarlo, los reabre (`reabrirEquipoDeRonda`) y entra al scorer.
   */
  corrige: boolean
  corregir: () => Promise<void>
  corrigiendo: boolean
  /** Con `corrige`: nombres de los equipos de la ronda que todavía no terminan (`equiposSinTerminar`). Si no, vacío. */
  faltanPorTerminar: string[]
  /** Con equipos por terminar, esta cuenta es la que puede liberarlos (`liberaEquipos`: el creador). */
  puedeLiberarlos: boolean
}

/**
 * Un celular por equipo: el botón del pie de la ronda en vivo. «Anotar mi equipo» (`ofreceAnotarMiEquipo`) o, con los
 * equipos de esta cuenta terminados (`equiposTerminadosDelCelular`), «Corregir mi tarjeta». Los equipos de la vista en
 * vivo no traen quién anota ni si terminó (anon no tiene esas columnas): se leen aparte con la sesión, solo con `activo`
 * (cuenta con sesión que no anota la ronda entera, ronda en curso de un celular por equipo), y se releen cada vez que la
 * vista en vivo trae equipos nuevos. Sin la lectura (cargando o sin señal) se ofrece «Anotar mi equipo»: el scorer
 * confirma antes de reclamar y esconderlo dejaría sin camino de vuelta a quien ya anota un equipo (y a quien terminó, el
 * scorer lo devuelve acá).
 */
export function useOfreceAnotarMiEquipo(input: {
  rondaId: string | null
  /** Lo que las reglas leen de la ronda; sin ella (cargando) no hay «Corregir». */
  ronda?: Pick<RondaDeEquipos, 'formato_juego' | 'admin_mode' | 'creador_id'> | null
  codigo?: string
  userId: string | null | undefined
  activo: boolean
  /** Los equipos de la vista en vivo: cada refresco suyo relee quién anota qué. */
  equipos: unknown
}): BotonDeMiEquipo {
  const { rondaId, ronda, codigo, userId, activo, equipos } = input
  const router = useRouter()
  const [leidos, setLeidos] = useState<EquipoConAnotadorLeido[] | null>(null)
  const [corrigiendo, setCorrigiendo] = useState(false)

  useEffect(() => {
    if (!activo || !rondaId) return
    let vigente = true
    fetchEquiposConAnotador(createClient(), rondaId)
      .then(es => { if (vigente) setLeidos(es) })
      .catch(err => { captureError(err, { context: 'ronda-libre.en-vivo.equipos-para-anotar', level: 'warning', meta: { rondaId } }) })
    return () => { vigente = false }
  }, [activo, rondaId, equipos])

  const aCorregir = activo && ronda && codigo && leidos
    ? equiposTerminadosDelCelular(ronda, leidos, userId, leerEquiposTomados(codigo))
    : []

  const corregir = useCallback(async () => {
    if (corrigiendo || !codigo || aCorregir.length === 0) return
    setCorrigiendo(true)
    let navega = false
    try {
      const supabase = createClient()
      for (const e of aCorregir) {
        const r = await reabrirEquipoDeRonda(supabase, codigo, e.id)
        if (r.estado === 'error') {
          // Cerrada mientras tanto: la vista en vivo pasa sola al resultado final. El resto (sin red, sesión cerrada,
          // cambió quién anota): el aviso y se reintenta.
          addToast({ type: r.ronda === 'sin_respuesta' || r.ronda === 'sin_sesion' ? 'error' : 'info', title: r.mensaje, duration: 6000 })
          return
        }
      }
      navega = true
      router.push(`/ronda-libre/${codigo}/score-grupo`)
    } finally {
      if (!navega) setCorrigiendo(false)
    }
  }, [corrigiendo, codigo, aCorregir, router])

  const nada = { faltanPorTerminar: [], puedeLiberarlos: false }
  if (!activo) return { ofrece: false, corrige: false, corregir, corrigiendo, ...nada }
  if (leidos == null) return { ofrece: true, corrige: false, corregir, corrigiendo, ...nada }
  // «Corregir» se ofrece aunque no quede nada que anotar (el creador que terminó los equipos sin reclamar: esos ya no
  // cuentan como libres).
  const corrige = aCorregir.length > 0
  // Ya terminó lo suyo: qué falta para que la ronda se cierre sola (la vista en vivo lo dice sobre el botón).
  const faltanPorTerminar = corrige && ronda ? equiposSinTerminar(ronda, leidos).map(e => e.nombre) : []
  const puedeLiberarlos = faltanPorTerminar.length > 0 && !!ronda && liberaEquipos(ronda, leidos, userId)
  return { ofrece: corrige || ofreceAnotarMiEquipo(leidos, userId), corrige, corregir, corrigiendo, faltanPorTerminar, puedeLiberarlos }
}
