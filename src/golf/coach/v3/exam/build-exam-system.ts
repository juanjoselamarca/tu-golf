import { buildCoachSystem } from '@/golf/coach/build-system'
import type { ExamSeed } from './fixtures'

/**
 * Construye el system prompt del examen vía el builder ÚNICO compartido con el
 * route de producción (`@/golf/coach/build-system`): reemplaza `{PLAYER_CONTEXT}`
 * con el contexto sembrado. Al ser la MISMA función que usa el coach real, el
 * examen no puede medir un prompt distinto al que se shippea (anti-divergencia).
 *
 * P4 del spec 2026-06-22 (flip a v3): el examen ahora arma el prompt **v3** por
 * defecto (CONOCER + ENGAGEMENT + RAG), consistente con las tools v3 que el runner
 * ya expone (P2) y los seeds con scorecard que disparan foco real (P3). El flag es
 * un parámetro — no un hardcode — para que el runner lo gobierne desde UNA fuente y
 * system+tools nunca diverjan (un concepto, una fuente). Default `true` = el coach
 * "día-1-pro" que el examen debe medir; `false` reproduce el coach v2 legacy.
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

export function buildExamSystem(seed: ExamSeed, cerebroV3Enabled = true): string {
  const context = buildExamContext(seed)
  return buildCoachSystem({ contextString: context, cerebroV3Enabled, onboarded: true })
}
