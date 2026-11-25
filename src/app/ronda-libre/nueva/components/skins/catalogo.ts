/**
 * Copy de Skins en el asistente de Nueva Ronda (fuente única para la fila, el banner y el panel). Reglas:
 * docs/specs/formato-skins.md.
 */
import { NOMBRE_FORMATO_SKINS } from '@/golf/formats/skins/clave'

export const TITULO_SKINS = NOMBRE_FORMATO_SKINS
export const SUBTITULO_SKINS = 'Cada hoyo vale un skin. Lo gana quien lo hace solo.'

/** Cómo se juega, en cuatro líneas (banner de la "i"). */
export const COMO_SE_JUEGA_SKINS: readonly string[] = [
  'Cada hoyo vale un skin: lo gana el mejor score del hoyo, solo.',
  'Si empatan, nadie lo gana y el skin se suma al hoyo siguiente.',
  'Con pozo, la plata se reparte por skins ganados.',
  'Neto o gross, en 18 o 9 hoyos. Se anota en un solo celular.',
]

/** Explicación de cada perilla, en una línea. Las que dependen del modo o del pozo son funciones. */
export const NOTA_SKINS = {
  hoyos: 'Se cambian en el paso Cancha.',
  neto: 'El más bajo juega a 0 y el resto recibe la diferencia.',
  gross: 'Sin hándicap: gana el menor número de golpes.',
  // WHS: hándicap de juego = hándicap de cancha × %.
  hcpPct: 'Se aplica al hándicap de cancha y da el hándicap de juego.',
  pozo: 'Lo que pone cada uno. 0 = solo skins, sin plata.',
  empate: 'Repartir: el valor se divide entre los empatados.',
  validacion: (neto: boolean) =>
    `Un hoyo con arrastre se cobra solo si su ganador hace ${neto ? 'par neto' : 'par'} o mejor en el siguiente.`,
  puntos: (conPozo: boolean) => (conPozo ? 'Cada uno vale 1 skin del pozo.' : 'Cada uno vale 1 skin.'),
} as const
