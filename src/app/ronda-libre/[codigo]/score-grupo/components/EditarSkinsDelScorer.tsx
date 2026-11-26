'use client'

import type { FueraPorJugador } from '@/golf/formats/skins/fuera-del-hoyo'
import type { VistaDelSkinsEnElScorer } from '@/golf/ronda-libre/skins-del-scorer'
import type { RondaLibre } from '@/types/ronda'
import { EditarSkins } from '../../components/skins/EditarSkins'
import { puedeEditarElSkins } from '../../hooks/useEditarSkins'

/** ¿Este teléfono ya anotó algo (un golpe o una X), aunque todavía no haya llegado al servidor? */
export function hayAlgoAnotadoEnElTelefono(scores: Readonly<Record<string, Readonly<Record<number, number>>>>, fuera: FueraPorJugador | undefined): boolean {
  const conAlgo = (m: Readonly<Record<number, unknown>> | undefined) => !!m && Object.keys(m).length > 0
  return Object.values(scores).some(conAlgo) || Object.values(fuera ?? {}).some(conAlgo)
}

/**
 * «Editar» del Skins en el scorer de grupo (spec «Editar antes del primer golpe»): en el hoyo de salida, para el
 * creador, mientras el Skins no empezó. Además de lo que dice el servidor (`empezado`), se esconde apenas este teléfono
 * anota algo: el golpe puede ir en camino y la vista no lo sabe todavía.
 */
export function EditarSkinsDelScorer(props: {
  ronda: RondaLibre
  vista: VistaDelSkinsEnElScorer | null
  userId: string | null | undefined
  enElHoyoDeSalida: boolean
  scores: Readonly<Record<string, Readonly<Record<number, number>>>>
  fuera: FueraPorJugador | undefined
  onGuardado: () => void
}) {
  const { ronda, vista, userId, enElHoyoDeSalida, scores, fuera, onGuardado } = props
  if (!vista || !ronda.creador_id) return null
  const jugadores = ronda.ronda_libre_jugadores
  const visible = enElHoyoDeSalida && !hayAlgoAnotadoEnElTelefono(scores, fuera)
    && puedeEditarElSkins({ userId, creadorId: ronda.creador_id, vista, jugadores })
  return (
    <EditarSkins
      visible={visible}
      codigo={ronda.codigo}
      creadorId={ronda.creador_id}
      jugadores={jugadores}
      orden={vista.jugadorIds}
      courseId={ronda.course_id}
      recorridos={ronda.recorridos}
      teeGlobal={ronda.tees}
      pozoPorJugador={vista.pozoPorJugador ?? 0}
      onGuardado={onGuardado}
    />
  )
}
