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

import { guestIdDePrueba, nuevaPruebaDeInvitado } from '@/lib/guest-identity'

const GUEST_ID_KEY = 'gp_guest_id'
const GUEST_TOKEN_KEY = 'gp_guest_token'
const GUEST_NAME_KEY = 'gp_guest_name'
const GUEST_HANDICAP_KEY = 'gp_guest_handicap'
/** Prueba secreta de la que se deriva el guestId (ver `@/lib/guest-identity`). */
const GUEST_PROOF_KEY = 'gp_guest_proof'

/**
 * Identidad de invitado de este teléfono para inscribirse: la que ya tiene, o una nueva cuyo guestId se
 * deriva de una prueba secreta guardada aquí. La prueba es lo que deja recuperar el token si la respuesta
 * de la inscripción se pierde (sin ella, el reintento duplicaba al jugador). Un guestId anterior a la
 * prueba (aleatorio) se conserva tal cual: puede tener ya un jugador inscrito. Solo en el browser.
 */
export async function obtenerOCrearIdentidadInvitado(): Promise<{ guestId: string; prueba: string | null }> {
  const actual = localStorage.getItem(GUEST_ID_KEY)
  if (actual) {
    const prueba = localStorage.getItem(GUEST_PROOF_KEY)
    return { guestId: actual, prueba: prueba && (await guestIdDePrueba(prueba)) === actual ? prueba : null }
  }
  // Sin Web Crypto (sólo pasa fuera de HTTPS, p. ej. desarrollo por IP de la red): guestId aleatorio sin prueba.
  if (!globalThis.crypto?.subtle) {
    const id = crypto.randomUUID()
    localStorage.setItem(GUEST_ID_KEY, id)
    return { guestId: id, prueba: null }
  }
  const prueba = nuevaPruebaDeInvitado()
  const guestId = await guestIdDePrueba(prueba)
  // La prueba se guarda ANTES de usar el guestId: si la inscripción sale, el teléfono ya puede probarlo.
  localStorage.setItem(GUEST_PROOF_KEY, prueba)
  localStorage.setItem(GUEST_ID_KEY, guestId)
  return { guestId, prueba }
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
  localStorage.removeItem(GUEST_PROOF_KEY)
}

/**
 * ¿Hay una sesión de invitado activa (tiene guestId + guestToken)?
 */
export function hasGuestSession(): boolean {
  return getGuestId() != null && getGuestToken() != null
}
