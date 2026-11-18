/**
 * Identidad del invitado de torneo con prueba de posesión que no depende de una respuesta del servidor.
 *
 * Por qué existe (18-nov-2026): el `guestToken` lo firma el servidor y llega en la respuesta de
 * `/guest-join`. Si esa respuesta se perdía (señal de la cancha) el jugador quedaba creado con un
 * `guestId` cuyo token el teléfono nunca guardó; el reintento recibía 403 y el cliente se inscribía
 * con un invitado nuevo: dos `players` para la misma persona en el mismo torneo.
 *
 * Ahora el teléfono genera una `prueba` secreta ANTES de inscribirse y su `guestId` es un hash de
 * ella. El servidor no guarda nada: quien manda una prueba cuyo hash es el `guestId` demuestra que
 * es el teléfono que lo creó (conocer el `guestId` no alcanza para obtener la prueba). Con eso el
 * reintento recupera su token en vez de duplicar al jugador.
 *
 * Isomórfico (browser y servidor): usa Web Crypto (`crypto.subtle`), presente en ambos.
 */

/** 32 bytes aleatorios en hex (64 caracteres). */
const PRUEBA_RE = /^[0-9a-f]{64}$/

export function esPruebaDeInvitado(valor: unknown): valor is string {
  return typeof valor === 'string' && PRUEBA_RE.test(valor)
}

export function nuevaPruebaDeInvitado(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

/** `guestId` (formato UUID v4) derivado de la prueba: SHA-256 truncado a 122 bits. */
export async function guestIdDePrueba(prueba: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(prueba))
  const hex = Array.from(new Uint8Array(digest).slice(0, 16), b => b.toString(16).padStart(2, '0')).join('')
  const variante = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variante}${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** ¿La prueba demuestra la posesión de ese guestId? Una prueba mal formada nunca lo hace. */
export async function pruebaDeInvitadoValida(guestId: string, prueba: unknown): Promise<boolean> {
  if (!esPruebaDeInvitado(prueba)) return false
  return (await guestIdDePrueba(prueba)) === guestId.toLowerCase()
}
