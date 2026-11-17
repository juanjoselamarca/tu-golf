import { loginUrl } from '@/lib/auth/login-url'

/**
 * El aviso de "hay que iniciar sesión para que se guarde" en plena ronda — FUENTE ÚNICA para los scorers.
 *
 * Cuándo: el servidor rechazó un guardado y el teléfono no tiene sesión. No es un problema de permisos: a quien
 * ES el jugador no se le dice "No puedes anotar esta tarjeta". Los golpes quedan en el respaldo local y el scorer
 * los reenvía solo al volver con la sesión.
 *
 * - `habiaSesion: true`  → entró al abrir el scorer y la perdió (expiró o se cerró en otro dispositivo):
 *                          "Tu sesión se cerró".
 * - `habiaSesion: false` → no se sabe si la tuvo (la página abrió ya sin sesión: iOS descartó la PWA, link
 *                          abierto sin entrar): "Inicia sesión para guardar", el mismo título del scorer de torneo
 *                          (#754), que vale para los dos casos.
 *
 * Es un aviso persistente con salida (no un toast que desaparece ni una redirección sola: el jugador puede
 * seguir anotando y entrar cuando quiera). `volverA` es la tarjeta a la que vuelve el login.
 */
export interface AvisoSesionCerrada {
  titulo: string
  detalle: string
  cta: string
  href: string
}

export function avisoSesionCerrada(volverA: string, { habiaSesion }: { habiaSesion: boolean }): AvisoSesionCerrada {
  return {
    titulo: habiaSesion ? 'Tu sesión se cerró' : 'Inicia sesión para guardar',
    detalle: 'Tus golpes quedaron en este teléfono. Inicia sesión y vuelves a esta tarjeta: se suben solos.',
    cta: 'Iniciar sesión',
    href: loginUrl(volverA),
  }
}

/** Finalizar sin sesión: el cierre no sale y el aviso fijo ya está; esto lo dice en el momento del toque. */
export const AVISO_FINALIZAR_SIN_SESION = {
  title: 'Tu sesión se cerró',
  message: 'Inicia sesión para finalizar. Tus golpes quedaron en este teléfono.',
} as const
