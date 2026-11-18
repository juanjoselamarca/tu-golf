// FUENTE ÚNICA de cómo se lee la respuesta de `/api/game` (`upsert_score`). La usan el scorer del jugador
// (`useGuardadoTorneo`) y el del organizador (`estado-hoyos`): ninguna pantalla vuelve a mirar `res.status`
// por su cuenta.

import { CODIGO_INVITADO_NO_DUENO, CODIGO_JUGADOR_RETIRADO, CODIGO_TOKEN_INVITADO_INVALIDO } from '@/lib/api/codigos-game'

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
 * - `invitado_token_invalido` 403 `guest_token_invalid`: el token de invitado no verifica.
 * - `invitado_no_dueno`   403 `guest_not_owner`: token sano, pero la tarjeta es de otro jugador.
 *                         Ninguno de los dos es final: `enviarHoyo` reintenta UNA vez sin headers de
 *                         invitado (un teléfono con un guestId viejo que hoy anota con cuenta).
 * - `invitado_sin_acceso` token roto y, sin headers, tampoco hay sesión.
 *                         (Tarjeta ajena y sin sesión es `sin_permiso`: el acceso sirve, la tarjeta no.)
 * - `sin_permiso`         403 (otro): hay identidad pero la tarjeta no es suya.
 * - `reintentar`          red, 5xx, 429: puede pasar; aplica la cola local de siempre.
 *
 * Con los motivos "sin acceso" la cola local NO se vacía: lo anotado sigue en el teléfono y se
 * reenvía solo cuando el jugador vuelve a abrir la tarjeta con acceso.
 */
export type MotivoSinAcceso = 'sin_sesion' | 'sin_permiso' | 'retirado' | 'invitado_sin_acceso'
export type ResultadoGuardadoTorneo = 'ok' | 'closed' | 'inactive' | MotivoSinAcceso | 'error'
/**
 * `descartado`: el servidor respondió ok pero NO aplicó este envío porque este dispositivo ya guardó algo más nuevo
 * en el hoyo (`guardar_hole_score`). El valor de este envío no es el que quedó: no se marca como confirmado.
 */
export type LecturaRespuestaScore = ResultadoGuardadoTorneo | 'descartado' | 'invitado_no_dueno' | 'invitado_token_invalido' | 'reintentar'

const MOTIVOS_SIN_ACCESO: readonly MotivoSinAcceso[] = ['sin_sesion', 'sin_permiso', 'retirado', 'invitado_sin_acceso']

export function clasificarRespuestaScore(status: number, code?: string | null, descartado = false): LecturaRespuestaScore {
  if (status >= 200 && status < 300) return descartado ? 'descartado' : 'ok'
  if (status === 409) return code === 'round_closed' ? 'closed' : 'inactive'
  if (status === 401) return 'sin_sesion'
  if (status === 403) {
    if (code === CODIGO_JUGADOR_RETIRADO) return 'retirado'
    if (code === CODIGO_INVITADO_NO_DUENO) return 'invitado_no_dueno'
    if (code === CODIGO_TOKEN_INVITADO_INVALIDO) return 'invitado_token_invalido'
    return 'sin_permiso'
  }
  return 'reintentar'
}

/** Status cuyo cuerpo trae un `code` que cambia la lectura. */
export const STATUS_CON_CODE: readonly number[] = [403, 409]

export function esSinAcceso(r: LecturaRespuestaScore): r is MotivoSinAcceso {
  return (MOTIVOS_SIN_ACCESO as readonly string[]).includes(r)
}

/**
 * Rechazo de un hoyo que reintentar NO arregla y que el organizador puede descartar (volver a lo guardado): tarjeta
 * cerrada, torneo inactivo, jugador retirado o datos que el servidor no acepta (`datos`: 400/404, ver abajo).
 * `sin_sesion` y `sin_permiso` no: su salida es volver a entrar o reintentar, y descartar perdería el golpe.
 */
const MOTIVOS_PERMANENTES: readonly string[] = ['closed', 'inactive', 'retirado', 'datos']

export function esRechazoPermanente(motivo: string | null | undefined): boolean {
  return motivo != null && MOTIVOS_PERMANENTES.includes(motivo)
}

/**
 * Rechazo por los DATOS del envío: el servidor lo leyó y no lo acepta (400 validación, 404 ronda que no existe).
 * Reenviar lo mismo da lo mismo. `clasificarRespuestaScore` los deja en `reintentar` (el scorer del jugador
 * los trata como fallo transitorio); el del organizador los muestra como rechazo del hoyo.
 */
export function esRechazoDeDatos(status: number): boolean {
  return status === 400 || status === 404
}
