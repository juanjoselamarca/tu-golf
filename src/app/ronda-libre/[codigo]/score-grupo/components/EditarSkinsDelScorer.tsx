'use client'

import { useState } from 'react'
import type { FueraPorJugador } from '@/golf/formats/skins/fuera-del-hoyo'
import type { VistaDelSkinsEnElScorer } from '@/golf/ronda-libre/skins-del-scorer'
import type { RondaLibre } from '@/types/ronda'
import { EditarSkins, FranjaJugadoresFijos } from '../../components/skins/EditarSkins'
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
  const jugadores = ronda.ronda_libre_jugadores
  const anotado = hayAlgoAnotadoEnElTelefono(scores, fuera)
  const esCreador = !!userId && userId === ronda.creador_id
  const visible = !!vista && !!ronda.creador_id && enElHoyoDeSalida && !anotado
    && puedeEditarElSkins({ userId, creadorId: ronda.creador_id, vista, jugadores })
  // Revisión Fable #898 (P1-2): el primer «+» esconde el botón. Si la franja se fuera, las tarjetas subirían ~56 px y el
  // segundo toque caería en otra tecla. Mientras se siga en el hoyo de salida, su lugar lo ocupa una franja del mismo
  // alto; al cambiar de hoyo (toda la pantalla cambia) se va. Estado derivado del render anterior, sin efecto.
  // Vuelta 2 (P2-C): antes de saber (la vista todavía no llega, o se está releyendo tras una edición hecha en otro lado)
  // el lugar ya se guarda para el creador en el hoyo de salida: cuando aparece el botón, las tarjetas no bajan; y si
  // la vista dice que ya empezó, la franja se queda (con texto) en vez de irse y subirlas.
  const antesDeSaber = esCreador && enElHoyoDeSalida && !anotado && vista?.empezado !== true && vista?.rondaCerrada !== true
  const [reservado, setReservado] = useState(false)
  if ((visible || antesDeSaber) && enElHoyoDeSalida && !reservado) setReservado(true)
  if (!enElHoyoDeSalida && reservado) setReservado(false)
  const reservarLugar = reservado || antesDeSaber
  // Vuelta 2 (P2-B): el texto «ya empezó» solo cuando es verdad (este teléfono anotó o el servidor lo dice); si no, la
  // franja va vacía, del mismo alto.
  const conTexto = anotado || vista?.empezado === true
  if (!ronda.creador_id) return null
  if (!vista) return reservarLugar ? <FranjaJugadoresFijos conTexto={false} /> : null
  return (
    <EditarSkins
      visible={visible}
      reservarLugar={reservarLugar}
      franjaConTexto={conTexto}
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
