import { loginUrl } from '@/lib/auth/login-url'
import { PARAM_JUGADOR } from './jugador-del-link'
import { tienePruebaDeInvitado } from '@/lib/guest-session'

export {
  clasificarRespuestaScore, esSinAcceso, STATUS_CON_CODE,
  type LecturaRespuestaScore, type MotivoSinAcceso, type ResultadoGuardadoTorneo,
} from '@/lib/api/respuesta-score'
import type { MotivoSinAcceso } from '@/lib/api/respuesta-score'

export interface AvisoSinAcceso {
  titulo: string
  detalle: string
  cta: string
  href: string
  /**
   * El CTA no navega: recupera el acceso en el lugar (`useRecuperarAccesoInvitado`). `href` queda como la
   * salida si la recuperación falla.
   */
  accion?: 'recuperar_invitado'
}

/**
 * El jugador no tiene tarjeta (`rounds`) en un torneo que recibe golpes: no hay dónde guardar.
 * La pantalla muestra esto EN VEZ de los hoyos. Papel primero: el jugador está en la cancha y
 * los golpes no pueden esperar a que el organizador lo resuelva.
 */
export function avisoSinTarjeta(slug: string): AvisoSinAcceso {
  return {
    titulo: 'Esta tarjeta no está en el torneo',
    // "Avísale al organizador": él puede crearle la tarjeta desde su scorer ("Crear su tarjeta",
    // POST /api/torneos/[slug]/tarjeta). Sin "revise tu inscripción": volver a inscribirse da
    // `already_registered` y no la crea. El caso queda en error_logs.
    detalle: 'Lo que anotes acá no se guardaría. Anota tus golpes en papel y avísale al organizador.',
    cta: 'Ver el torneo',
    href: `/torneo/${slug}`,
  }
}

const EN_EL_TELEFONO = 'Los golpes de esta tarjeta quedaron en este teléfono, no en el torneo.'

/**
 * Qué le decimos al jugador y por dónde sale. Nunca promete "sincronizar" sin decir cuándo.
 *
 * Invitado con la prueba de su identidad (`@/lib/guest-identity`, 18-nov): "Recuperar mi tarjeta" recupera el
 * acceso AHÍ MISMO (`/guest-join` le vuelve a firmar el token del MISMO jugador) y la cola se reenvía. No se
 * le manda a `/unirse`: con el torneo en juego esa pantalla dice "Inscripciones cerradas" y no tiene
 * formulario (Fable #833 v2). Sin prueba se le manda al organizador.
 */
export function avisoSinAcceso(args: {
  slug: string; motivo: MotivoSinAcceso; jugadorId?: string | null
  /** Por defecto lo lee de este teléfono; los tests lo fijan. */
  conPruebaDeInvitado?: boolean
}): AvisoSinAcceso {
  const verTorneo = { cta: 'Ver el torneo', href: `/torneo/${args.slug}` }
  switch (args.motivo) {
    case 'retirado':
      return {
        // Neutro: vale para el retirado (WD) y el descalificado (DQ); el 403 no distingue (Fable #829 v2).
        titulo: 'Ya no compites en este torneo',
        detalle: `El torneo ya no recibe golpes de esta tarjeta. ${EN_EL_TELEFONO} Si es un error, habla con el organizador.`,
        ...verTorneo,
      }
    case 'invitado_sin_acceso':
      if (args.conPruebaDeInvitado ?? tienePruebaDeInvitado()) {
        return {
          titulo: 'Se cortó tu acceso de invitado',
          // Corto (Fable #833 v2): lo que importa es que el botón los recupera aquí mismo.
          detalle: 'Tus golpes quedaron en este teléfono. Recupera tu tarjeta y se envían solos.',
          cta: 'Recuperar mi tarjeta',
          accion: 'recuperar_invitado',
          href: verTorneo.href,
        }
      }
      return {
        titulo: 'Tu acceso de invitado ya no sirve',
        detalle: `${EN_EL_TELEFONO} Muéstrale tu tarjeta al organizador y pídele que los anote.`,
        ...verTorneo,
      }
    case 'sin_permiso':
      return {
        titulo: 'El torneo no aceptó este guardado',
        detalle: `Esta tarjeta no está a tu nombre. ${EN_EL_TELEFONO} Revisa con "Cambiar jugador" o habla con el organizador.`,
        ...verTorneo,
      }
    case 'sin_sesion': {
      // Vuelve a ESTA tarjeta: con el jugador elegido, los golpes se reenvían solos al abrirla.
      const destino = `/torneo/${args.slug}/score${args.jugadorId ? `?${PARAM_JUGADOR}=${encodeURIComponent(args.jugadorId)}` : ''}`
      return {
        // Vale para la sesión vencida y para quien nunca la inició.
        titulo: 'Inicia sesión para guardar',
        detalle: `${EN_EL_TELEFONO} Inicia sesión y vuelve a esta tarjeta: se envían solos.`,
        cta: 'Iniciar sesión',
        href: loginUrl(destino),
      }
    }
  }
}
