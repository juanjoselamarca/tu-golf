import { callLLM } from '@/lib/ai'
import { withJudgePatience } from './judge-retry'

/**
 * Juez de la rúbrica de 6 piezas del coach (identidad+hecho+veredicto+target+
 * delta+acción — definida en v3/prompts/sections/conocer.ts).
 *
 * Recibe la respuesta FINAL del coach y pide a un LLM evaluador (Gemini vía
 * gateway, gratis) que marque qué piezas están presentes. Devuelve el conteo y
 * las faltantes. Es ortogonal al juez de correctness (judge.ts, must/mustNot):
 * un caso puede evaluarse por ambos.
 *
 * El LLM es inyectable para testear offline sin red.
 */

export const SIX_PIECES = ['identidad', 'hecho', 'veredicto', 'target', 'delta', 'accion'] as const
export type SixPiece = (typeof SIX_PIECES)[number]

export interface SixPieceJudgeLLM {
  (args: {
    system: string
    messages: Array<{ role: 'user'; content: string }>
    responseJson: boolean
  }): Promise<{ text: string }>
}

export interface SixPieceVerdict {
  pieces: Record<SixPiece, boolean>
  score: number
  missing: SixPiece[]
}

const defaultLLM: SixPieceJudgeLLM = async ({ system, messages, responseJson }) => {
  // Banco de pruebas → surface 'eval' + ai_env 'dev': excluido del costo de prod.
  // temperature 0: el juez es un EVALUADOR — el determinismo es correcto y mata la
  // varianza de medición (la misma respuesta del coach debe puntuar igual siempre).
  const r = await withJudgePatience(
    () => callLLM({ role: 'evaluator', system, messages, responseJson, maxTokens: 500, surface: 'eval', aiEnv: 'dev', temperature: 0 }),
  )
  return { text: r.text }
}

// Exportado para canario offline (anclar el encuadre atómico anti-falso-0).
export const SYSTEM = `Eres un evaluador de la calidad de un coach de golf por IA. Evalúas 6 PIEZAS de comunicación, CADA UNA POR SEPARADO y por sus propios méritos.

REGLA CLAVE: marca cada pieza de forma INDEPENDIENTE. NO bajes todas a falso solo porque la respuesta no sea un "foco con datos" completo. Una respuesta honesta de cold-start (sin datos suficientes) igual puede tener IDENTIDAD, VEREDICTO y ACCIÓN — recónocelas.

Las 6 piezas:
1. IDENTIDAD: ¿le habla al jugador por su nombre o como su coach (no como un desconocido genérico)?
2. HECHO: ¿cita un dato real de SUS rondas (un número, un patrón concreto)? Si el coach dice con honestidad que todavía no hay datos suficientes, HECHO está ausente — y eso es CORRECTO, no un punto en contra; márcalo false sin penalizar el resto.
3. VEREDICTO: ¿da una lectura clara y sin rodeos? Un veredicto honesto del tipo "todavía no tengo datos suficientes para darte UN foco firme" CUENTA como veredicto presente.
4. TARGET: ¿conecta con su handicap o meta objetivo?
5. DELTA: ¿cuantifica cuánto le falta para la meta, o el tamaño del leak en sus números?
6. ACCIÓN: ¿propone UNA cosa concreta a hacer? Un paso real como "sumá 3-4 rondas", "importá tu historial" o "revisemos tu última ronda" CUENTA como acción presente.

Te paso la pregunta del jugador y la respuesta FINAL del coach. Marca qué piezas están presentes, juzgando cada una por separado.
Devuelve EXCLUSIVAMENTE un JSON con esta forma exacta (booleanos):
{"identidad": bool, "hecho": bool, "veredicto": bool, "target": bool, "delta": bool, "accion": bool}
No agregues texto fuera del JSON.`

function parse(text: string): Record<SixPiece, boolean> {
  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Juez 6-piezas devolvió texto sin JSON: ${text.slice(0, 200)}`)
  }
  const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  // NO falso-verde: las 6 claves deben venir como boolean o el veredicto es inválido.
  const out = {} as Record<SixPiece, boolean>
  for (const k of SIX_PIECES) {
    if (typeof obj[k] !== 'boolean') {
      throw new Error(
        `Juez 6-piezas: faltan claves booleanas (esperadas: ${SIX_PIECES.join(', ')}): ${text.slice(0, 200)}`,
      )
    }
    out[k] = obj[k] as boolean
  }
  return out
}

export async function judgeSixPieces(params: {
  userMessage: string
  finalText: string
  llm?: SixPieceJudgeLLM
}): Promise<SixPieceVerdict> {
  const llm = params.llm ?? defaultLLM
  const content = [
    `PREGUNTA DEL JUGADOR:\n${params.userMessage}`,
    `RESPUESTA FINAL DEL COACH:\n${params.finalText || '(respuesta vacía)'}`,
  ].join('\n\n')
  const res = await llm({ system: SYSTEM, messages: [{ role: 'user', content }], responseJson: true })
  const pieces = parse(res.text)
  const missing = SIX_PIECES.filter((p) => !pieces[p])
  return { pieces, score: SIX_PIECES.length - missing.length, missing }
}
