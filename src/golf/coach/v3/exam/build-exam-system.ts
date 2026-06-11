import { TAIGER_SYSTEM_PROMPT, TAIGER_SESSION_STARTER } from '@/golf/coach/prompts'
import { TOOLS_INSTRUCTION } from '@/golf/coach/prompts/tools-instruction'
import type { ExamSeed } from './fixtures'

/**
 * Construye el system prompt del examen IGUAL que el route de producción
 * (route.ts): reemplaza el placeholder `{PLAYER_CONTEXT}` con el contexto
 * sembrado, y appendea la instrucción de sesión (`TAIGER_SESSION_STARTER`) + la
 * `TOOLS_INSTRUCTION` compartida. Así el examen ejerce el MISMO prompt que ve el
 * coach real y un fallo por el session-starter o por el contexto no queda
 * invisible (finding code-review #1).
 *
 * Se omite la sección RAG a propósito: está detrás del flag `cerebro_v3_enabled`
 * y es ortogonal a la causa H (acceso a la data propia del jugador).
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
  const systemWithContext = TAIGER_SYSTEM_PROMPT.replace('{PLAYER_CONTEXT}', context)
  return `${systemWithContext}\n\nINSTRUCCIÓN DE SESIÓN:\n${TAIGER_SESSION_STARTER}${TOOLS_INSTRUCTION}`
}
