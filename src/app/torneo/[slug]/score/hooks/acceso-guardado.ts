import { loginUrl } from '@/lib/auth/login-url'

/**
 * Lectura de la respuesta de `/api/game` (`upsert_score`) en el scorer del torneo.
 * Fuente única: la pantalla no vuelve a mirar `res.status` por su cuenta.
 *
 * - `ok`           2xx: guardado.
 * - `closed`       409 `round_closed`: la ronda se cerró mientras se anotaba.
 * - `inactive`     409 (otro `code`): el torneo ya no acepta scores.
 * - `sin_sesion`   401: el servidor no reconoce al jugador (sesión vencida, link abierto
 *                  en otro teléfono, invitado que borró datos). Reintentar no cambia nada.
 * - `sin_permiso`  403: hay identidad pero la tarjeta no es suya, se retiró, o el token de
 *                  invitado no vale. Tampoco se reintenta.
 * - `reintentar`   red, 5xx, 429: puede pasar; aplica la cola local de siempre.
 *
 * Con `sin_sesion`/`sin_permiso` la cola local NO se vacía: un 401/403 también puede ser
 * pasajero (Supabase lento o caído, como el 04-oct-2026), y lo anotado tiene que seguir en
 * el teléfono para reenviarse solo cuando el jugador vuelva a entrar.
 */
export type ResultadoGuardadoTorneo = 'ok' | 'closed' | 'inactive' | 'sin_sesion' | 'sin_permiso' | 'error'
export type MotivoSinAcceso = Extract<ResultadoGuardadoTorneo, 'sin_sesion' | 'sin_permiso'>

export function clasificarRespuestaScore(status: number, code?: string | null): ResultadoGuardadoTorneo | 'reintentar' {
  if (status >= 200 && status < 300) return 'ok'
  if (status === 409) return code === 'round_closed' ? 'closed' : 'inactive'
  if (status === 401) return 'sin_sesion'
  if (status === 403) return 'sin_permiso'
  return 'reintentar'
}

export function esSinAcceso(r: ResultadoGuardadoTorneo | 'reintentar'): r is MotivoSinAcceso {
  return r === 'sin_sesion' || r === 'sin_permiso'
}

export interface AvisoSinAcceso {
  titulo: string
  detalle: string
  cta: string
  href: string
}

const EN_EL_TELEFONO = 'Los golpes de esta tarjeta quedaron en este teléfono, no en el torneo.'

/** Qué le decimos al jugador y por dónde sale. Nunca promete "sincronizar" sin decir cuándo. */
export function avisoSinAcceso(args: { esInvitado: boolean; slug: string; motivo: MotivoSinAcceso }): AvisoSinAcceso {
  if (args.esInvitado) {
    return {
      titulo: 'Tu acceso de invitado ya no sirve',
      detalle: `${EN_EL_TELEFONO} Vuelve a entrar desde el link de inscripción del organizador; si no aparecen, pídele que los anote él.`,
      cta: 'Volver a inscribirme',
      href: `/torneo/${args.slug}/unirse`,
    }
  }
  if (args.motivo === 'sin_permiso') {
    return {
      titulo: 'El torneo no aceptó este guardado',
      detalle: `Esta tarjeta no está a tu nombre o ya no estás inscrito. ${EN_EL_TELEFONO} Revisa con "Cambiar jugador" o habla con el organizador.`,
      cta: 'Ver el torneo',
      href: `/torneo/${args.slug}`,
    }
  }
  return {
    titulo: 'Tu sesión se cerró',
    detalle: `${EN_EL_TELEFONO} Inicia sesión y vuelve a esta tarjeta: se envían solos.`,
    cta: 'Iniciar sesión',
    href: loginUrl(`/torneo/${args.slug}/score`),
  }
}
