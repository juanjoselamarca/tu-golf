// Clave de las cuentas que crean los scripts de seed (demo y prueba).
//
// Incidente 23-oct-2026: los seeds traían la clave literal (`demo-golfers-2026`,
// `test-golfers-2026`) y el repo es público. Las 14 cuentas existían en prod con esa
// clave, una de ellas con rol admin, y cualquiera podía entrar. Se rotaron esa noche.
//
// Misma idea que `scripts/test-db/seed.mjs`: la clave viene de una variable de entorno
// o se genera al azar y no se guarda; estas cuentas no necesitan iniciar sesión (los
// scripts las administran con el service role).
import { randomBytes } from 'node:crypto'

export const SEED_PASSWORD_ENV = 'SEED_USERS_PASSWORD'
const MINIMO = 16
// Supabase Auth rechaza claves de más de 72 caracteres.
const MAXIMO = 72

/** Clave para una cuenta de seed: la de `SEED_USERS_PASSWORD` si está, si no una al azar. */
export function claveSeed(env: Record<string, string | undefined> = process.env): string {
  const dada = env[SEED_PASSWORD_ENV]
  if (dada !== undefined) {
    if (dada.length < MINIMO || dada.length > MAXIMO) {
      throw new Error(`${SEED_PASSWORD_ENV} debe tener entre ${MINIMO} y ${MAXIMO} caracteres`)
    }
    return dada
  }
  return `Seed-${randomBytes(24).toString('base64url')}`
}
