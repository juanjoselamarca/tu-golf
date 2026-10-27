/**
 * src/lib/push/preferencias.ts — fuente única de las preferencias de notificación
 * (columnas booleanas de `notification_preferences`) y sus defaults. Los usan la
 * API /api/push/preferences y el panel NotificationHub; los defaults son los
 * mismos que el DEFAULT de cada columna en la base.
 */

export const CLAVES_PREFERENCIA = [
  'birdies',
  'eagles',
  'leader_changes',
  'round_updates',
  'round_finished',
  'indice_cambios',
  'marketing',
] as const

export type ClavePreferencia = (typeof CLAVES_PREFERENCIA)[number]
export type PreferenciasNotificacion = Record<ClavePreferencia, boolean>

export const PREFERENCIAS_DEFAULT: PreferenciasNotificacion = {
  birdies: true,
  eagles: true,
  leader_changes: true,
  round_updates: true,
  round_finished: true,
  indice_cambios: true,
  marketing: false,
}

/** Solo las claves de preferencia de una fila (sin id, user_id ni timestamps), con default donde falte. */
export function preferenciasDeFila(fila: Partial<Record<string, unknown>> | null | undefined): PreferenciasNotificacion {
  const out = { ...PREFERENCIAS_DEFAULT }
  for (const k of CLAVES_PREFERENCIA) {
    const v = fila?.[k]
    if (typeof v === 'boolean') out[k] = v
  }
  return out
}
