import { loginUrl } from '@/lib/auth/login-url'

/**
 * El aviso de "se cerró la sesión" en plena ronda — FUENTE ÚNICA para los scorers.
 *
 * Cuándo: el servidor rechazó un guardado y el teléfono ya no tiene sesión (expiró o se cerró desde otro
 * dispositivo), habiendo entrado al abrir el scorer. No es un problema de permisos: a quien ES el jugador no se
 * le dice "No puedes anotar esta tarjeta". Los golpes quedan en el respaldo local y el scorer los reenvía solo
 * al volver a la tarjeta con la sesión.
 *
 * Es un aviso persistente con salida (no un toast que desaparece ni una redirección sola: el jugador puede
 * seguir anotando el hoyo y entrar cuando quiera). `volverA` es la tarjeta a la que vuelve el login.
 */
export interface AvisoSesionCerrada {
  titulo: string
  detalle: string
  cta: string
  href: string
}

export function avisoSesionCerrada(volverA: string): AvisoSesionCerrada {
  return {
    titulo: 'Tu sesión se cerró',
    detalle: 'Tus golpes quedaron en este teléfono. Inicia sesión y vuelves a esta tarjeta: se suben solos.',
    cta: 'Iniciar sesión',
    href: loginUrl(volverA),
  }
}
