import { loginUrl } from '@/lib/auth/login-url'
import { CODIGO_INVITADO_NO_DUENO, CODIGO_JUGADOR_RETIRADO } from '@/lib/api/codigos-game'

/**
 * Lectura de la respuesta de `/api/game` (`upsert_score`) en el scorer del torneo.
 * Fuente única: la pantalla no vuelve a mirar `res.status` por su cuenta.
 *
 * - `ok`                  2xx: guardado.
 * - `closed`              409 `round_closed`: la ronda se cerró mientras se anotaba.
 * - `inactive`            409 (otro `code`): el torneo ya no acepta scores.
 * - `sin_sesion`          401: el servidor no reconoce a nadie (sesión vencida o nunca iniciada).
 *                         `/api/game` sólo responde 401 sin identidad: Auth caído es 503.
 * - `retirado`            403 `player_withdrawn`: el jugador está retirado o descalificado.
 * - `invitado_no_dueno`   403 `guest_not_owner`: los headers de invitado no son dueños de la tarjeta.
 *                         No es final: `enviarHoyo` reintenta UNA vez sin headers de invitado
 *                         (un teléfono con un guestId viejo que hoy anota con cuenta).
 * - `invitado_sin_acceso` lo que queda de lo anterior si sin headers tampoco hay sesión.
 * - `sin_permiso`         403 (otro): hay identidad pero la tarjeta no es suya.
 * - `reintentar`          red, 5xx, 429: puede pasar; aplica la cola local de siempre.
 *
 * Con los motivos "sin acceso" la cola local NO se vacía: lo anotado sigue en el teléfono y se
 * reenvía solo cuando el jugador vuelve a abrir la tarjeta con acceso.
 */
export type MotivoSinAcceso = 'sin_sesion' | 'sin_permiso' | 'retirado' | 'invitado_sin_acceso'
export type ResultadoGuardadoTorneo = 'ok' | 'closed' | 'inactive' | MotivoSinAcceso | 'error'
export type LecturaRespuestaScore = ResultadoGuardadoTorneo | 'invitado_no_dueno' | 'reintentar'

const MOTIVOS_SIN_ACCESO: readonly MotivoSinAcceso[] = ['sin_sesion', 'sin_permiso', 'retirado', 'invitado_sin_acceso']

export function clasificarRespuestaScore(status: number, code?: string | null): LecturaRespuestaScore {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 409) return code === 'round_closed' ? 'closed' : 'inactive'
  if (status === 401) return 'sin_sesion'
  if (status === 403) {
    if (code === CODIGO_JUGADOR_RETIRADO) return 'retirado'
    if (code === CODIGO_INVITADO_NO_DUENO) return 'invitado_no_dueno'
    return 'sin_permiso'
  }
  return 'reintentar'
}

/** Status cuyo cuerpo trae un `code` que cambia la lectura. */
export const STATUS_CON_CODE: readonly number[] = [403, 409]

export function esSinAcceso(r: LecturaRespuestaScore): r is MotivoSinAcceso {
  return (MOTIVOS_SIN_ACCESO as readonly string[]).includes(r)
}

export interface AvisoSinAcceso {
  titulo: string
  detalle: string
  cta: string
  href: string
}

const EN_EL_TELEFONO = 'Los golpes de esta tarjeta quedaron en este teléfono, no en el torneo.'

/**
 * Qué le decimos al jugador y por dónde sale. Nunca promete "sincronizar" sin decir cuándo, y
 * nunca manda a reinscribirse: con el acceso de invitado roto, `/unirse` crea OTRO jugador
 * (nuevo guestId) y el organizador ve la tarjeta duplicada.
 */
export function avisoSinAcceso(args: { slug: string; motivo: MotivoSinAcceso; jugadorId?: string | null }): AvisoSinAcceso {
  const verTorneo = { cta: 'Ver el torneo', href: `/torneo/${args.slug}` }
  switch (args.motivo) {
    case 'retirado':
      return {
        titulo: 'Estás retirado de este torneo',
        detalle: `El torneo ya no recibe golpes de esta tarjeta. ${EN_EL_TELEFONO} Si es un error, habla con el organizador.`,
        ...verTorneo,
      }
    case 'invitado_sin_acceso':
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
      const destino = `/torneo/${args.slug}/score${args.jugadorId ? `?jugador=${encodeURIComponent(args.jugadorId)}` : ''}`
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
