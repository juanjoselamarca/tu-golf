/**
 * `code` de las respuestas 403 de `/api/game` (`upsert_score`). Fuente única: la ruta los emite y el
 * scorer del torneo los lee (`clasificarRespuestaScore`) para decir al jugador qué pasó y por dónde sale.
 *
 * - `player_withdrawn`: el jugador está retirado o descalificado. Reinscribirse no corresponde.
 * - `guest_token_invalid`: el token de invitado no verifica (acceso de invitado roto).
 * - `guest_not_owner`: el token verifica, pero la tarjeta es de otro jugador (eligió mal en "¿Quién
 *   eres?", o un guestId viejo en un teléfono que hoy anota con cuenta).
 * Con los dos, el scorer reintenta UNA vez sin headers de invitado antes de rendirse.
 */
export const CODIGO_JUGADOR_RETIRADO = 'player_withdrawn'
export const CODIGO_INVITADO_NO_DUENO = 'guest_not_owner'
export const CODIGO_TOKEN_INVITADO_INVALIDO = 'guest_token_invalid'
