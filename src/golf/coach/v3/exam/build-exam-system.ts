import { buildCoachSystem } from '@/golf/coach/build-system'
import type { ExamSeed } from './fixtures'

/**
 * Construye el system prompt del examen vía el builder ÚNICO compartido con el
 * route de producción (`@/golf/coach/build-system`): reemplaza `{PLAYER_CONTEXT}`
 * con el contexto sembrado. Al ser la MISMA función que usa el coach real, el
 * examen no puede medir un prompt distinto al que se shippea (anti-divergencia).
 *
 * P1 del spec 2026-06-22: hoy pasa `cerebroV3Enabled: false` ⇒ arma el prompt v2,
 * byte-idéntico al armado previo. El flip a v3 (con tools v3 + seeds con scorecard)
 * es P2–P4; mientras tanto el examen sigue midiendo el coach v2.
 */

/** Contexto sembrado del jugador (incluye el índice — central en la captura 1). */
export function buildExamContext(seed: ExamSeed): string {
  const lines: string[] = []
  if (seed.handicap) {
    lines.push(`Índice del jugador (WHS): ${seed.handicap.indice}`)
  }
  lines.push(`Rondas registradas en el historial: ${seed.rounds.length}`)
  const courses = Array.from(new Set(seed.rounds.map((r) => r.course)))
  if (courses.length) lines.push(`Canchas jugadas: ${courses.join(', ')}`)
  return lines.join('\n')
}

export function buildExamSystem(seed: ExamSeed): string {
  const context = buildExamContext(seed)
  return buildCoachSystem({ contextString: context, cerebroV3Enabled: false, onboarded: true })
}
