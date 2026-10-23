// Clave de las cuentas que crean los scripts de seed (demo y prueba).
//
// Incidente 23-oct-2026: los seeds traían la clave literal (`demo-golfers-2026`,
// `test-golfers-2026`) y el repo es público. Las 14 cuentas existían en prod con esa
// clave, una de ellas con rol admin, y cualquiera podía entrar. Se rotaron esa noche.
//
// Misma idea que `scripts/test-db/seed.mjs` y `scripts/setup-e2e-user.mjs`: la clave viene
// de una variable de entorno (vacía cuenta como ausente, igual que allá) o se genera al azar
// y no se guarda; estas cuentas no necesitan iniciar sesión (los scripts las administran con
// el service role). Acá además se valida el largo: Supabase rechaza más de 72 caracteres.
import { randomBytes } from 'node:crypto'

export const SEED_PASSWORD_ENV = 'SEED_USERS_PASSWORD'
const MINIMO = 16
// Supabase Auth (bcrypt) rechaza claves de más de 72 bytes.
const MAXIMO = 72

/**
 * Clave para las cuentas de un seed: la de `SEED_USERS_PASSWORD` si está (vacía o solo
 * espacios cuenta como ausente), si no una al azar. Resolverla UNA vez al inicio del seed,
 * antes de escribir nada: así un largo inválido corta antes de dejar el seed a medias.
 */
export function claveSeed(env: Record<string, string | undefined> = process.env): string {
  // Se recortan los espacios de los bordes (una clave con espacios en los bordes no es un caso real aquí).
  const dada = env[SEED_PASSWORD_ENV]?.trim()
  if (dada) {
    // bcrypt mide bytes, no caracteres: una `ñ` o una tilde ocupan 2.
    if (dada.length < MINIMO || Buffer.byteLength(dada, 'utf8') > MAXIMO) {
      throw new Error(`${SEED_PASSWORD_ENV} debe tener entre ${MINIMO} caracteres y ${MAXIMO} bytes`)
    }
    return dada
  }
  return `Seed-${randomBytes(24).toString('base64url')}`
}
