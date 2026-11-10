/**
 * Regla del nombre de un invitado que se inscribe solo por el link del torneo: entre 2 y 100 caracteres sin
 * contar los espacios de los extremos. La usan el formulario (FormInvitado + useInscripcionTorneo) y el
 * servidor (api/torneos/[slug]/guest-join): sin 'use client' para que ambos importen la misma.
 */
export const NOMBRE_INVITADO_MIN = 2
export const NOMBRE_INVITADO_MAX = 100

/** Lo que ve el invitado en el formulario (el input ya corta en 100 caracteres). */
export const MENSAJE_NOMBRE_INVITADO_CORTO = 'Ingresa tu nombre (al menos 2 caracteres).'

export function nombreDeInvitadoValido(nombre: unknown): nombre is string {
  if (typeof nombre !== 'string') return false
  const largo = nombre.trim().length
  return largo >= NOMBRE_INVITADO_MIN && largo <= NOMBRE_INVITADO_MAX
}
