/**
 * src/golf/torneo/gestion-en-juego.ts
 *
 * Reglas para agregar, mover o borrar un inscrito con el torneo YA iniciado (#814). Fuente ÚNICA de:
 *   - "¿esta tarjeta tiene algo anotado?"        → `tarjetaTieneAnotaciones`
 *   - el tamaño de equipo que se exige            → `motivoTamanoDeEquipo` / `equipoIncompleto` (también el inicio),
 *     sobre `jugadoresPorEquipo` (plantilla-de-jugadores.ts, la única lectura de `FORMAT_META.jugadoresPorEquipo`)
 *   - si el hándicap del equipo se puede calcular → `handicapDeEquipoCalculable` (también el inicio)
 *   - por qué NO se puede colocar a un inscrito   → `motivoParaNoColocar` (decisiones D1-D13 de Juanjo, 18-nov-2026;
 *     plan `docs/superpowers/plans/2026-11-18-gestion-en-juego-814.md`).
 *
 * Puro: sin Supabase ni React. La app planifica con esto y la RPC `colocar_inscrito_en_grupo` (PR2) vuelve a
 * evaluar las anotaciones BAJO LOCK con su espejo SQL: entre que se planifica y se escribe, el scorer puede anotar.
 * Si cambias una regla acá, cambia el espejo SQL (y viceversa). La RPC espeja TODOS los motivos de
 * `CodigoMotivoNoColocar`, incluido `retirado-no-se-mueve` (D11): un WD/DQ no se coloca ni se mueve.
 * D12 (colocar a un sin aprobar lo aprueba) y D13 (el WD/DQ de una pareja de foursome sin golpes sale al
 * completarla) son escrituras de la RPC, no de esta función.
 */

import { FORMAT_META, type FormatoJuego } from '@/golf/core/rules'
import { isMatchPlayFormat, isSharedBallFormat, isTeamFormat, KNOWN_FORMAT_KEYS } from '@/golf/formats'
import { handicapDeEquipo, type TeamHandicapConfig } from '@/golf/formats/team-handicap'
import { JUGADORES_POR_MATCH } from '@/golf/ronda-libre/formato-tarjeta-de-grupo'
import { jugadoresPorEquipo } from '@/golf/ronda-libre/plantilla-de-jugadores'
import { hoyosAnotados } from '@/golf/ronda-libre/progreso-de-ronda'
import type { ScoresDeTarjeta } from '@/golf/ronda-libre/tarjeta-historica'
import { inscritoAprobado, jugadorFueraDelTorneo } from '@/golf/tournament-status'

// ─── Anotaciones ─────────────────────────────────────────────────────────────

/**
 * ¿La tarjeta tiene al menos un hoyo anotado? `scores` es el JSONB de la fila donde viven los golpes del
 * formato: `ronda_libre_jugadores.scores` en individual y mejor bola, `ronda_equipos.scores` en bola
 * compartida. `hoyos` son los de la ronda (`hoyosJugadosDeLaRonda`).
 *
 * Cuenta CUALQUIER score guardado (`hoyosAnotados`), también el CONCEDE (-1) del match play: un hoyo concedido
 * ya es un match en juego, y para decidir si se puede tocar una tarjeta conviene fallar cerrado. No es
 * `hoyoConGolpes` (progreso-de-ronda.ts), que solo cuenta golpes reales (> 0) para el pie del leaderboard.
 * Espejo SQL (PR2): algún valor numérico de `jsonb_each(scores)` en esos hoyos.
 */
export function tarjetaTieneAnotaciones(scores: ScoresDeTarjeta | null | undefined, hoyos: readonly number[]): boolean {
  return hoyosAnotados(scores, hoyos) > 0
}

// ─── Tamaño y hándicap de equipo ─────────────────────────────────────────────

