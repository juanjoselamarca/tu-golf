// src/golf/leaderboard/team-tiebreak.ts
//
// Desempate de equipos por countback USGA. Fuente ÚNICA del concepto
// "cómo se rompe un empate en un board" (regla "un concepto, una fuente"):
// reutiliza el mismo motor `resolveLeaderboardTies` que el path individual
// (`rank-entries.ts`), en vez de un desempate paralelo. `ordenarEquipos*`
// (scramble/foursome/best_ball) llaman acá.

import { applyCountback, type CountbackMode } from '@/golf/core/countback'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'

export interface TeamCountbackAccessors<T> {
  /** Score primario que define el empate. Menor gana con 'lower_wins', mayor con 'higher_wins'. */
  primaryScore: (t: T) => number
  /** Score por hoyo del equipo para el card-off (índice 0 = hoyo 1). Huecos → 0. */
  holeScores: (t: T) => number[]
  /** Dirección del desempate: 'lower_wins' (gross/neto) o 'higher_wins' (stableford). */
  mode: CountbackMode
  /** Hoyos con score del equipo. Con 0 el equipo no compite: va al final, fuera del countback. */
  holesPlayed: (t: T) => number
}

/** Equipo ordenado + su clave de empate para las etiquetas "T2" de las tablas. */
export type EquipoConClaveDeEmpate<T> = T & {
  /**
   * Mismo valor = empate de golf (mismo score y el countback no los separó, o no
   * correspondía correrlo). Opaca: número de grupo de score + subgrupo de countback,
   * sin el score. null = el equipo no ha jugado (sin posición). Se lee con
   * `etiquetasPorClaveDeEmpate` (src/golf/core/posiciones.ts).
   */
  claveEmpate: string | null
}

/**
 * Ordena equipos por su score primario y rompe empates con countback USGA
 * (hole-count-aware: 18h usa back-9/6/3/1, 9h usa back-6/3/1). Genérico sobre
 * el tipo de resultado de equipo — cada formato provee los accessors.
 *
 * El countback corre SOLO en grupos de empatados donde todos los equipos
 * terminaron la vuelta. Con alguno en cancha el empate es provisorio: el grupo
 * se ordena por hoyos jugados (convención de board, igual que el individual en
 * `rank-entries.ts`) y comparte la clave de empate → "T". Antes corría a mitad
 * de vuelta con los hoyos sin jugar en 0 y separaba equipos que seguían empatados.
 */
export function rankTeamsWithCountback<T>(
  teams: T[],
  acc: TeamCountbackAccessors<T>,
): EquipoConClaveDeEmpate<T>[] {
  // 0) Un equipo sin ningún hoyo anotado no compite: va al final, en su orden
  //    de llegada y fuera del countback. Misma regla que el path individual
  //    (`rank-entries.ts`, NO_DATA_SORT). Antes su score primario era 0 y
  //    quedaba primero, "E", delante de equipos que sí jugaron (09-nov-2026).
  const sinDatos = teams.filter((t) => acc.holesPlayed(t) === 0)
  const conDatos = teams.filter((t) => acc.holesPlayed(t) > 0)

  // 1) Orden primario (asc con lower_wins, desc con higher_wins); entre empatados,
  //    arriba el que lleva más hoyos. Deja los empatados en posiciones consecutivas.
  const sign = acc.mode === 'higher_wins' ? -1 : 1
  const ordered = [...conDatos].sort(
    (a, b) => (acc.primaryScore(a) - acc.primaryScore(b)) * sign || acc.holesPlayed(b) - acc.holesPlayed(a),
  )

  // 2) Countback dentro de cada grupo de empatados con todas las tarjetas
  //    terminadas. holeCount = nº de hoyos del card (9 o 18) → los segmentos de
  //    back-count se calculan solos.
  const holeCount = ordered.reduce((mx, t) => Math.max(mx, acc.holeScores(t).length), 0)
  const terminado = (t: T) => holeCount > 0 && acc.holesPlayed(t) >= holeCount
  const salida: EquipoConClaveDeEmpate<T>[] = []
  let grupo = 0
  let i = 0
  while (i < ordered.length) {
    let j = i + 1
    while (j < ordered.length && acc.primaryScore(ordered[j]) === acc.primaryScore(ordered[i])) j++
    const empatados = ordered.slice(i, j)
    if (empatados.length > 1 && empatados.every(terminado)) {
      const resueltos = applyCountback(
        empatados.map((t, k) => ({
          id: String(k),
          name: String(k),
          scores: acc.holeScores(t),
          primaryScore: acc.primaryScore(t),
        })),
        acc.mode,
        holeCount,
      )
      for (const r of resueltos) {
        salida.push({ ...empatados[parseInt(r.id, 10)], claveEmpate: `${grupo}#${r.subgrupo}` })
      }
    } else {
      for (const t of empatados) salida.push({ ...t, claveEmpate: `${grupo}#0` })
    }
    grupo++
    i = j
  }

  return [...salida, ...sinDatos.map((t) => ({ ...t, claveEmpate: null }))]
}

/** Lo que cualquier resultado de equipo (scramble, foursome, best ball) trae para su score primario. */
export interface ScoresDeEquipo {
  totalStableford: number
  overUnderNeto: number
  overUnderGross: number
}

/**
 * FUENTE ÚNICA del score con que se ordena y se compara un equipo según formato y modo: puntos en stableford, vs
 * par neto o gross en el resto. La usan los tres formatos (`scorePrimario*`), el podio y la tabla de la ronda libre.
 */
export function scorePrimarioDeEquipo(equipo: ScoresDeEquipo, formato: FormatoJuego, modo: ModoJuego): number {
  if (formato === 'stableford') return equipo.totalStableford
  if (modo === 'neto') return equipo.overUnderNeto
  return equipo.overUnderGross
}
