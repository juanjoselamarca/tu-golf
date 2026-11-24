/**
 * ¿El scorer de grupo deja de aceptar golpes? Mientras se finaliza (un toque tardío llegaría después del cierre, P0002)
 * y mientras va en vuelo un cambio de quién anota un equipo (`useAnotadorDeEquipo.enCurso`: reclamar, liberar o
 * «Dejar este equipo»): un golpe anotado justo antes de soltar el equipo quedaría pendiente, el servidor lo rechaza
 * (P0003, ya no es tuyo) y se descarta sin aviso.
 */
export function tarjetaCongelada(estado: { finalizing: boolean; anotadorEnCurso: string | null }): boolean {
  return estado.finalizing || estado.anotadorEnCurso != null
}