/**
 * Jugadores por equipo del formato (null si no es por equipos). `jugadoresPorEquipo` acota el máximo a
 * `MAX_JUGADORES_POR_RONDA` (4), pero hoy ningún formato pide más de 4: el tope no cambia el rango de
 * `FORMAT_META`. Ese techo es de la ronda libre que arma un jugador (`validar-nueva-ronda.ts`), NO de un grupo
 * de torneo: `materializeGroupScorecard` y el scorer no limitan las filas, y un grupo individual (stroke play,
 * stableford) puede tener 5 o más. Por eso acá no hay un motivo "grupo lleno" fuera de equipos y match play.
 */
function rango(format: string | null | undefined): { min: number; max: number } | null {
  return jugadoresPorEquipo(format as FormatoJuego)
}

/** Lista de hasta 5 elementos para un mensaje ("A, B, C, D, E y 3 más"). */
export function listaCorta(items: string[]): string {
  const extra = items.length > 5 ? ` y ${items.length - 5} más` : ''
  return items.slice(0, 5).join(', ') + extra
}

/**
 * Por qué algún equipo tiene un tamaño fuera de `jugadoresPorEquipo`, o null si todos calzan. Un grupo
 * vacío no cuenta. `groups` trae solo a los que compiten (`soloAprobados`). La usa el inicio
 * (`motivoParaNoIniciar`): al iniciar, todos los equipos tienen que estar completos.
 */
export function motivoTamanoDeEquipo(
  format: string | null | undefined,
  groups: ReadonlyArray<{ name: string; players: ReadonlyArray<unknown> }>,
): string | null {
  const r = rango(format)
  if (!r) return null
  const fueraDeRango = groups.filter((g) => g.players.length > 0 && (g.players.length < r.min || g.players.length > r.max))
  if (fueraDeRango.length === 0) return null
  const exigido = r.min === r.max ? `${r.min}` : `${r.min} a ${r.max}`
  const detalle = listaCorta(fueraDeRango.map((g) => `"${g.name}" (${g.players.length})`))
  return `Tamaño de equipo incorrecto. En ${FORMAT_META[format as FormatoJuego].label}, cada equipo debe tener ${exigido} jugadores. Corrige: ${detalle}.`
}

/**
 * D5/D7: un equipo que todavía no junta el mínimo de FILAS en su tarjeta está INCOMPLETO (se está armando) y
 * no puede anotar hasta completarse. `filas` = sus filas en la tarjeta, WD/DQ incluidos (`GrupoEnJuego.integrantes`):
 * una pareja con un retirado NO está incompleta, el compañero sigue jugando solo (R23.4 y decisión del 17-nov,
 * `fuera-del-ranking.ts`); si el equipo va al pie o no lo decide `estadoDelEquipo*`, no esta función. Vacío no es
 * incompleto (no hay nada que anotar). Fuera de los formatos por equipos, nunca. Lo usarán la RPC (PR2) y el
 * scorer (PR5) para bloquear el anotar.
 */
