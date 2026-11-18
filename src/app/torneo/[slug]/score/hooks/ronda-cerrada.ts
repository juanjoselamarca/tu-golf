import { jugadorFueraDelTorneo } from '@/golf/tournament-status'

/**
 * Qué dice el aviso de "Ronda N cerrada" del scorer del jugador:
 * - `retirado`: WD/DQ. No va a recibir la tarjeta de la ronda siguiente; prometerle "aparece acá sola" era falso.
 * - `sin_sesion`: la ronda siguiente ya está abierta y la ruta respondió 401; la salida es iniciar sesión.
 * - `espera`: aparece sola cuando el organizador abra la siguiente.
 */
export type AvisoRondaCerrada = 'retirado' | 'sin_sesion' | 'espera'

export function avisoRondaCerrada(args: { status: string | null | undefined; rondaSiguienteSinSesion: boolean }): AvisoRondaCerrada {
  if (jugadorFueraDelTorneo(args.status)) return 'retirado'
  return args.rondaSiguienteSinSesion ? 'sin_sesion' : 'espera'
}

/**
 * ¿El sondeo del roster tiene algo que esperar? Una tarjeta cerrada con ronda siguiente por abrir, o un jugador
 * sin tarjeta, en un torneo activo. Un retirado/descalificado no recibe tarjeta en ninguna ronda: no se relee.
 */
export function sondeoActivo(args: {
  esperaRondaSiguiente: boolean
  sinTarjeta: boolean
  torneoInactivo: boolean
  status: string | null | undefined
}): boolean {
  return (args.esperaRondaSiguiente || args.sinTarjeta) && !args.torneoInactivo && !jugadorFueraDelTorneo(args.status)
}
