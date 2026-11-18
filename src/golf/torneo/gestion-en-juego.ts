/**
 * src/golf/torneo/gestion-en-juego.ts
 *
 * Reglas para agregar, mover o borrar un inscrito con el torneo YA iniciado (#814). Fuente ÚNICA de:
 *   - "¿esta tarjeta tiene golpes?"  → `tarjetaTieneGolpes`
 *   - el tamaño de un equipo válido   → `rangoDeEquipo` / `motivoTamanoDeEquipo` (también la usa el inicio)
 *   - si el hándicap del equipo se puede calcular → `handicapDeEquipoCalculable` (también la usa el inicio)
 *   - por qué NO se puede colocar a un inscrito en un grupo → `motivoParaNoColocar` (decisiones D1-D6 de
 *     Juanjo, 18-nov-2026; plan `docs/superpowers/plans/2026-11-18-gestion-en-juego-814.md`).
 *
 * Puro: sin Supabase ni React. La app planifica con esto y la RPC `colocar_inscrito_en_grupo` (PR2) vuelve a
 * evaluar los golpes BAJO LOCK con su espejo SQL: entre que se planifica y se escribe, el scorer puede anotar.
 * Si cambias una regla acá, cambia el espejo SQL (y viceversa).
 */

import { FORMAT_META, type FormatoJuego } from '@/golf/core/rules'
import { isSharedBallFormat, isTeamFormat } from '@/golf/formats'
import { handicapDeEquipo, type TeamHandicapConfig } from '@/golf/formats/team-handicap'
import { hoyosAnotados } from '@/golf/ronda-libre/progreso-de-ronda'
import type { ScoresDeTarjeta } from '@/golf/ronda-libre/tarjeta-historica'

// ─── Golpes ──────────────────────────────────────────────────────────────────

/**
 * ¿La tarjeta tiene al menos un hoyo anotado? `scores` es el JSONB de la fila donde viven los golpes del
 * formato: `ronda_libre_jugadores.scores` en individual y mejor bola, `ronda_equipos.scores` en bola
 * compartida. `hoyos` son los de la ronda (`hoyosJugadosDeLaRonda`).
 *
 * Cuenta cualquier score guardado, también el CONCEDE (-1) del match play: un hoyo concedido ya es un
 * match en juego. Espejo SQL (PR2): un `jsonb_each(scores)` con valor numérico en esos hoyos.
 */
export function tarjetaTieneGolpes(scores: ScoresDeTarjeta | null | undefined, hoyos: readonly number[]): boolean {
  return hoyosAnotados(scores, hoyos) > 0
}

// ─── Tamaño y hándicap de equipo ─────────────────────────────────────────────

/** Mínimo y máximo de jugadores por equipo, o null si el formato no es por equipos. */
export function rangoDeEquipo(format: string | null | undefined): { min: number; max: number } | null {
  if (!isTeamFormat(format)) return null
  return FORMAT_META[format as FormatoJuego]?.jugadoresPorEquipo ?? null
}

/** Lista de hasta 5 elementos para un mensaje ("A, B, C, D, E y 3 más"). */
export function listaCorta(items: string[]): string {
  const extra = items.length > 5 ? ` y ${items.length - 5} más` : ''
  return items.slice(0, 5).join(', ') + extra
}

/**
 * Por qué algún equipo tiene un tamaño fuera de `jugadoresPorEquipo`, o null si todos calzan. Un grupo
 * vacío no cuenta. `groups` trae solo a los que compiten (`soloAprobados`). La usan el inicio
 * (`motivoParaNoIniciar`) y la gestión en juego.
 */
