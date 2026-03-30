/**
 * Preferencias de notificación con defaults inteligentes por perfil.
 *
 * 3 niveles:
 * - "all": recibe todo (para fanáticos)
 * - "important": solo birdies+, cambios de líder, records, errores (DEFAULT)
 * - "minimal": solo errores críticos y fin de ronda
 */

import type { GolfEventType, NotificationLevel, UserProfile } from './types'

/** Qué eventos están activos en cada nivel */
const LEVEL_EVENTS: Record<NotificationLevel, Set<string>> = {
  all: new Set([
    'birdie', 'eagle', 'hole_in_one', 'score_saved', 'save_error',
    'round_finished', 'personal_best', 'birdie_streak',
    'player_enrolled', 'leader_change', 'anomalous_score', 'tournament_finished',
    'friend_eagle', 'friend_round_finished', 'milestone',
    'taiger_analysis_ready', 'remind_incomplete_round',
  ]),
  important: new Set([
    'birdie', 'eagle', 'hole_in_one', 'save_error',
    'round_finished', 'personal_best', 'birdie_streak',
    'leader_change', 'tournament_finished',
    'friend_eagle', 'milestone',
    'remind_incomplete_round',
  ]),
  minimal: new Set([
    'hole_in_one', 'save_error', 'round_finished', 'tournament_finished',
  ]),
}

/** Eventos que NUNCA se pueden desactivar (seguridad del usuario) */
const ALWAYS_ON: Set<string> = new Set([
  'hole_in_one',
  'save_error',
])

/** Default level por perfil */
const PROFILE_DEFAULTS: Record<UserProfile, NotificationLevel> = {
  player: 'important',
  organizer: 'important',
  spectator: 'important',
}

const STORAGE_KEY = 'golfers-notification-level'

/** Lee el nivel de notificación del usuario */
export function getNotificationLevel(): NotificationLevel {
  if (typeof window === 'undefined') return 'important'
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'all' || stored === 'important' || stored === 'minimal') return stored
  return 'important'
}

/** Guarda el nivel de notificación del usuario */
export function setNotificationLevel(level: NotificationLevel): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, level)
}

/** ¿Este evento debe notificarse dado el nivel actual? */
export function isEventEnabled(event: GolfEventType, level?: NotificationLevel): boolean {
  if (ALWAYS_ON.has(event)) return true
  const currentLevel = level ?? getNotificationLevel()
  return LEVEL_EVENTS[currentLevel].has(event)
}

/** Obtiene el default level para un perfil */
export function getDefaultLevel(profile: UserProfile): NotificationLevel {
  return PROFILE_DEFAULTS[profile]
}

/** Lista de eventos con su estado actual (para el panel de preferencias) */
export function getEventStates(level?: NotificationLevel): Array<{
  event: GolfEventType
  enabled: boolean
  locked: boolean  // true = ALWAYS_ON, no se puede desactivar
  label: string
  category: 'during_round' | 'social' | 'system'
}> {
  const currentLevel = level ?? getNotificationLevel()
  return [
    { event: 'hole_in_one', enabled: true, locked: true, label: 'Hole in one', category: 'during_round' },
    { event: 'eagle', enabled: isEventEnabled('eagle', currentLevel), locked: false, label: 'Eagles', category: 'during_round' },
    { event: 'birdie', enabled: isEventEnabled('birdie', currentLevel), locked: false, label: 'Birdies', category: 'during_round' },
    { event: 'birdie_streak', enabled: isEventEnabled('birdie_streak', currentLevel), locked: false, label: 'Racha de birdies', category: 'during_round' },
    { event: 'personal_best', enabled: isEventEnabled('personal_best', currentLevel), locked: false, label: 'Record personal', category: 'during_round' },
    { event: 'leader_change', enabled: isEventEnabled('leader_change', currentLevel), locked: false, label: 'Cambio de líder', category: 'during_round' },
    { event: 'round_finished', enabled: isEventEnabled('round_finished', currentLevel), locked: false, label: 'Ronda finalizada', category: 'during_round' },
    { event: 'save_error', enabled: true, locked: true, label: 'Errores al guardar', category: 'system' },
    { event: 'friend_eagle', enabled: isEventEnabled('friend_eagle', currentLevel), locked: false, label: 'Eagle de un amigo', category: 'social' },
    { event: 'milestone', enabled: isEventEnabled('milestone', currentLevel), locked: false, label: 'Milestones (10, 25, 50 rondas)', category: 'social' },
    { event: 'taiger_analysis_ready', enabled: isEventEnabled('taiger_analysis_ready', currentLevel), locked: false, label: 'Análisis de tAIger+ listo', category: 'system' },
    { event: 'remind_incomplete_round', enabled: isEventEnabled('remind_incomplete_round', currentLevel), locked: false, label: 'Recordatorio de ronda incompleta', category: 'system' },
  ]
}
