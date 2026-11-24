/**
 * ¿El scorer de grupo deja de aceptar golpes? Mientras se finaliza (un toque tardío llegaría después del cierre, P0002)
 * y mientras va en vuelo un cambio de quién anota un equipo (`useAnotadorDeEquipo.enCurso`: reclamar, liberar o
 * «Dejar este equipo»): un golpe anotado justo antes de soltar el equipo quedaría pendiente, el servidor lo rechaza
 * (P0003, ya no es tuyo) y se descarta sin aviso.
 */
export function tarjetaCongelada(estado: { finalizing: boolean; anotadorEnCurso: string | null }): boolean {
  return estado.finalizing || estado.anotadorEnCurso != null
}

/**
 * Lo que el scorer de grupo hace con un toque: anotar a un jugador, anotar a un equipo o «Siguiente» (que rellena con
 * par los vacíos del hoyo y avanza). Con la tarjeta congelada (`tarjetaCongelada`) los tres no hacen nada: un par
 * del relleno con «Dejar este equipo» en vuelo quedaría pendiente y el servidor lo rechazaría (P0003) sin aviso.
 * Deslizar entre hoyos no pasa por aquí: solo cambia el hoyo en pantalla, no anota ni rellena.
 */
export function accionesDeLaTarjeta(a: {
  congelada: boolean
  marcarInteraccion: () => void
  anotarJugador: (jugadorId: string, delta: number) => void
  anotarEquipo: (equipoId: string, delta: number) => void
  pasarAlSiguienteHoyo: () => Promise<void>
}): {
  anotar: (jugadorId: string, delta: number) => void
  anotarEquipo: (equipoId: string, delta: number) => void
  siguiente: () => Promise<void>
} {
  return {
    anotar: (jugadorId, delta) => { if (!a.congelada) { a.marcarInteraccion(); a.anotarJugador(jugadorId, delta) } },
    anotarEquipo: (equipoId, delta) => { if (!a.congelada) { a.marcarInteraccion(); a.anotarEquipo(equipoId, delta) } },
    siguiente: async () => { if (!a.congelada) await a.pasarAlSiguienteHoyo() },
  }
}
