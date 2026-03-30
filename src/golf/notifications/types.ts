/**
 * Tipos del sistema de notificaciones inteligente de Golfers+.
 */

/** Perfiles de usuario — cada uno tiene defaults distintos */
export type UserProfile = 'player' | 'organizer' | 'spectator'

/** Niveles de notificación — el usuario elige uno */
export type NotificationLevel = 'all' | 'important' | 'minimal'

/** Tipos de eventos que pueden generar notificación */
export type GolfEventType =
  // Durante ronda — jugador
  | 'birdie'
  | 'eagle'
  | 'hole_in_one'
  | 'score_saved'
  | 'save_error'
  | 'round_finished'
  | 'personal_best'
  | 'birdie_streak'      // 2+ birdies seguidos
  // Durante ronda — organizador
  | 'player_enrolled'
  | 'leader_change'
  | 'anomalous_score'    // >triple bogey, posible error
  | 'tournament_finished'
  // Fuera de ronda
  | 'friend_eagle'
  | 'friend_round_finished'
  | 'milestone'          // 10, 25, 50, 100 rondas
  | 'taiger_analysis_ready'
  | 'remind_incomplete_round'

/** Tipo de feedback visual que se muestra */
export type FeedbackType =
  | 'celebration_epic'    // Full screen (hole-in-one)
  | 'celebration_medium'  // Overlay con confeti (eagle)
  | 'celebration_subtle'  // Flash + badge (birdie)
  | 'toast_success'
  | 'toast_error'
  | 'toast_warning'
  | 'toast_info'
  | 'push_notification'
  | 'haptic_only'
  | 'badge_only'          // Solo actualiza un badge/indicador en UI
  | 'none'

/** Evento completo con contexto */
export interface GolfEvent {
  type: GolfEventType
  playerName?: string
  hole?: number
  courseName?: string
  score?: number
  par?: number
  vsPar?: number
  extraData?: Record<string, unknown>
}

/** Resultado de shouldNotify — qué hacer con el evento */
export interface NotificationDecision {
  notify: boolean
  feedbackType: FeedbackType
  hapticPattern?: number | number[]
  duration?: number         // ms
  showSharePrompt?: boolean
  message?: string
}