export function equipoIncompleto(format: string | null | undefined, filas: number): boolean {
  const r = rango(format)
  return r !== null && filas > 0 && filas < r.min
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

/**
 * ¿El equipo está al pie por sus WD/DQ? Espejo por conteos de `estadoDelEquipo*` (`leaderboard/fuera-del-ranking.ts`):
 * - foursome: con un WD/DQ, la pareja entera va al pie (Regla 22, `estadoDelEquipoFoursome`).
 * - mejor bola: sin nadie compitiendo y con alguna fila (`estadoDelEquipoMejorBola`, cero activos).
 * - scramble: nunca va al pie por un WD/DQ; sigue rankeado con quien queda (decisión del 17-nov).
 * No ve el DQ de mejor bola por un hoyo que solo anotó el descalificado (necesita los golpes): ese caso lo
 * resuelve la RPC (PR2) con `estadoDelEquipoMejorBola` sobre la tarjeta real.
 */
export function equipoAlPie(format: string | null | undefined, grupo: Pick<GrupoEnJuego, 'miembros' | 'integrantes'>): boolean {
  if (format === 'foursome') return grupo.integrantes > grupo.miembros
  if (isTeamFormat(format) && !isSharedBallFormat(format)) return grupo.miembros === 0 && grupo.integrantes > 0
  return false
}

// ─── Colocar a un inscrito ───────────────────────────────────────────────────

/** Un grupo de salida con su tarjeta, visto para la gestión en juego. En formato por equipos, grupo = equipo. */
export interface GrupoEnJuego {
  id: string
  /** Integrantes que compiten (aprobados, sin WD/DQ), contando al inscrito si ya está en este grupo. */
  miembros: number
  /** Todas sus filas en la tarjeta, también WD/DQ (siguen al pie con sus golpes). Siempre ≥ `miembros`. */
  integrantes: number
  /**
   * `tarjetaTieneAnotaciones` sobre alguna fila del grupo: en bola compartida, la del equipo; en el resto, la de
   * cualquier integrante (también WD/DQ).
   */
  tieneGolpes: boolean
}

export type OperacionEnJuego =
  /** Alta con el torneo en juego (D4): el organizador elige el grupo. Un sin aprobar queda aprobado (D12). */
  | { tipo: 'agregar'; destino: GrupoEnJuego }
  /** Cambio de grupo (D2, D3, D6, D10, D11, D13). */
  | { tipo: 'mover'; origen: GrupoEnJuego; destino: GrupoEnJuego }
  /** Eliminar la inscripción (D1, D8). `origen` null = inscrito sin grupo. */
  | { tipo: 'borrar'; origen: GrupoEnJuego | null }

export interface InscritoAColocar {
  /**
   * `tarjetaTieneAnotaciones` sobre SUS tarjetas: su fila de la tarjeta del grupo y, si no tiene grupo, su
   * tarjeta individual del torneo (`tournament_rounds`, donde anota un inscrito sin grupo desde #828).
   */
  tieneGolpes: boolean
  /** `estadoDelInscrito(players.status)`. */
  estado: EstadoInscrito
}

/**
 * Dónde está el inscrito respecto del juego:
 * - `compite`: aprobado; juega y cuenta para el tamaño del equipo.
 * - `retirado`: WD/DQ (`JUGADOR_FUERA_STATUSES`); tiene su fila, va al pie con sus golpes, no se coloca ni se mueve
 *   (D11) y no cuenta para el tamaño.
 * - `sin-aprobar`: pendiente o lista de espera; no tiene fila en ninguna tarjeta (`asegurar_tarjeta_vigente` solo
 *   se la da a un aprobado) y nunca va "al pie". D12: con el torneo en juego, colocarlo en un grupo (agregar o
 *   mover) lo APRUEBA en el mismo acto (lo hace la ruta/RPC, no esta función), así que para el destino se evalúa
 *   como si compitiera. En su grupo de origen no ocupa fila ni cuenta para el tamaño.
 */
export type EstadoInscrito = 'compite' | 'retirado' | 'sin-aprobar'

/** `players.status` → `EstadoInscrito`, sobre los predicados canónicos de `tournament-status`. */
export function estadoDelInscrito(status: string | null | undefined): EstadoInscrito {
  if (jugadorFueraDelTorneo(status)) return 'retirado'
  return inscritoAprobado(status) ? 'compite' : 'sin-aprobar'
}

export type CodigoMotivoNoColocar =
  /** El formato es null o no está en `KNOWN_FORMAT_KEYS`: falla cerrado. */
  | 'formato-desconocido'
  /** Origen y destino son el mismo grupo. */
  | 'mismo-grupo'
  /** D11: un WD/DQ no se coloca ni cambia de grupo; se queda donde está, al pie y con sus golpes. */
  | 'retirado-no-se-mueve'
  /**
   * Fallar cerrado (#828): el inscrito sin grupo ya anotó en su tarjeta individual del torneo. Hasta que el PR3
   * resuelva cómo se trasladan esos golpes a la tarjeta del grupo, no se asigna.
   */
  | 'agregar-con-tarjeta-individual'
  /** D1: tiene golpes; no se elimina, se retira (WD) y queda al pie con sus golpes. */
  | 'borrar-con-golpes'
  /** D8: match play, el match ya empezó (anotó el rival); no se elimina, se retira (WD). */
  | 'borrar-match-en-juego'
  /** D10: un grupo de match play admite como máximo `JUGADORES_POR_MATCH`. */
  | 'match-play-grupo-lleno'
  /** D6: match play, algún grupo implicado ya tiene golpes. */
  | 'match-play-con-golpes'
  /** D2: mejor bola, alguno de los dos equipos ya tiene golpes. */
  | 'mejor-bola-con-golpes'
  /** El destino pasaría el máximo de jugadores por equipo. */
  | 'equipo-lleno'
  /**
   * El destino ya tiene golpes y está al pie (`equipoAlPie`): no se le agregan jugadores, porque lo sacarían del pie
   * con los golpes de sus WD/DQ. Sin golpes, un foursome con un WD/DQ sí se completa (D13).
   */
  | 'equipo-al-pie'
  /**
   * Un equipo con golpes (origen o destino) quedaría bajo el mínimo: de los que compiten, o de filas en su tarjeta
   * (`equipoIncompleto`). D3: un equipo que ya juega nunca queda fuera de `jugadoresPorEquipo`.
   */
  | 'equipo-con-golpes-incompleto'
  /** Un equipo con golpes quedaría sin ninguna fila (ni siquiera la de un WD/DQ). */
  | 'equipo-con-golpes-sin-miembros'
  /** Bola compartida: el hándicap de un equipo resultante no se puede calcular con la configuración. */
  | 'handicap-de-equipo'

export interface MotivoNoColocar {
  codigo: CodigoMotivoNoColocar
  mensaje: string
  /** Borrar no se puede, pero retirarlo (WD) sí: la UI ofrece "Retirar" (D1, D8). Nunca si ya es WD/DQ. */
  ofreceRetirar: boolean
}

const motivo = (codigo: CodigoMotivoNoColocar, mensaje: string, ofreceRetirar = false): MotivoNoColocar => ({
  codigo,
  mensaje,
  ofreceRetirar,
})

/**
 * Por qué NO se puede hacer la operación, o null si se puede. Pura y sin lecturas: la RPC repite el chequeo
 * de anotaciones bajo lock. `format` es el formato RESUELTO del torneo (`resolveFormatoJuego`); `handicap` es
 * `leerHandicapDeEquipo(team_config)`.
 *
 * Que se pueda no significa que no haya que confirmar: con golpes en juego (D2, D4, D9) la UI pide confirmación.
 * Tampoco que el equipo pueda anotar: uno que queda bajo el mínimo y sin golpes se permite (D7) y queda
 * `equipoIncompleto`.
 *
 * Pendiente para el PR2: el hándicap de equipo se valida acá con los que COMPITEN (`miembros`), pero
 * `editarHandicapInscrito` lo recalcula con todos los miembros materializados (`integrantes`, WD incluidos).
 * La RPC tiene que usar el mismo conteo que esta función, o esta función el de la RPC.
 */
export function motivoParaNoColocar(
  format: string | null,
  op: OperacionEnJuego,
  inscrito: InscritoAColocar,
  handicap: TeamHandicapConfig | null = null,
): MotivoNoColocar | null {
  if (!format || !KNOWN_FORMAT_KEYS.includes(format)) {
    return motivo('formato-desconocido', 'No se reconoce el formato del torneo; no se puede cambiar el grupo.')
  }
  const origen = op.tipo === 'agregar' ? null : op.origen
  const destino = op.tipo === 'borrar' ? null : op.destino
  const compartida = isSharedBallFormat(format)
  const matchPlay = isMatchPlayFormat(format)

  if (origen && destino && origen.id === destino.id) {
    return motivo('mismo-grupo', 'El jugador ya está en ese grupo.')
  }

  // D11. Con el torneo en juego, un WD/DQ se queda donde está (en su grupo o sin grupo), al pie y con sus
  // golpes, en todos los formatos.
  if (op.tipo !== 'borrar' && inscrito.estado === 'retirado') {
    return motivo('retirado-no-se-mueve', 'Un jugador retirado o descalificado no se asigna ni se cambia de grupo: sigue al pie donde está.')
  }
  // Fallar cerrado (#828): sus golpes viven en su tarjeta individual y todavía no hay cómo llevarlos al grupo.
  if (op.tipo === 'agregar' && inscrito.tieneGolpes) {
    return motivo('agregar-con-tarjeta-individual', 'Ya anotó golpes en su tarjeta individual: por ahora no se puede asignar a un grupo.')
  }
  // Sin aprobar no tiene fila ni va al pie: borrarlo elimina la inscripción sin tocar ninguna tarjeta. Si aun
  // así aparecen golpes (no hay camino hoy), falla cerrado sin ofrecer retirarlo.
  if (op.tipo === 'borrar' && inscrito.estado === 'sin-aprobar') {
    return inscrito.tieneGolpes
      ? motivo('borrar-con-golpes', 'Tiene golpes anotados: no se puede eliminar. Escríbenos a soporte.')
      : null
  }

  if (op.tipo === 'borrar') {
    // Ya WD/DQ: no se ofrece retirarlo (de DQ a WD cambiaría el board); queda al pie como está.
    const retirable = inscrito.estado === 'compite'
    // D1. En bola compartida los golpes son del equipo: el inscrito los tiene si su equipo los tiene.
    if (inscrito.tieneGolpes || (compartida && origen?.tieneGolpes)) {
      return retirable
        ? motivo('borrar-con-golpes', 'Ya tiene golpes anotados: no se puede eliminar. Retíralo (WD) y queda al pie con sus golpes.', true)
        : motivo('borrar-con-golpes', 'Ya tiene golpes anotados: no se puede eliminar. Sigue al pie con sus golpes.')
    }
    // D8. El match ya empezó aunque él no haya anotado: eliminarlo cambiaría la tarjeta del rival.
    if (matchPlay && origen?.tieneGolpes) {
      return retirable
        ? motivo('borrar-match-en-juego', 'Su match ya empezó: no se puede eliminar. Retíralo (WD).', true)
        : motivo('borrar-match-en-juego', 'Su match ya empezó: no se puede eliminar. Sigue al pie.')
    }
  }

  if (matchPlay && destino) {
    // D10. Un match es un par: un tercero rompe la tarjeta (`formatoDeLaTarjetaDelGrupo`), con o sin golpes.
    if (destino.integrantes + 1 > JUGADORES_POR_MATCH) {
      return motivo('match-play-grupo-lleno', `Un grupo de match play admite como máximo ${JUGADORES_POR_MATCH} jugadores.`)
    }
    // D6.
    if (origen?.tieneGolpes || destino.tieneGolpes) {
      return motivo('match-play-con-golpes', 'En match play solo se puede cambiar un grupo antes de que se anote el primer hoyo.')
    }
  }

  // D2. Mejor bola (equipo sin bola compartida): con golpes en cualquiera de los dos no se cambia de equipo.
  const mejorBola = isTeamFormat(format) && !compartida
  if (mejorBola && op.tipo === 'mover' && (origen?.tieneGolpes || destino?.tieneGolpes)) {
    return motivo('mejor-bola-con-golpes', 'En mejor bola no se puede cambiar de equipo cuando alguno de los dos ya tiene golpes.')
  }

  // Invariantes de equipo (D3, D7, y los mismos para mejor bola). Acá llega un inscrito que compite o uno sin
  // aprobar (agregar o mover; D12: al destino entra aprobado), o uno que se borra: un retirado (tiene fila, pero
  // no cuenta para el tamaño) o uno que compite.
  const r = rango(format)
  if (!r) return null
  // Lo que el inscrito resta del origen: un sin aprobar no tiene fila ni cuenta; un WD/DQ tiene fila pero no cuenta.
  const salenMiembros = inscrito.estado === 'compite' ? 1 : 0
  const salenFilas = inscrito.estado === 'sin-aprobar' ? 0 : 1

  if (destino) {
    // Al destino solo llega quien compite o un sin aprobar que se aprueba al colocarlo (D11 ya sacó al WD/DQ).
    const quedan = destino.miembros + 1
    if (quedan > r.max) {
      return motivo('equipo-lleno', `El equipo ya tiene ${destino.miembros} jugadores; el máximo es ${r.max}.`)
    }
    // Un equipo con golpes que ya está al pie no vuelve al ranking con un jugador nuevo: sus golpes de WD/DQ
    // seguirían contando. D13: un foursome SIN golpes con un WD/DQ sí se completa; la RPC (PR2) saca la fila del
    // WD/DQ en el mismo acto (como borrarlo y agregar en dos pasos), porque si queda, `estadoDelEquipoFoursome`
    // manda a la pareja entera al pie.
    if (destino.tieneGolpes && equipoAlPie(format, destino)) {
      return motivo('equipo-al-pie', 'Ese equipo ya está al pie por sus retirados: no se le agregan jugadores.')
    }
    // Simétrico del origen (D3): un equipo que ya juega no sigue bajo el mínimo de los que compiten.
    if (destino.tieneGolpes && quedan < r.min) {
      return motivo('equipo-con-golpes-incompleto', `El equipo ya tiene golpes y quedaría con ${quedan} jugador${quedan === 1 ? '' : 'es'} en juego; el mínimo es ${r.min}.`)
    }
    // Un equipo bajo el mínimo se puede ir llenando (D5, D7); su hándicap se exige cuando el tamaño es válido.
    if (compartida && quedan >= r.min && !handicapDeEquipoCalculable(format, quedan, handicap)) {
      return motivo('handicap-de-equipo', `Con ${quedan} jugadores no se puede calcular el hándicap del equipo con la configuración del torneo.`)
    }
  }

  if (origen) {
    const quedan = origen.miembros - salenMiembros
    const filas = origen.integrantes - salenFilas
    if (origen.tieneGolpes && salenFilas > 0 && filas <= 0) {
      return motivo('equipo-con-golpes-sin-miembros', 'El equipo ya tiene golpes y quedaría sin jugadores.')
    }
    // Sin golpes, el origen puede quedar incompleto o vacío (D7). Con golpes, nunca bajo el mínimo: un equipo
    // que sigue rankeado tiene que tener quién juegue (por los que compiten) y no puede quedar con menos filas
    // que el mínimo, porque `equipoIncompleto` le bloquearía el anotar al que queda (R23.4: el compañero de un
    // WD sigue jugando solo, pero en una tarjeta que nació completa).
    if (origen.tieneGolpes && salenMiembros > 0 && quedan < r.min) {
      return motivo('equipo-con-golpes-incompleto', `El equipo ya tiene golpes y quedaría con ${quedan} jugador${quedan === 1 ? '' : 'es'} en juego; el mínimo es ${r.min}.`)
    }
    if (origen.tieneGolpes && salenFilas > 0 && equipoIncompleto(format, filas)) {
      return motivo('equipo-con-golpes-incompleto', `El equipo ya tiene golpes y su tarjeta quedaría con ${filas} jugador${filas === 1 ? '' : 'es'}; el mínimo es ${r.min}.`)
    }
    if (compartida && salenMiembros > 0 && quedan >= r.min && !handicapDeEquipoCalculable(format, quedan, handicap)) {
      return motivo('handicap-de-equipo', `Con ${quedan} jugadores no se puede calcular el hándicap del equipo con la configuración del torneo.`)
    }
  }
  return null
}
