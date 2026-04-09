/**
 * Reglas universales de golf — types y utilidades base.
 * Fuente de verdad para ModoJuego, FormatoJuego, labels y formateo.
 */

/** Lente de scoring: cómo se calculan los puntos */
export type ModoJuego = 'gross' | 'neto' | 'stableford' | 'match_play_neto'

/**
 * Estructura de competencia: cómo se organiza el juego.
 * Eje ortogonal a ModoJuego — cada FormatoJuego puede combinarse
 * con distintos ModoJuego según las reglas.
 */
export type FormatoJuego =
  | 'stroke_play'   // Individual: menor total de golpes
  | 'stableford'    // Individual: mayor total de puntos Stableford
  | 'match_play'    // Head-to-head: hoyo a hoyo
  | 'best_ball'     // Equipo: mejor bola individual por hoyo
  | 'scramble'      // Equipo: mejor tiro, todos juegan desde ahí
  | 'foursome'      // Equipo: tiros alternados, una bola por equipo

export type FormatCategory = 'individual' | 'head_to_head' | 'team'

/** Metadata de cada formato para validación y UI */
export const FORMAT_META: Record<FormatoJuego, {
  category: FormatCategory
  label: string
  description: string
  requiereEquipos: boolean
  requiereParejas: boolean
  jugadoresPorEquipo: { min: number; max: number } | null
  modosPermitidos: ModoJuego[]
}> = {
  stroke_play: {
    category: 'individual',
    label: 'Stroke Play',
    description: 'Gana el jugador con menos golpes totales',
    requiereEquipos: false,
    requiereParejas: false,
    jugadoresPorEquipo: null,
    modosPermitidos: ['gross', 'neto'],
  },
  stableford: {
    category: 'individual',
    label: 'Stableford',
    description: 'Gana el jugador con más puntos Stableford',
    requiereEquipos: false,
    requiereParejas: false,
    jugadoresPorEquipo: null,
    modosPermitidos: ['stableford'],
  },
  match_play: {
    category: 'head_to_head',
    label: 'Match Play',
    description: 'Hoyo a hoyo — gana quien gane más hoyos',
    requiereEquipos: false,
    requiereParejas: true,
    jugadoresPorEquipo: null,
    modosPermitidos: ['gross', 'neto', 'match_play_neto'],
  },
  best_ball: {
    category: 'team',
    label: 'Best Ball',
    description: 'Equipo: cuenta el mejor score individual por hoyo',
    requiereEquipos: true,
    requiereParejas: false,
    jugadoresPorEquipo: { min: 2, max: 4 },
    modosPermitidos: ['gross', 'neto', 'stableford'],
  },
  scramble: {
    category: 'team',
    label: 'Scramble',
    description: 'Equipo: todos tiran, eligen el mejor y juegan desde ahí',
    requiereEquipos: true,
    requiereParejas: false,
    jugadoresPorEquipo: { min: 2, max: 4 },
    modosPermitidos: ['gross', 'neto', 'stableford'],
  },
  foursome: {
    category: 'team',
    label: 'Foursome',
    description: 'Equipo de 2: tiros alternados, una bola',
    requiereEquipos: true,
    requiereParejas: false,
    jugadoresPorEquipo: { min: 2, max: 2 },
    modosPermitidos: ['gross', 'neto'],
  },
}

/** Label textual de un resultado vs par */
export function labelResultado(overUnder: number): string {
  if (overUnder <= -3) return 'albatros'
  if (overUnder === -2) return 'eagle'
  if (overUnder === -1) return 'birdie'
  if (overUnder === 0)  return 'par'
  if (overUnder === 1)  return 'bogey'
  if (overUnder === 2)  return 'doble'
  return 'triple+'
}

/** Formatear over/under: 0 → "E", +3 → "+3", -2 → "-2" */
export function formatOverUnder(n: number): string {
  if (n === 0) return 'E'
  return n > 0 ? `+${n}` : String(n)
}