export function motivoTamanoDeEquipo(
  format: string | null | undefined,
  groups: ReadonlyArray<{ name: string; players: ReadonlyArray<unknown> }>,
): string | null {
  const rango = rangoDeEquipo(format)
  if (!rango) return null
  const fueraDeRango = groups.filter(
    (g) => g.players.length > 0 && (g.players.length < rango.min || g.players.length > rango.max),
  )
  if (fueraDeRango.length === 0) return null
  const exigido = rango.min === rango.max ? `${rango.min}` : `${rango.min} a ${rango.max}`
  const detalle = listaCorta(fueraDeRango.map((g) => `"${g.name}" (${g.players.length})`))
  return `Tamaño de equipo incorrecto. En ${FORMAT_META[format as FormatoJuego].label}, cada equipo debe tener ${exigido} jugadores. Corrige: ${detalle}.`
}

/**
 * Bola compartida: ¿se puede calcular el hándicap de un equipo de `jugadores` con la configuración guardada?
 * Solo depende del tamaño (los porcentajes del personalizado son por posición). Fuera de bola compartida no
 * hay hándicap de equipo: siempre true.
 */
export function handicapDeEquipoCalculable(
  format: string | null | undefined,
  jugadores: number,
  handicap: TeamHandicapConfig | null,
): boolean {
  if (!isSharedBallFormat(format)) return true
  return handicapDeEquipo(format, Array.from({ length: jugadores }, () => 0), handicap) !== null
}

// ─── Colocar a un inscrito ───────────────────────────────────────────────────

/** Un grupo de salida con su tarjeta, visto para la gestión en juego. En formato por equipos, grupo = equipo. */
export interface GrupoEnJuego {
  id: string
  /** Integrantes que compiten (aprobados, sin WD/DQ), contando al inscrito si ya está en este grupo. */
  miembros: number
  /** Todas sus filas en la tarjeta, también WD/DQ (siguen al pie con sus golpes). */
  integrantes: number
  /**
   * ¿La tarjeta del grupo tiene golpes? (`tarjetaTieneGolpes` sobre alguna fila del grupo.) En bola
   * compartida, los del equipo; en el resto, los de cualquier integrante (también WD/DQ).
   */
  tieneGolpes: boolean
}

export type OperacionEnJuego =
  /** Alta con el torneo en juego (D4): el organizador elige el grupo. */
  | { tipo: 'agregar'; destino: GrupoEnJuego }
  /** Cambio de grupo (D2, D3, D6). */
  | { tipo: 'mover'; origen: GrupoEnJuego; destino: GrupoEnJuego }
  /** Eliminar la inscripción (D1). `origen` null = inscrito sin grupo. */
  | { tipo: 'borrar'; origen: GrupoEnJuego | null }

export interface InscritoAColocar {
  /** Golpes en SU fila (`ronda_libre_jugadores.scores`). En bola compartida no se usa: manda el equipo. */
  tieneGolpes: boolean
  /** Aprobado y sin WD/DQ. Un WD/DQ se puede mover, pero no cuenta para el tamaño del equipo. */
  compite: boolean
}

export type CodigoMotivoNoColocar =
  /** Origen y destino son el mismo grupo. */
  | 'mismo-grupo'
  /** D1: tiene golpes; no se elimina, se retira (WD) y queda al pie con sus golpes. */
  | 'borrar-con-golpes'
  /** D2: mejor bola, alguno de los dos equipos ya tiene golpes. */
  | 'mejor-bola-con-golpes'
  /** D6: match play, algún grupo implicado ya tiene golpes. */
  | 'match-play-con-golpes'
  /** El destino pasaría el máximo de jugadores por equipo. */
  | 'equipo-lleno'
  /** El origen quedaría con menos del mínimo de jugadores por equipo (sin quedar vacío). */
  | 'equipo-incompleto'
  /** Un equipo con golpes quedaría sin integrantes. */
  | 'equipo-con-golpes-sin-miembros'
  /** Bola compartida: el hándicap de un equipo resultante no se puede calcular con la configuración. */
  | 'handicap-de-equipo'

export interface MotivoNoColocar {
  codigo: CodigoMotivoNoColocar
  mensaje: string
}

const motivo = (codigo: CodigoMotivoNoColocar, mensaje: string): MotivoNoColocar => ({ codigo, mensaje })

