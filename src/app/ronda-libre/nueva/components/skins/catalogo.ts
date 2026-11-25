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

/** Explicación de cada perilla, en una línea. */
export const NOTA_SKINS = {
  hoyos: 'Se cambian en el paso Cancha.',
  neto: 'El más bajo juega a 0 y el resto recibe la diferencia.',
  gross: 'Sin hándicap: gana el menor número de golpes.',
  hcpPct: 'Porcentaje del hándicap de juego de cada uno.',
  pozo: 'Lo que pone cada uno. 0 = solo skins, sin plata.',
  empate: 'Repartir: el valor se divide entre los empatados.',
  validacion: 'Un hoyo con arrastre se cobra solo con par neto o mejor en el hoyo siguiente.',
  puntos: 'Cada uno vale 1 skin del mismo pozo.',
} as const
