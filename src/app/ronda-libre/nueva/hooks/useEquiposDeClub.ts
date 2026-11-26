'use client'

import { useRef, useState } from 'react'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { MAX_EQUIPOS_DE_CLUB, adminModeDeEquiposDeClub, admiteEquiposDeClub, type QuienAnota } from '@/golf/ronda-libre/equipos-de-club'
import { NOMBRE_EQUIPO_MAX, nombreDeEquipo, nombreVisibleDeEquipo } from '@/golf/ronda-libre/nombre-de-equipo'
import type { EquipoDeClubAValidar } from '@/golf/ronda-libre/validar-nueva-ronda'
import {
  JUGADORES_POR_EQUIPO_CON_DRIVES,
  NOMBRE_JUGADOR_DE_DRIVE_MAX,
  nombreDeJugadorDeDrive,
} from '@/golf/formats/drives-scramble'

/**
 * Scramble rápido (plan docs/superpowers/plans/2026-11-23-scramble-rapido.md §3): el paso Jugadores de un
 * Scramble ofrece «Solo equipos», equipos con su nombre y el hándicap que les dio el club, sin jugadores.
 * Las reglas del modo (tope, rango, hoyos) son de `src/golf/ronda-libre/equipos-de-club.ts`; acá solo vive lo
 * que el usuario escribe y cómo viaja.
 */

/** Un equipo tal como está en pantalla. El hándicap va como texto: vacío no es 0, es que falta. */
export interface EquipoDeClubDelFormulario {
  /** Identidad estable en el formulario (la `key` de la tarjeta), no viaja. */
  id: string
  nombre: string
  handicap: string
  /** Los jugadores del equipo para anotar drives (siempre 4 casillas; solo viajan con «Anotar drives» en Sí). */
  jugadores: string[]
}

function jugadoresVacios(): string[] {
  return Array.from({ length: JUGADORES_POR_EQUIPO_CON_DRIVES }, () => '')
}

/**
 * Lo que el campo deja escribir: dígitos y un separador decimal (coma o punto), no más de 4 caracteres. Un
 * decimal se deja escribir a propósito: lo frena el validador con su frase («sin decimales») en vez de que el
 * campo se trague la coma y "8,5" quede como 85.
 */
export function textoDeHandicapDeClub(crudo: string): string {
  return crudo.replace(/[^0-9.,]/g, '').slice(0, 4)
}

/** El número escrito, o `null` si el campo está vacío. "8,5" → 8.5 (lo rechaza el validador: sin decimales). */
export function handicapDeClubDesdeTexto(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.')
  if (!limpio) return null
  // "8,5,1" o "." no son un número: quedan NaN y el validador los rechaza por rango, igual que un decimal.
  return Number(limpio)
}

/**
 * Los equipos como los reciben el validador compartido y `POST /api/ronda-libre/create` (`equipos_de_club`).
 * UNA resolución para validar y para enviar. El nombre va como se ve (vacío → «Equipo N»), el mismo que grabaría
 * la API. En gross el hándicap no se pide ni viaja.
 */
export function equiposDeClubParaEnviar(
  equipos: readonly EquipoDeClubDelFormulario[],
  modo: ModoJuego,
  anotarDrives = false,
): EquipoDeClubAValidar[] {
  return equipos.map((e, i) => ({
    nombre: nombreVisibleDeEquipo(e.nombre, i),
    handicap: modo === 'neto' ? handicapDeClubDesdeTexto(e.handicap) : null,
    // Sin drives la clave no existe: el body queda igual al de siempre.
    ...(anotarDrives ? { driveJugadores: e.jugadores.map(nombreDeJugadorDeDrive) } : {}),
  }))
}

interface Args {
  formato: FormatoJuego
  modo: ModoJuego
  /** El Neto del formato actual pide un plan que el usuario no tiene (`netoBloqueadoPorPlan`). */
  netoBloqueado: boolean
  /** Cambia el modo de la ronda (el hándicap del club solo juega en neto). */
  onModo: (modo: ModoJuego) => void
}

