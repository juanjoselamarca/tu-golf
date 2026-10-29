/**
 * Leer una escena de RRSS con el MOTOR de golf, no con aritmética escrita a
 * mano en el test.
 *
 * Vive acá y no dentro de un `.test.ts` porque dos archivos la necesitan: el
 * que verifica que la escena cuente la historia que dice contar
 * (`rrss-escenas.test.ts`) y el que verifica que los SUBTÍTULOS quemados en el
 * video afirmen los mismos números (`rrss-subtitulos.test.ts`). Dos copias de
 * `courseHcp` serían dos verdades sobre el mismo hándicap, que es justo lo que
 * la pieza no se puede permitir.
 */
import { expect } from 'vitest'
// Módulo .mjs compartido con los scripts de captura.
import { teeDeJugador } from '../../../scripts/rrss/escenas.mjs'
import { resolverHandicapDeJuego } from '@/golf/core/playing-handicap'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'

export interface HoyoDeclarado {
  par: number
  si: number
}
export interface TeeDeclarado {
  genero: string
  rating: number
  slope: number
  par: number
}
export interface JugadorDeEscena {
  nombre: string
  handicap: number
  tee?: string
  golpes: number[]
}
export interface Escena {
  codigo: string
  tee: string
  holes: number
  hcp_pct: number
  modo_juego: string
  formato_juego: string
  hoyos_jugados: number[]
  /** Gesto del reel 1: anotar un golpe. */
  hoyo_del_gesto?: number
  golpes_del_gesto?: number
  /** Gesto del reel 2: abrir tarjetas, por nombre de jugador. */
  tarjetas_del_gesto?: string[]
  /** Lo que se quema en pantalla, anclado a notas de fotograma. */
  subtitulos?: Array<{ nota: string; texto: string | null }>
  catalogo: { nombre: string; hoyos: HoyoDeclarado[]; tees: Record<string, TeeDeclarado> }
  jugadores: JugadorDeEscena[]
}

/**
 * El hándicap que PUNTÚA, con la misma llamada que hace el scorer:
 * `courseHandicapsDeRonda` → `resolverHandicapDeJuego(index, courseData, holes, hcpPct)`.
 * De ahí salen `holes` y `hcp_pct` de la escena y no un 18/100 escrito acá:
 * los mismos valores que `escena.mjs` inserta en la ronda.
 */
export function courseHcp(escena: Escena, j: JugadorDeEscena): number {
  const tee = escena.catalogo.tees[teeDeJugador(escena, j)]
  expect(tee, `la escena no declara el tee "${teeDeJugador(escena, j)}"`).toBeTruthy()
  return resolverHandicapDeJuego(
    j.handicap,
    { slope: tee.slope, courseRating: tee.rating, par: tee.par },
    escena.holes,
    escena.hcp_pct,
  )
}

/** Neto contra el par de los hoyos que lleva jugados (lo que muestra el board). */
export function netoVsPar(
  escena: Escena,
  j: JugadorDeEscena,
  hoyos: number[],
  golpes: number[],
): number {
  const ch = courseHcp(escena, j)
  let total = 0
  hoyos.forEach((numero, i) => {
    const hoyo = escena.catalogo.hoyos[numero - 1]
    total += golpes[i] - strokesRecibidosEnHoyo(ch, hoyo.si, escena.holes) - hoyo.par
  })
  return total
}

/** El orden del leaderboard: neto contra par, de menor a mayor. */
export function orden(netos: Array<{ nombre: string; neto: number }>): string[] {
  return [...netos].sort((a, b) => a.neto - b.neto).map((n) => n.nombre)
}

/** Bruto contra el par de los hoyos jugados: el número "Gross" de la fila. */
export function brutoVsPar(escena: Escena, hoyos: number[], golpes: number[]): number {
  return hoyos.reduce((t, numero, i) => t + golpes[i] - escena.catalogo.hoyos[numero - 1].par, 0)
}

/** Nadie empatado: un empate en el video no se lee. */
export function sinEmpates(valores: number[]): void {
  expect(new Set(valores).size).toBe(valores.length)
}
