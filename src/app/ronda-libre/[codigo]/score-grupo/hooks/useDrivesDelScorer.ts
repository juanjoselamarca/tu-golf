'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { addToast } from '@/hooks/useToast'
import { captureError } from '@/lib/error-tracking'
import {
  avisoDeDrives,
  conteoDeDrives,
  drivesConCambios,
  hoyosSinDrive,
  leerDrives,
  textoAvisoDeDrives,
  type ConteoDeDrivesDeJugador,
} from '@/golf/formats/drives-scramble'
import {
  drivesPendientes,
  marcarDriveConRespaldo,
  reenviarDrivesPendientes,
  type ResultadoDrives,
} from '@/lib/ronda/drives-pendientes'
import type { EquipoDelScorer } from '@/lib/data/ronda-libre-scorer'

/** Cambios por equipo: hoyo → índice del jugador, o `SIN_DRIVE` (-1, `drives-pendientes.ts`). */
type CambiosPorEquipo = Record<string, Record<string, number>>

export interface DrivesDeUnEquipo {
  jugadores: string[]
  /** Índice del jugador con el drive del hoyo en pantalla, o `null`. */
  driveDelHoyo: number | null
  conteo: ConteoDeDrivesDeJugador[]
  minimo: number | null
  aviso: string | null
  /** `hoyosSinDrive`: sin el del hoyo en pantalla no se avanza; sin todos, no se finaliza. */
  hoyosSinDrive: number[]
  /** Marca el drive del hoyo en pantalla; tocar el que ya está marcado lo quita. */
  elegir: (posicion: number) => void
}

function cambiosDeLaCola(codigo: string): CambiosPorEquipo {
  const out: CambiosPorEquipo = {}
  for (const d of drivesPendientes(codigo)) (out[d.equipoId] ??= {})[String(d.hoyo)] = d.valor
  return out
}

/**
 * Drives del scramble en el scorer de grupo (`@/golf/formats/drives-scramble`). Solo para los equipos que los
 * anotan (`drive_jugadores`); sin ellos devuelve `null` y la tarjeta queda igual.
 *
 * Lo que se ve = lo guardado ⊕ lo que este teléfono ya confirmó ⊕ lo que espera envío (`drives-pendientes.ts`,
 * misma cola con respaldo que los golpes): el toque cambia la pantalla al instante, con o sin señal. Lo confirmado
 * queda encima toda la sesión: una relectura pedida antes de confirmar no lo revierte (cada equipo lo anota un
 * solo teléfono). Además se copia a `teamEquipos` para que la copia local del scorer lo tenga si se recarga sin señal.
 */
export function useDrivesDelScorer(input: {
  codigo: string
  drivesMinimo: number | null
  teamEquipos: EquipoDelScorer[]
  setTeamEquipos: React.Dispatch<React.SetStateAction<EquipoDelScorer[]>>
  ordenHoyos: readonly number[]
  currentHole: number
  conexion: string
  deshabilitado: boolean
}): (equipo: EquipoDelScorer) => DrivesDeUnEquipo | null {
  const { codigo, drivesMinimo, teamEquipos, setTeamEquipos, ordenHoyos, currentHole, conexion, deshabilitado } = input
  const algunoAnota = teamEquipos.some(e => !!e.drive_jugadores)
  const [enCola, setEnCola] = useState<CambiosPorEquipo>({})
  const [confirmados, setConfirmados] = useState<CambiosPorEquipo>({})
  const leerCola = useCallback(() => setEnCola(cambiosDeLaCola(codigo)), [codigo])

  const alResultado = useCallback((r: ResultadoDrives) => {
    if (r.confirmados.length > 0) {
      setConfirmados(prev => {
        const next = { ...prev }
        for (const c of r.confirmados) next[c.equipoId] = { ...(next[c.equipoId] ?? {}), [String(c.hoyo)]: c.valor }
        return next
      })
      const ultimos = new Map(r.confirmados.map(c => [c.equipoId, c.drives]))
      setTeamEquipos(prev => prev.map(e => {
        if (!ultimos.has(e.id) || !e.drive_jugadores) return e
        return { ...e, drives: leerDrives(ultimos.get(e.id), e.drive_jugadores.length) }
      }))
    }
    if (r.rechazados.length > 0) {
      const hoyos = [...new Set(r.rechazados.map(x => x.drive.hoyo))].sort((a, b) => a - b)
      addToast({
        type: 'error',
        title: hoyos.length === 1 ? `No se guardó el drive del hoyo ${hoyos[0]}` : `No se guardaron los drives de los hoyos ${hoyos.join(', ')}`,
        message: 'La ronda ya no acepta cambios de este teléfono.',
        duration: 8000,
      })
    }
  }, [setTeamEquipos])

  const reenviando = useRef(false)
  const reenviar = useCallback(() => {
    if (reenviando.current || drivesPendientes(codigo).length === 0) return
    reenviando.current = true
    void reenviarDrivesPendientes(createClient(), codigo)
      .then(alResultado)
      .catch(e => { void captureError(e, { context: 'drives.reenviar', meta: { codigo } }) })
      .finally(() => { reenviando.current = false; leerCola() })
  }, [codigo, alResultado, leerCola])

  // Al abrir, al volver la señal y con cada lectura nueva de los equipos: lo que quedó en el teléfono sube solo.
  useEffect(() => {
    if (!algunoAnota) return
    leerCola()
    if (conexion === 'ok') reenviar()
  }, [algunoAnota, conexion, teamEquipos, leerCola, reenviar])

  const elegirEn = useCallback((equipoId: string, hoyo: number, posicion: number, actual: number | null) => {
    const jugador = actual === posicion ? null : posicion
    const envio = marcarDriveConRespaldo(createClient(), codigo, { equipoId, hoyo, jugador })
    leerCola()
    void envio
      .then(alResultado)
      .catch(e => { void captureError(e, { context: 'drives.marcar', meta: { codigo } }) })
      .finally(leerCola)
  }, [codigo, alResultado, leerCola])

  const porEquipo = useMemo(() => {
    const out = new Map<string, DrivesDeUnEquipo>()
    for (const e of teamEquipos) {
      const jugadores = e.drive_jugadores
      if (!jugadores || jugadores.length === 0) continue
      const drives = drivesConCambios(e.drives ?? {}, confirmados[e.id] ?? {}, enCola[e.id] ?? {})
      const driveDelHoyo = drives[String(currentHole)] ?? null
      const datos = { jugadores, drives, minimo: drivesMinimo, hoyos: ordenHoyos }
      const aviso = avisoDeDrives(datos)
      out.set(e.id, {
        jugadores,
        driveDelHoyo,
        conteo: conteoDeDrives(datos),
        minimo: drivesMinimo,
        aviso: aviso ? textoAvisoDeDrives(aviso) : null,
        hoyosSinDrive: hoyosSinDrive(drives, ordenHoyos),
        elegir: (posicion: number) => { if (!deshabilitado) elegirEn(e.id, currentHole, posicion, driveDelHoyo) },
      })
    }
    return out
  }, [teamEquipos, confirmados, enCola, currentHole, drivesMinimo, ordenHoyos, deshabilitado, elegirEn])

  return useCallback((equipo: EquipoDelScorer) => porEquipo.get(equipo.id) ?? null, [porEquipo])
}
