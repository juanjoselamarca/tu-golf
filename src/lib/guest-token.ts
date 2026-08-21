/**
 * Generación y verificación de tokens de invitado (server-side).
 *
 * Un guest token es un HMAC-SHA256 del `guestId` (pending_user_id del jugador)
 * firmado con un secreto derivado del service role key. El invitado lo guarda
 * en localStorage y lo envía como header `x-guest-token` en cada request de
 * scoring. El server verifica que el token corresponda al guestId declarado.
 *
 * Esto evita que alguien que conozca un guestId (visible en la URL o en la
 * tabla players) pueda scorear como otro invitado.
 */

import { createHmac } from 'crypto'

const GUEST_SIGNING_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

/**
 * Genera un token HMAC para un guestId dado. Solo server-side.
 */
export function signGuestToken(guestId: string): string {
  return createHmac('sha256', `guest-scoring:${GUEST_SIGNING_SECRET}`)
    .update(guestId)
    .digest('hex')
}

/**
 * Verifica que el token corresponda al guestId. Solo server-side.
 * Retorna true si el token es válido.
 */
export function verifyGuestToken(guestId: string, token: string): boolean {
  if (!guestId || !token || !GUEST_SIGNING_SECRET) return false
  const expected = signGuestToken(guestId)
  // Comparación de tiempo constante para evitar timing attacks
  if (expected.length !== token.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i)
  }
  return diff === 0
}
