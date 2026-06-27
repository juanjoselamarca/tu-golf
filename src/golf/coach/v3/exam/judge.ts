import { callLLM } from '@/lib/ai'
import { withJudgePatience } from './judge-retry'

/**
 * Juez semántico del examen del coach (causa H).
 *
 * Recibe la respuesta REAL del coach (texto final + tools que usó) y una rúbrica
 * `must`/`mustNot`, y pide a un LLM evaluador (Gemini vía gateway, gratis) que
 * diga en JSON qué condiciones se incumplieron. El veredicto es binario: pasa
 * solo si no faltó ningún `must` ni se violó ningún `mustNot`.
 *
 * El LLM es inyectable (`llm`) para testear offline; por defecto usa el gateway
 * con rol `evaluator` y `responseJson` (Gemini devuelve JSON puro).
 */

export interface JudgeLLM {
  (args: {
    system: string
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    responseJson: boolean
  }): Promise<{ text: string }>
}

export interface JudgeVerdict {
  pass: boolean
  reasons: string[]
}

const defaultJudgeLLM: JudgeLLM = async ({ system, messages, responseJson }) => {
  // Banco de pruebas → surface 'eval' + ai_env 'dev': excluido del costo de prod.
  // temperature 0: el juez de correctness alimenta el gate MÁS estrecho (passRateTol
  // 0.05); el determinismo es correcto para un evaluador y estabiliza ese gate (la
  // misma respuesta del coach se juzga igual siempre — el ruido restante es coach-side).
  const r = await withJudgePatience(
    () => callLLM({ role: 'evaluator', system, messages, responseJson, maxTokens: 600, surface: 'eval', aiEnv: 'dev', temperature: 0 }),
  )
  return { text: r.text }
}

const JUDGE_SYSTEM = `Sos un evaluador estricto de un coach de golf por IA. Te paso la pregunta del jugador, la respuesta FINAL del coach, las herramientas que el coach usó, y una rúbrica con condiciones que la respuesta DEBE cumplir (must) y condiciones que NO debe violar (mustNot).
Devolvé EXCLUSIVAMENTE un JSON con esta forma exacta:
{"failed_must": string[], "violated_mustNot": string[]}
- failed_must: las entradas de la lista must que la respuesta NO cumple (copialas textuales).
- violated_mustNot: las entradas de la lista mustNot que la respuesta SÍ viola (copialas textuales).
Si la respuesta cumple todo, devolvé ambas listas vacías. No agregues texto fuera del JSON.`

/** Extrae el primer objeto JSON del texto, tolerando code fences ```json. */
function parseJudgeJson(text: string): { failed_must: string[]; violated_mustNot: string[] } {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Juez devolvió un texto sin JSON parseable: ${text.slice(0, 200)}`)
  }
  const obj = JSON.parse(cleaned.slice(start, end + 1)) as {
    failed_must?: unknown
    violated_mustNot?: unknown
  }
  // NO falso-verde: si el juez no devuelve AMBAS claves como arrays, es un
  // veredicto inválido — lanzamos en vez de asumir "sin violaciones" (que
  // pasaría el examen). Un gate de regresión nunca debe pasar por defecto.
  if (!Array.isArray(obj.failed_must) || !Array.isArray(obj.violated_mustNot)) {
    throw new Error(
      `Juez devolvió un JSON sin las claves esperadas (failed_must / violated_mustNot): ${text.slice(0, 200)}`,
    )
  }
  const asStrings = (v: unknown[]): string[] => v.filter((x): x is string => typeof x === 'string')
  return { failed_must: asStrings(obj.failed_must), violated_mustNot: asStrings(obj.violated_mustNot) }
}

export async function judgeResponse(params: {
  userMessage: string
  finalText: string
  toolsUsed: string[]
  rubric: { must: string[]; mustNot: string[] }
  llm?: JudgeLLM
}): Promise<JudgeVerdict> {
  const { userMessage, finalText, toolsUsed, rubric } = params
  const llm = params.llm ?? defaultJudgeLLM

  const userPrompt = [
    `PREGUNTA DEL JUGADOR:\n${userMessage}`,
    `RESPUESTA FINAL DEL COACH:\n${finalText || '(respuesta vacía)'}`,
    `HERRAMIENTAS QUE USÓ EL COACH: ${toolsUsed.length ? toolsUsed.join(', ') : '(ninguna)'}`,
    `RÚBRICA — must (debe cumplir TODAS):\n${rubric.must.map((m) => `- ${m}`).join('\n')}`,
    `RÚBRICA — mustNot (no debe violar NINGUNA):\n${rubric.mustNot.map((m) => `- ${m}`).join('\n')}`,
  ].join('\n\n')

  const res = await llm({
    system: JUDGE_SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
    responseJson: true,
  })

  const parsed = parseJudgeJson(res.text)
  const reasons = [
    ...parsed.failed_must.map((m) => `MUST no cumplido: ${m}`),
    ...parsed.violated_mustNot.map((m) => `MUST-NOT violado: ${m}`),
  ]
  return { pass: reasons.length === 0, reasons }
}
