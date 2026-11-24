'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { captureError } from '@/lib/error-tracking'
import { fetchEquiposConAnotador, type EquipoConAnotadorLeido } from '@/lib/data/ronda-libre'
import { ofreceAnotarMiEquipo } from '@/golf/ronda-libre/anotador-de-equipo'

/**
 * Un celular por equipo: ¿la ronda en vivo muestra «Anotar mi equipo»? (`ofreceAnotarMiEquipo`). Los equipos de la
 * vista en vivo no traen quién anota (anon no tiene esas columnas): se leen aparte, solo con `activo` (cuenta con
 * sesión que no anota la ronda entera, ronda en curso de un celular por equipo), y se releen cada vez que la vista en
 * vivo trae equipos nuevos. Sin la lectura (cargando o sin señal) se ofrece: el scorer confirma antes de reclamar y
 * esconderlo dejaría sin camino de vuelta a quien ya anota un equipo.
 */
export function useOfreceAnotarMiEquipo(input: {
  rondaId: string | null
  userId: string | null | undefined
  activo: boolean
  /** Los equipos de la vista en vivo: cada refresco suyo relee quién anota qué. */
  equipos: unknown
}): boolean {
  const { rondaId, userId, activo, equipos } = input
  const [leidos, setLeidos] = useState<EquipoConAnotadorLeido[] | null>(null)

  useEffect(() => {
    if (!activo || !rondaId) return
    let vigente = true
    fetchEquiposConAnotador(createClient(), rondaId)
      .then(es => { if (vigente) setLeidos(es) })
      .catch(err => { captureError(err, { context: 'ronda-libre.en-vivo.equipos-para-anotar', level: 'warning', meta: { rondaId } }) })
    return () => { vigente = false }
  }, [activo, rondaId, equipos])

  if (!activo) return false
  if (leidos == null) return true
  return ofreceAnotarMiEquipo(leidos, userId)
}
