import { callLLM } from '@/lib/ai'

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
  const r = await callLLM({ role: 'evaluator', system, messages, responseJson, maxTokens: 500, surface: 'eval', aiEnv: 'dev' })
  return { text: r.text }
}

const SYSTEM = `Sos un evaluador de la calidad de un coach de golf por IA. La buena respuesta de coaching presenta UN foco en estas 6 PIEZAS:
1. IDENTIDAD: le habla al jugador por su nombre / como su coach.
2. HECHO: un dato real de SUS rondas (la evidencia).
3. VEREDICTO: qué significa ese hecho, sin rodeos.
4. TARGET: lo ata a su handicap/meta objetivo.
5. DELTA: cuánto le falta para la meta, o el tamaño del leak en sus números.
6. ACCION: UNA cosa concreta para esta semana.
Te paso la pregunta del jugador y la respuesta FINAL del coach. Marcá qué piezas están presentes.
Devolvé EXCLUSIVAMENTE un JSON con esta forma exacta (booleanos):
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
