'use client'

import { useState } from 'react'
import { addToast } from '@/hooks/useToast'
import { haptic } from '@/lib/ronda/helpers'
import { hoyoSinDriveQueFrenaElCierre } from '@/golf/formats/drives-scramble'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'
import type { DrivesDeUnEquipo } from './useDrivesDelScorer'
import { anclaDeDrives } from '../components/SharedBallTeamCard'

/**
 * Drives del scramble: sin el del hoyo no se pasa de hoyo, ni se guarda el último, ni se finaliza (Juanjo, 26-nov:
 * «No deja avanzar»). Solo los equipos que ESTE celular confirma (`equipos` fuera de `noConfirmanElHoyo`): el de otro
 * celular lo frena su propio scorer. El intento frenado destaca «Drive de» en ese hoyo (`faltaDriveEnHoyo`) y lleva la
 * vista ahí. `activo` en falso (tarjeta congelada, ronda cerrada) no frena. Lo que frena es CONFIRMAR (Siguiente,
 * Finalizar o «Terminar mi equipo»); moverse entre hoyos (swipe, fila de hoyos) es libre, para poder corregir uno anterior.
 * Al cerrar cuentan solo los hoyos jugados y el último si está en pantalla (`hoyoSinDriveQueFrenaElCierre`).
 */
export function useFrenoPorDrive({ equipos, noConfirmanElHoyo, drivesDe, activo, currentHole, setCurrentHole, ordenHoyos }: {
  equipos: readonly EquipoDelScorer[]
  noConfirmanElHoyo: readonly Pick<EquipoDelScorer, 'id'>[] | undefined
  drivesDe: (equipo: EquipoDelScorer) => DrivesDeUnEquipo | null
  activo: boolean
  currentHole: number
  setCurrentHole: (hoyo: number) => void
  ordenHoyos: readonly number[]
}) {
  const [faltaDriveEnHoyo, setFaltaDriveEnHoyo] = useState<number | null>(null)
  const confirman = equipos.filter(e => !(noConfirmanElHoyo ?? []).some(n => n.id === e.id))
  const frena = (hoyo: number): boolean => {
    if (!activo) return false
    const faltan = confirman.filter(e => drivesDe(e)?.hoyosSinDrive.includes(hoyo))
    if (faltan.length === 0) return false
    setFaltaDriveEnHoyo(hoyo)
    haptic([30, 60, 30])
    if (hoyo !== currentHole) {
      setCurrentHole(hoyo)
      addToast({ type: 'error', title: `Falta el drive del hoyo ${hoyo}`, duration: 6000 })
    }
    requestAnimationFrame(() => document.getElementById(anclaDeDrives(faltan[0].id))?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    return true
  }
  return {
    faltaDriveEnHoyo,
    /** Siguiente: frena si falta el drive del hoyo en pantalla. */
    frenaEnPantalla: () => frena(currentHole),
    /** Finalizar: frena en el primer hoyo jugado (o el último en pantalla) sin drive. */
    frenaAlCerrar: () => {
      if (!activo) return false
      const conDrives = confirman.flatMap(e => { const d = drivesDe(e); return d ? [{ hoyosSinDrive: d.hoyosSinDrive, scores: e.scores }] : [] })
      const hoyo = hoyoSinDriveQueFrenaElCierre(ordenHoyos, conDrives, currentHole)
      return hoyo != null && frena(hoyo)
    },
  }
}
