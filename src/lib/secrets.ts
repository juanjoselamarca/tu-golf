/**
 * Comparación de secretos en tiempo constante — fuente única (antes había tres
 * copias: push, inbox de Telegram y callback E2E). `===` corta en el primer byte
 * distinto y deja inferir el secreto por timing; timingSafeEqual recorre todo.
 *
 * Vacío o ausente en CUALQUIER lado → false: un secreto de entorno sin configurar
 * nunca abre la puerta a quien manda un header vacío.
 */
import { timingSafeEqual } from 'node:crypto'

export function secretsMatch(recibido: string | null | undefined, esperado: string | null | undefined): boolean {
  if (!recibido || !esperado) return false
  const a = Buffer.from(recibido, 'utf8')
  const b = Buffer.from(esperado, 'utf8')
  // timingSafeEqual lanza con longitudes distintas.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** `Authorization: Bearer <CRON_SECRET>` de los crons de Vercel. */
export function esCronAutorizado(authorization: string | null, cronSecret: string | undefined): boolean {
  if (!cronSecret) return false
  return secretsMatch(authorization, `Bearer ${cronSecret}`)
}
