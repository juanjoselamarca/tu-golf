/**
 * Cuándo un punto especial marcado a mano vale en un hoyo. Fuente única: el motor (`calcularJuegoPersonalizado`)
 * juzga cada marca con `porQueNoCuenta`, y la UI ofrece un botón solo si `sePuedeOfrecer` (no se muestra algo que
 * el motor va a rechazar). Genérico: depende solo del tipo de punto, los golpes del hoyo y su par.
 */
import type { TipoPuntito } from './config'

/** Puntos que cuentan solo si el jugador hizo par o mejor en el hoyo. */
export const PUNTITOS_CON_PAR_O_MEJOR: readonly TipoPuntito[] = ['sandy', 'greenie']

const NOMBRE_EN_LA_RAZON: Record<TipoPuntito, string> = {
  birdie: 'birdie',
  sandy: 'sandy',
  chipingo: 'chipingo',
  greenie: 'greenie',
  propio: 'punto',
}

/** Si el punto existe en un hoyo de ese par: el greenie solo en un par 3 conocido (sin par, no se finge uno). */
export function seJuegaEnElHoyo(tipo: TipoPuntito, par: number | null | undefined): boolean {
  return tipo !== 'greenie' || par === 3
}

export type MotivoNoCuenta = 'no_jugo' | 'no_se_juega_en_el_hoyo' | 'sobre_par'

/**
 * Por qué una marca no vale, o `null` si vale. `gross`: golpes del jugador en el hoyo (`null`/`undefined` = no
 * anotó o no jugó). Con `par` desconocido no se juzga el "par o mejor".
 */
export function porQueNoCuenta(
  tipo: TipoPuntito,
  gross: number | null | undefined,
  par: number | null | undefined,
): { motivo: MotivoNoCuenta; razon: string } | null {
  if (typeof gross !== 'number' || !(gross > 0)) return { motivo: 'no_jugo', razon: 'No jugó el hoyo' }
  if (!seJuegaEnElHoyo(tipo, par)) return { motivo: 'no_se_juega_en_el_hoyo', razon: `El ${NOMBRE_EN_LA_RAZON[tipo]} es solo en par 3` }
  if (PUNTITOS_CON_PAR_O_MEJOR.includes(tipo) && typeof par === 'number' && gross > par) {
    return { motivo: 'sobre_par', razon: `El ${NOMBRE_EN_LA_RAZON[tipo]} cuenta solo con par o mejor` }
  }
  return null
}

/**
 * Si tiene sentido ofrecer el botón en el hoyo: lo que el motor contaría. Los puntos que no dependen del score
 * (chipingo, propios) se ofrecen aunque todavía no se anoten los golpes.
 */
export function sePuedeOfrecer(tipo: TipoPuntito, gross: number | null | undefined, par: number | null | undefined): boolean {
  const motivo = porQueNoCuenta(tipo, gross, par)?.motivo
  return !motivo || (motivo === 'no_jugo' && !PUNTITOS_CON_PAR_O_MEJOR.includes(tipo) && seJuegaEnElHoyo(tipo, par))
}