export function useEquiposDeClub({ formato, modo, netoBloqueado, onModo }: Args) {
  // Contador y no `crypto.randomUUID()`: igual que los rivales, da el mismo id en el servidor y al hidratar.
  const ultimoId = useRef(0)
  const equipoVacio = (nombre = ''): EquipoDeClubDelFormulario => {
    ultimoId.current += 1
    return { id: `equipo-club-${ultimoId.current}`, nombre, handicap: '', jugadores: jugadoresVacios() }
  }

  const [soloEquiposElegido, setSoloEquiposElegido] = useState(false)
  const [equipos, setEquipos] = useState<EquipoDeClubDelFormulario[]>(() => [equipoVacio()])
  /**
   * «Yo anoto todos» | «Cada equipo en su celular». Sin preselección (`null`): con 2 o más equipos el validador
   * pide elegir. Con 1 equipo no se pregunta y no viaja (anota el creador).
   */
  const [quienAnota, setQuienAnota] = useState<QuienAnota | null>(null)
  /** «¿Anotar drives?» No por defecto: sin tocarlo, la ronda es la de siempre. */
  const [anotarDrives, setAnotarDrives] = useState(false)
  const seElige = equipos.length >= 2

  /** Lo elegido solo cuenta en un formato que lo admite: volver a Best Ball no arrastra equipos sin jugadores. */
  const soloEquipos = admiteEquiposDeClub(formato) && soloEquiposElegido

  /**
   * El modo que tenía la ronda antes de que «Solo equipos» la pasara a Neto. Al volver a «Con jugadores» se
   * devuelve: el scramble con jugadores sigue en el modo que el usuario eligió (con Gross no pide índices).
   * `null` = «Solo equipos» no cambió el modo y no hay nada que devolver.
   */
  const modoAntesDeSoloEquipos = useRef<ModoJuego | null>(null)

  /**
   * «Con jugadores» | «Solo equipos». Solo la transición cuenta: tocar el segmento que ya está activo no hace
   * nada. Entrar deja la ronda en Neto si el plan lo permite; salir deshace ese cambio solo si el usuario no
   * eligió un modo entremedio (`elegirModo` lo olvida: manda lo último que eligió).
   */
  const elegirSoloEquipos = (solo: boolean) => {
    if (solo === soloEquiposElegido) return
    setSoloEquiposElegido(solo)
    if (solo) {
      if (modo !== 'neto' && !netoBloqueado) {
        modoAntesDeSoloEquipos.current = modo
        onModo('neto')
      }
      return
    }
    const previo = modoAntesDeSoloEquipos.current
    modoAntesDeSoloEquipos.current = null
    if (previo !== null && modo === 'neto') onModo(previo)
  }

  /**
   * El modo que elige el usuario en el paso Formato. Pasa siempre por acá y no directo a `onModo`: una elección
   * suya, aunque vuelva a Neto, reemplaza lo que «Solo equipos» guardó para devolver.
   */
  const elegirModo = (m: ModoJuego) => {
    modoAntesDeSoloEquipos.current = null
    onModo(m)
  }

  const puedeAgregar = equipos.length < MAX_EQUIPOS_DE_CLUB

  const agregar = () => {
    setEquipos(prev => (prev.length < MAX_EQUIPOS_DE_CLUB ? [...prev, equipoVacio()] : prev))
  }

  /** El último equipo no se quita: sin equipos no hay ronda (para volver a jugadores está «Con jugadores»). */
  const quitar = (idx: number) => {
    setEquipos(prev => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
  }

  const renombrar = (idx: number, nombre: string) => {
    setEquipos(prev => prev.map((e, i) => (i === idx ? { ...e, nombre: nombre.slice(0, NOMBRE_EQUIPO_MAX) } : e)))
  }

  const escribirJugador = (idx: number, jugador: number, nombre: string) => {
    setEquipos(prev => prev.map((e, i) => (i === idx
      ? { ...e, jugadores: e.jugadores.map((n, j) => (j === jugador ? nombre.slice(0, NOMBRE_JUGADOR_DE_DRIVE_MAX) : n)) }
      : e)))
  }

  const escribirHandicap = (idx: number, texto: string) => {
    setEquipos(prev => prev.map((e, i) => (i === idx ? { ...e, handicap: textoDeHandicapDeClub(texto) } : e)))
  }

  /**
   * Repetir una ronda: vuelve a «Solo equipos» con los mismos nombres y los hándicaps VACÍOS (un hándicap de
   * club viejo es un resultado equivocado: el club lo cambia de un torneo a otro). Sin equipos de club, «Con
   * jugadores». No toca el modo: lo repite `repetirRonda` del formulario (y por eso no queda modo que devolver).
   * Un nombre igual al de su posición («Equipo 2») vuelve vacío: es el que se pone solo, no uno que se escribió.
   */
  const restaurar = (nombres: readonly string[] | null) => {
    modoAntesDeSoloEquipos.current = null
    if (!nombres || nombres.length === 0) {
      setSoloEquiposElegido(false)
      setQuienAnota(null)
      setAnotarDrives(false)
      setEquipos([equipoVacio()])
      return
    }
    setSoloEquiposElegido(true)
    // Repetir no arrastra la elección: con 2 o más equipos se vuelve a preguntar.
    setQuienAnota(null)
    // Tampoco los drives: los jugadores de un equipo cambian de un torneo a otro.
    setAnotarDrives(false)
    setEquipos(nombres.slice(0, MAX_EQUIPOS_DE_CLUB).map((n, i) =>
      equipoVacio(n === nombreDeEquipo(i) ? '' : n.slice(0, NOMBRE_EQUIPO_MAX))))
  }

  return {
    soloEquipos,
    elegirSoloEquipos,
    elegirModo,
    equipos,
    puedeAgregar,
    agregar,
    quitar,
    renombrar,
    escribirHandicap,
    escribirJugador,
    anotarDrives,
    elegirAnotarDrives: setAnotarDrives,
    restaurar,
    /** Con 2 o más equipos se elige quién anota; con 1 no se pregunta. */
    seEligeQuienAnota: seElige,
    quienAnota,
    elegirQuienAnota: setQuienAnota,
    /** Lo que viaja en `equipos_de_club.quien_anota` (y valida): `null` con 1 equipo o sin elegir. */
    quienAnotaParaEnviar: seElige ? quienAnota : null,
    /** La ronda queda de un celular por equipo (`admin_mode` false): la misma regla que aplica el servidor. */
    unCelularPorEquipo: soloEquipos && !adminModeDeEquiposDeClub(seElige ? quienAnota : null, equipos.length),
    /** `null` fuera de «Solo equipos»: la ronda va con jugadores, como siempre. */
    paraEnviar: soloEquipos ? equiposDeClubParaEnviar(equipos, modo, anotarDrives) : null,
    /** Lo que viaja en `equipos_de_club.anotar_drives` (y valida): solo `true` si se eligió. */
    anotarDrivesParaEnviar: soloEquipos && anotarDrives,
  }
}

export type EquiposDeClubDelFormulario = ReturnType<typeof useEquiposDeClub>
