/**
 * Motor de notificaciones inteligente.
 * Decide QUÉ notificar, A QUIÉN, CUÁNDO, y CON QUÉ intensidad.
 *
 * Reglas:
 * 1. Respetar nivel de preferencia del usuario
 * 2. Escalar intensidad visual según importancia del evento
 * 3. No interrumpir durante input de score (solo después de confirmar)
 * 4. Agrupar si hay muchos eventos seguidos (espectador)
 * 5. Horario: push solo 7am-10pm
 */

import type { GolfEvent, NotificationDecision, FeedbackType } from './types'
import { isEventEnabled } from './preferences'

/** Mapeo de evento → feedback visual por defecto */
const EVENT_FEEDBACK: Record<string, {
  feedbackType: FeedbackType
  haptic?: number | number[]
  duration?: number
  sharePrompt?: boolean
}> = {
  hole_in_one: {
    feedbackType: 'celebration_epic',
    haptic: [50, 100, 50, 100, 50],
    duration: 6000,
    sharePrompt: true,
  },
  eagle: {
    feedbackType: 'celebration_medium',
    haptic: [30, 60, 30, 60],
    duration: 2500,
    sharePrompt: false,
  },
  birdie: {
    feedbackType: 'celebration_subtle',
    haptic: [15, 30, 15],
    duration: 1500,
    sharePrompt: false,
  },
  personal_best: {
    feedbackType: 'celebration_medium',
    haptic: [30, 60, 30, 60, 30],
    duration: 3000,
    sharePrompt: true,
  },
  birdie_streak: {
    feedbackType: 'celebration_subtle',
    haptic: [20, 40, 20],
    duration: 2000,
    sharePrompt: false,
  },
  round_finished: {
    feedbackType: 'toast_success',
    haptic: 30,
    duration: 4000,
  },
  score_saved: {
    feedbackType: 'haptic_only',
    haptic: 20,
  },
  save_error: {
    feedbackType: 'toast_error',
    duration: 8000,
  },
  leader_change: {
    feedbackType: 'badge_only',
    haptic: [15, 30],
  },
  tournament_finished: {
    feedbackType: 'celebration_medium',
    haptic: [30, 60, 30],
    duration: 3000,
    sharePrompt: true,
  },
  player_enrolled: {
    feedbackType: 'toast_success',
    duration: 3000,
  },
  anomalous_score: {
    feedbackType: 'toast_warning',
    duration: 5000,
  },
  milestone: {
    feedbackType: 'celebration_medium',
    haptic: [30, 60, 30],
    duration: 3000,
    sharePrompt: true,
  },
  friend_eagle: {
    feedbackType: 'push_notification',
  },
  friend_round_finished: {
    feedbackType: 'push_notification',
  },
  taiger_analysis_ready: {
    feedbackType: 'toast_info',
    duration: 5000,
  },
  remind_incomplete_round: {
    feedbackType: 'push_notification',
  },
}

/**
 * Decide si y cómo notificar un evento.
 * Esta es la función central que todo el sistema consulta.
 */
export function shouldNotify(event: GolfEvent): NotificationDecision {
  // ¿Está habilitado según preferencias del usuario?
  if (!isEventEnabled(event.type)) {
    return { notify: false, feedbackType: 'none' }
  }

  const config = EVENT_FEEDBACK[event.type]
  if (!config) {
    return { notify: false, feedbackType: 'none' }
  }

  // Push notifications: respetar horario (7am-10pm)
  if (config.feedbackType === 'push_notification') {
    const hour = new Date().getHours()
    if (hour < 7 || hour > 22) {
      return { notify: false, feedbackType: 'none' }
    }
  }

  return {
    notify: true,
    feedbackType: config.feedbackType,
    hapticPattern: config.haptic,
    duration: config.duration,
    showSharePrompt: config.sharePrompt ?? false,
    message: buildMessage(event),
  }
}

/** Genera mensaje legible para el evento */
function buildMessage(event: GolfEvent): string {
  const player = event.playerName ?? 'Jugador'
  const hole = event.hole ? `hoyo ${event.hole}` : ''
  const course = event.courseName ?? ''

  switch (event.type) {
    case 'hole_in_one':
      return `${player} — HOLE IN ONE en ${hole}`
    case 'eagle':
      return `${player} — Eagle en ${hole}`
    case 'birdie':
      return `${player} — Birdie en ${hole}`
    case 'personal_best':
      return `Nuevo record en ${course}: ${event.score} (${event.vsPar != null && event.vsPar >= 0 ? '+' : ''}${event.vsPar})`
    case 'birdie_streak':
      return `${player} — En racha de birdies`
    case 'leader_change':
      return `${player} toma el liderato`
    case 'round_finished':
      return `Ronda finalizada en ${course}`
    case 'milestone':
      return `${event.extraData?.count ?? ''} rondas completadas`
    default:
      return ''
  }
}

/**
 * Detecta racha de birdies.
 * Llama después de cada hoyo para verificar si hay 2+ birdies consecutivos.
 */
export function detectBirdieStreak(
  scores: Record<number, number>,
  pars: Record<number, number>,
  currentHole: number
): boolean {
  const prevHole = currentHole - 1
  if (prevHole < 1) return false

  const currentDiff = (scores[currentHole] ?? 0) - (pars[currentHole] ?? 4)
  const prevDiff = (scores[prevHole] ?? 0) - (pars[prevHole] ?? 4)

  return currentDiff === -1 && prevDiff === -1
}
