/**
 * Sesión liviana para jugadores invitados (sin cuenta Supabase).
 *
 * El guest scoring permite que un jugador entre a un torneo sin registrarse:
 * escanea el QR, pone su nombre y empieza a scorear. Al final de la ronda se le
 * ofrece crear cuenta para guardar su historial.
 *
 * El `guestId` es un UUID persistido en localStorage que identifica al dispositivo
 * del invitado. Se usa como `pending_user_id` en la tabla `players` — el mismo
 * patrón que los invitados del organizador.
 *
 * El `guestToken` es un HMAC del guestId firmado por el server con un secret.
 * Se guarda en localStorage y se envía como header `x-guest-token` en cada request
 * al game API. Sin él, cualquiera que conozca un guestId podría scorear como otro
 * invitado.
 */

const GUEST_ID_KEY = 'gp_guest_id'
const GUEST_TOKEN_KEY = 'gp_guest_token'
const GUEST_NAME_KEY = 'gp_guest_name'
const GUEST_HANDICAP_KEY = 'gp_guest_handicap'

/**
 * Obtiene o crea un ID de invitado (UUID v4 persistido en localStorage).
 * Solo ejecutar en el browser.
 */
export function getOrCreateGuestId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(GUEST_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(GUEST_ID_KEY, id)
  }
  return id
}

export function getGuestId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(GUEST_ID_KEY)
}

export function getGuestToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(GUEST_TOKEN_KEY)
}

export function setGuestToken(token: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(GUEST_TOKEN_KEY, token)
}

export function getGuestName(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(GUEST_NAME_KEY)
}

export function setGuestName(name: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(GUEST_NAME_KEY, name)
}

export function getGuestHandicap(): number | null {
  if (typeof window === 'undefined') return null
  const raw = localStorage.getItem(GUEST_HANDICAP_KEY)
  if (raw == null) return null
  const n = parseFloat(raw)
  return isNaN(n) ? null : n
}

export function setGuestHandicap(handicap: number | null): void {
  if (typeof window === 'undefined') return
  if (handicap == null) {
    localStorage.removeItem(GUEST_HANDICAP_KEY)
  } else {
    localStorage.setItem(GUEST_HANDICAP_KEY, String(handicap))
  }
}

/**
 * Limpia TODOS los datos de sesión de invitado. Llamar cuando el invitado
 * crea una cuenta y sus datos se migran a su perfil autenticado.
 */
export function clearGuestSession(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(GUEST_ID_KEY)
  localStorage.removeItem(GUEST_TOKEN_KEY)
  localStorage.removeItem(GUEST_NAME_KEY)
  localStorage.removeItem(GUEST_HANDICAP_KEY)
}

/**
 * ¿Hay una sesión de invitado activa (tiene guestId + guestToken)?
 */
export function hasGuestSession(): boolean {
  return getGuestId() != null && getGuestToken() != null
}
