/**
 * FUENTE ÚNICA de "¿esta ronda se puede crear?".
 *
 * Antes vivía inline dentro del `onClick` de Crear ronda, mezclada con el
 * armado del payload y con `setLoading` en el medio. Como función pura se puede
 * testear cada regla y — sobre todo — la puede consultar la UI para desactivar
 * el botón ANTES de que el usuario lo toque, en vez de dejarlo apretar y
 * responderle con un toast.
 *
 * Espeja las validaciones de `POST /api/ronda-libre/create`. El servidor sigue
 * siendo la autoridad; esto evita el viaje y el error tardío.
 */

import { FORMAT_META, type FormatoJuego, type ModoJuego } from '@/golf/core/rules'
import { isTeamFormat } from '@/golf/formats'
import {
  MAX_JUGADORES_POR_RONDA,
  jugadoresMinimos,
  jugadoresPorEquipo,
} from './plantilla-de-jugadores'

export interface JugadorAValidar {
  nombre: string
  /** Índice WHS. `null` = no cargado. */
  indice: number | null
}

export interface EquipoAValidar {
  nombre: string
  jugadorIndices: number[]
}

export interface RondaAValidar {
  cancha: string
  formato: FormatoJuego
  modo: ModoJuego
  /** Creador primero, después los rivales con nombre cargado. */
  jugadores: JugadorAValidar[]
  equipos: EquipoAValidar[]
}

export interface ProblemaDeLaRonda {
  titulo: string
  detalle: string
}

/** `null` cuando la ronda se puede crear. */
export function validarNuevaRonda(ronda: RondaAValidar): ProblemaDeLaRonda | null {
  return (
    problemaDeCancha(ronda) ??
    problemaDeCantidad(ronda) ??
    problemaDeEquipos(ronda) ??
    problemaDeIndices(ronda)
  )
}

function problemaDeCancha({ cancha }: RondaAValidar): ProblemaDeLaRonda | null {
  if (cancha.trim()) return null
  return { titulo: 'Selecciona una cancha', detalle: 'Elige la cancha donde vas a jugar.' }
}

function problemaDeCantidad({ formato, jugadores }: RondaAValidar): ProblemaDeLaRonda | null {
  const label = FORMAT_META[formato]?.label ?? formato

  if (jugadores.length === 0) {
    return { titulo: 'Faltan jugadores', detalle: 'Agrega al menos un jugador para crear la ronda.' }
  }

  if (jugadores.length > MAX_JUGADORES_POR_RONDA) {
    return {
      titulo: 'Demasiados jugadores',
      detalle: `Una ronda libre admite hasta ${MAX_JUGADORES_POR_RONDA} jugadores.`,
    }
  }

  // Match Play es el único formato con un techo propio: 1 vs 1, ni uno más.
  if (FORMAT_META[formato]?.requiereParejas && jugadores.length !== 2) {
    return {
      titulo: `${label} requiere 2 jugadores`,
      detalle: jugadores.length < 2
        ? 'Agrega exactamente un rival para jugar Match Play.'
        : 'Match Play es 1 vs 1 — quita los jugadores de más.',
    }
  }

  const minimo = jugadoresMinimos(formato)
  if (jugadores.length < minimo) {
    return {
      titulo: 'Faltan jugadores',
      detalle: `${label} necesita al menos ${minimo} jugadores (2 equipos de ${minimo / 2}).`,
    }
  }

  return null
}

function problemaDeEquipos({ formato, jugadores, equipos }: RondaAValidar): ProblemaDeLaRonda | null {
  if (!isTeamFormat(formato)) return null
  const porEquipo = jugadoresPorEquipo(formato)
  if (!porEquipo) return null

  const tamañoValido = equipos.every(
    e => e.jugadorIndices.length >= porEquipo.min && e.jugadorIndices.length <= porEquipo.max,
  )
  const asignados = equipos.reduce((suma, e) => suma + e.jugadorIndices.length, 0)

  if (tamañoValido && asignados === jugadores.length) return null

  return {
    titulo: 'Equipos incompletos',
    detalle: porEquipo.min === porEquipo.max
      ? `${FORMAT_META[formato]?.label} requiere exactamente ${porEquipo.min} jugadores por equipo.`
      : `Asigna todos los jugadores a un equipo (mínimo ${porEquipo.min} por equipo).`,
  }
}

/**
 * El modo neto reparte golpes por índice: sin el índice de alguien, ese jugador
 * competiría en gross contra rivales con handicap. Gross no pide nada — ni
 * siquiera en Match Play.
 */
function problemaDeIndices({ modo, jugadores }: RondaAValidar): ProblemaDeLaRonda | null {
  if (modo !== 'neto') return null

  const sinIndice = jugadores.filter(j => j.indice == null).map(j => j.nombre || 'Sin nombre')
  if (sinIndice.length === 0) return null

  return {
    titulo: 'Índice requerido',
    detalle: `Falta el índice WHS de: ${sinIndice.join(', ')}. Modo neto requiere handicap para todos.`,
  }
}