/**
 * Por qué NO se puede hacer la operación, o null si se puede. Pura y sin lecturas: la RPC repite el chequeo
 * de golpes bajo lock. `format` es el formato RESUELTO del torneo (`resolveFormatoJuego`); `handicap` es
 * `leerHandicapDeEquipo(team_config)`.
 *
 * Que se pueda no significa que no haya que confirmar: con golpes en juego (D2, D4) la UI pide confirmación.
 * Eso no lo decide esta función.
 */
export function motivoParaNoColocar(
  format: string | null,
  op: OperacionEnJuego,
  inscrito: InscritoAColocar,
  handicap: TeamHandicapConfig | null = null,
): MotivoNoColocar | null {
  const origen = op.tipo === 'agregar' ? null : op.origen
  const destino = op.tipo === 'borrar' ? null : op.destino
  const compartida = isSharedBallFormat(format)

  if (origen && destino && origen.id === destino.id) {
    return motivo('mismo-grupo', 'El jugador ya está en ese grupo.')
  }

  // D1. En bola compartida los golpes son del equipo: el inscrito "tiene golpes" si su equipo los tiene.
  if (op.tipo === 'borrar') {
    const conGolpes = compartida ? Boolean(origen?.tieneGolpes) : inscrito.tieneGolpes
    if (conGolpes) {
      return motivo('borrar-con-golpes', 'Ya tiene golpes anotados: no se puede eliminar. Retíralo (WD) y queda al pie con sus golpes.')
    }
  }

  // D6. Match play: el formato de la tarjeta depende de que el grupo sea un par (`formatoDeLaTarjetaDelGrupo`).
  if (FORMAT_META[format as FormatoJuego]?.requiereParejas && op.tipo !== 'borrar') {
    if (origen?.tieneGolpes || destino?.tieneGolpes) {
      return motivo('match-play-con-golpes', 'En match play solo se puede cambiar un grupo antes de que se anote el primer hoyo.')
    }
  }

  // D2. Mejor bola: con golpes en cualquiera de los dos equipos no se cambia de equipo.
  if (format === 'best_ball' && op.tipo === 'mover' && (origen?.tieneGolpes || destino?.tieneGolpes)) {
    return motivo('mejor-bola-con-golpes', 'En mejor bola no se puede cambiar de equipo cuando alguno de los dos ya tiene golpes.')
  }

  // Invariantes de equipo (D3, y los mismos para mejor bola). Un WD/DQ no cuenta para el tamaño.
  const rango = rangoDeEquipo(format)
  if (!rango) return null
  const delta = inscrito.compite ? 1 : 0

  if (destino) {
    const quedan = destino.miembros + delta
    if (quedan > rango.max) {
      return motivo('equipo-lleno', `El equipo ya tiene ${destino.miembros} jugadores; el máximo es ${rango.max}.`)
    }
    // Un equipo en formación (sin golpes, bajo el mínimo) se puede ir llenando (D5); su hándicap se exige
    // recién cuando el tamaño es válido, igual que al iniciar.
    if (compartida && quedan >= rango.min && !handicapDeEquipoCalculable(format, quedan, handicap)) {
      return motivo('handicap-de-equipo', `Con ${quedan} jugadores no se puede calcular el hándicap del equipo con la configuración del torneo.`)
    }
  }

  if (origen) {
    const quedan = origen.miembros - delta
    if (origen.tieneGolpes && origen.integrantes - 1 <= 0) {
      return motivo('equipo-con-golpes-sin-miembros', 'El equipo ya tiene golpes y quedaría sin jugadores.')
    }
    if (quedan > 0 && quedan < rango.min && delta > 0) {
      return motivo('equipo-incompleto', `El equipo quedaría con ${quedan} jugador${quedan === 1 ? '' : 'es'}; el mínimo es ${rango.min}.`)
    }
    if (compartida && quedan > 0 && delta > 0 && !handicapDeEquipoCalculable(format, quedan, handicap)) {
      return motivo('handicap-de-equipo', `Con ${quedan} jugadores no se puede calcular el hándicap del equipo con la configuración del torneo.`)
    }
  }
  return null
}
