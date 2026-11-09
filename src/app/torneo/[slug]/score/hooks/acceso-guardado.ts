/**
 * Qué significa la respuesta de `/api/game` (upsert_score) para el scorer del torneo
 * (`/torneo/[slug]/score`) — FUENTE ÚNICA de esa lectura en esta pantalla.
 *
 * 401 (sin sesión: expiró o nunca la hubo) y 403 (token de invitado inválido, jugador retirado
 * o descalificado) NO son un corte de red: reintentar no los arregla y prometer "se sincronizará
 * al recuperar la conexión" es mentira. Hunter 09-nov-2026, en prod, sin sesión: cada golpe
 * disparaba 3 × 401, la pantalla decía "Score guardado localmente. Se sincronizará al recuperar
 * la conexión" y "Reintentando (2)", y al recargar "Sincronizando 2 hoyos..." con el mismo 401,
 * para siempre. El jugador creía que su tarjeta estaba guardada.
 */
import { loginUrl } from '@/lib/auth/login-url'

export type ResultadoGuardadoTorneo = 'ok' | 'closed' | 'inactive' | 'sin_acceso' | 'error'

/**
 * Clasifica el status HTTP (y el `code` del cuerpo de un 409). `reintentar` = fallo transitorio
 * (5xx, red): el scorer reintenta y, si sigue fallando, deja el golpe en cola local.
 */
export function clasificarRespuestaScore(status: number, code?: string | null): ResultadoGuardadoTorneo | 'reintentar' {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 409) return code === 'round_closed' ? 'closed' : 'inactive'
  if (status === 401 || status === 403) return 'sin_acceso'
  return 'reintentar'
}

export interface AvisoSinAcceso {
  titulo: string
  detalle: string
  cta: string
  href: string
}

/**
 * Qué se le dice al jugador cuando el servidor no lo reconoce. Sin promesas de sincronización:
 * la cola local se vacía (nadie la va a poder enviar) y los golpes siguen a la vista en la tarjeta
 * hasta que salga de la pantalla.
 */
export function avisoSinAcceso(args: { esInvitado: boolean; slug: string }): AvisoSinAcceso {
  if (args.esInvitado) {
    return {
      titulo: 'Tu acceso de invitado ya no sirve',
      detalle: 'Los golpes de esta tarjeta no se guardaron en el torneo. Vuelve a entrar desde el link de inscripción del organizador y anótalos de nuevo, o pídele que los anote él.',
      cta: 'Volver a inscribirme',
      href: `/torneo/${args.slug}/unirse`,
    }
  }
  return {
    titulo: 'Tu sesión se cerró',
    detalle: 'Los golpes de esta tarjeta no se guardaron en el torneo. Inicia sesión y anótalos de nuevo.',
    cta: 'Iniciar sesión',
    href: loginUrl(`/torneo/${args.slug}/score`),
  }
}
