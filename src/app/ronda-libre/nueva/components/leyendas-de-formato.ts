import type { ComponentType } from 'react'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { BarChart3, Flag, Handshake, Repeat, Trophy, Users } from '@/components/icons'

/**
 * Cómo se explica cada formato en el asistente: una frase que cambia con el
 * modo, la tabla de puntajes y el criterio de victoria.
 *
 * Declarado como tabla en vez de tres bloques JSX casi idénticos con el mismo
 * markup copiado. Antes sólo tres de los seis formatos tenían explicación —
 * Best Ball, Scramble y Foursome se elegían a ciegas.
 */
export interface LeyendaDeFormato {
  /** Ícono de línea que abre el bloque (DESIGN.md §10: cero emojis en cards). */
  icono: ComponentType<{ size?: number; strokeWidth?: number }>
  /** Frase principal. Recibe el modo porque en neto y gross no se juega igual. */
  explicacion: (modo: ModoJuego) => string
  /** Tabla de puntajes: qué vale cada resultado. */
  marcas: Array<{ label: string; sim: string }>
  /** Cómo se gana. */
  cierre: (modo: ModoJuego) => string
}

const MARCAS_VS_PAR = [
  { label: 'Eagle', sim: '−2' },
  { label: 'Birdie', sim: '−1' },
  { label: 'Par', sim: '0' },
  { label: 'Bogey', sim: '+1' },
  { label: 'Doble+', sim: '+2' },
]

export const LEYENDAS: Partial<Record<FormatoJuego, LeyendaDeFormato>> = {
  stroke_play: {
    icono: Flag,
    explicacion: modo =>
      modo === 'neto'
        ? 'Se cuentan todos los golpes de la ronda. Al final se descuenta el handicap para obtener el score neto.'
        : 'Se cuentan todos los golpes de la ronda, sin descontar handicap.',
    marcas: MARCAS_VS_PAR,
    cierre: modo =>
      modo === 'neto'
        ? 'Gana el jugador con menos golpes tras descontar el handicap.'
        : 'Gana el jugador con menos golpes al terminar la ronda.',
  },

  stableford: {
    icono: BarChart3,
    explicacion: modo =>
      modo === 'neto'
        ? 'Gana quien sume más puntos. Los puntos se calculan sobre tu score neto — el handicap te da strokes en los hoyos más difíciles.'
        : 'Gana quien sume más puntos. Los puntos se calculan sobre tu score bruto — el handicap no entra en juego.',
    marcas: [
      { label: 'Albatross+', sim: '5' },
      { label: 'Eagle', sim: '4' },
      { label: 'Birdie', sim: '3' },
      { label: 'Par', sim: '2' },
      { label: 'Bogey', sim: '1' },
      { label: 'Doble+', sim: '0' },
    ],
    cierre: () => 'Gana el jugador con más puntos al final de la ronda.',
  },

  match_play: {
    icono: Users,
    // Gross es real y libre: decía siempre "se aplica la diferencia de
    // handicap", también al elegir Gross, donde nadie recibe golpes.
    explicacion: modo =>
      modo === 'neto'
        ? 'Hoyo a hoyo, 1 vs 1. Se aplica la diferencia de handicap: el jugador con mayor HCP recibe strokes en los hoyos más difíciles.'
        : 'Hoyo a hoyo, 1 vs 1, sin handicap: gana el hoyo quien lo hace en menos golpes.',
    marcas: [
      { label: 'Ganas hoyo', sim: '+1' },
      { label: 'Empate', sim: '=' },
      { label: 'Pierdes hoyo', sim: '−1' },
    ],
    cierre: () => 'Gana quien cierre el match con más hoyos ganados.',
  },

  best_ball: {
    icono: Trophy,
    explicacion: modo =>
      modo === 'neto'
        ? 'Cada jugador juega su propia bola. En cada hoyo cuenta el mejor score NETO del equipo.'
        : 'Cada jugador juega su propia bola. En cada hoyo cuenta el mejor score bruto del equipo.',
    marcas: MARCAS_VS_PAR,
    cierre: () => 'Gana el equipo con menos golpes sumando su mejor bola de cada hoyo.',
  },

  scramble: {
    icono: Handshake,
    explicacion: () =>
      'Todos tiran, el equipo elige el mejor tiro y todos juegan desde ahí. Se anota un solo score por hoyo.',
    marcas: MARCAS_VS_PAR,
    cierre: () =>
      'Gana el equipo con menos golpes. El handicap del equipo se calcula con la fórmula USGA sobre los índices.',
  },

  foursome: {
    icono: Repeat,
    explicacion: () =>
      'Una sola bola por equipo y tiros alternados: uno sale en los hoyos impares, el otro en los pares.',
    marcas: MARCAS_VS_PAR,
    cierre: () => 'Gana el equipo con menos golpes. Se juega en parejas, exactamente 2 por equipo.',
  },
}
