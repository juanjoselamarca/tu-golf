import { describe, it, expect, vi } from 'vitest'
import { runExamTurn, type ExamLLM } from '../tool-loop'
import { buildMockExecuteTool } from '../mock-executor'
import { judgeResponse, type JudgeLLM } from '../judge'
import { EXAM_CASES } from '../fixtures'

/**
 * Examen del coach — causa H.
 *
 * Dos capas:
 *  1. COMPOSICIÓN OFFLINE (siempre corre): cablea runExamTurn + mock-executor +
 *     judge con LLMs scripteados (sin red). Prueba que TODO el harness se conecta
 *     y que un coach "bueno" pasa el juez. Protege el wiring en cada PR.
 *  2. LIVE (gated por COACH_EXAM_LIVE=1 + claves): corre el coach REAL (Anthropic)
 *     contra la data sembrada en memoria y lo juzga con Gemini real, por cada una
 *     de las capturas. Es la validación de causa H de punta a punta. Requiere
 *     créditos de Anthropic; se salta honesto si no están (no falso verde).
 */

describe('Examen coach — composición offline del harness (siempre)', () => {
  it('un coach que usa find_rounds y responde el número pasa el juez', async () => {
    const caso = EXAM_CASES.find((c) => c.id === 'captura3_se_contradice')!
    const exec = buildMockExecuteTool(caso.seed)

    // Coach scripteado "bueno": busca con find_rounds y luego responde el conteo.
    const coach: ExamLLM = vi
      .fn()
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        toolUses: [{ id: 't1', name: 'find_rounds', input: { course: 'Lomas' } }],
        assistantBlocks: [{ type: 'tool_use', id: 't1', name: 'find_rounds', input: { course: 'Lomas' } }],
      })
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        text: 'Tenés 6 rondas registradas en Lomas. Vengo siguiéndolas.',
        toolUses: [],
        assistantBlocks: [],
      })

    const turn = await runExamTurn({
      system: 'sos tAIger',
      userMessage: caso.userMessage,
      tools: [],
      executeTool: exec,
      llm: coach,
    })

    expect(turn.toolsUsed).toContain('find_rounds')

    // Juez scripteado: sin violaciones.
    const judgeLLM: JudgeLLM = vi.fn().mockResolvedValue({
      text: JSON.stringify({ failed_must: [], violated_mustNot: [] }),
    })
    const verdict = await judgeResponse({
      userMessage: caso.userMessage,
      finalText: turn.finalText,
      toolsUsed: turn.toolsUsed,
      rubric: caso.rubric,
      llm: judgeLLM,
    })
    expect(verdict.pass).toBe(true)
  })

  it('un coach que pide la data en vez de buscarla es reprobado por el juez', async () => {
    const caso = EXAM_CASES.find((c) => c.id === 'captura2_pide_data')!
    const exec = buildMockExecuteTool(caso.seed)
    const coach: ExamLLM = vi.fn().mockResolvedValue({
      stopReason: 'end_turn',
      text: 'No tengo esa cancha cargada, ¿me pasás los pares de cada hoyo?',
      toolUses: [],
      assistantBlocks: [],
    })
    const turn = await runExamTurn({
      system: 'sos tAIger', userMessage: caso.userMessage, tools: [], executeTool: exec, llm: coach,
    })
    // Juez scripteado que detecta la violación (pide pares).
    const judgeLLM: JudgeLLM = vi.fn().mockResolvedValue({
      text: JSON.stringify({ failed_must: [caso.rubric.must[0]], violated_mustNot: [caso.rubric.mustNot[0]] }),
    })
    const verdict = await judgeResponse({
      userMessage: caso.userMessage, finalText: turn.finalText, toolsUsed: turn.toolsUsed, rubric: caso.rubric, llm: judgeLLM,
    })
    expect(verdict.pass).toBe(false)
    expect(verdict.reasons.length).toBeGreaterThan(0)
  })
})

// ── Capa LIVE: coach real + juez Gemini real, por cada captura ────────────────
const LIVE = process.env.COACH_EXAM_LIVE === '1'
const hasKeys = !!process.env.ANTHROPIC_API_KEY && !!process.env.GEMINI_API_KEY

describe.skipIf(!LIVE || !hasKeys)('Examen coach — LIVE (4 capturas + lenguaje, causa H)', () => {
  it('todas las capturas pasan el juez semántico', async () => {
    // Imports diferidos: solo cuando el bloque corre de verdad.
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const { makeAnthropicExamLLM } = await import('../anthropic-llm')
    const { buildExamSystem } = await import('../build-exam-system')
    const { TAIGER_TOOLS } = await import('@/golf/coach/tools')

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    const llm = makeAnthropicExamLLM(anthropic)

    const failures: string[] = []
    for (const caso of EXAM_CASES) {
      const exec = buildMockExecuteTool(caso.seed)
      const turn = await runExamTurn({
        system: buildExamSystem(caso.seed), userMessage: caso.userMessage, tools: [...TAIGER_TOOLS] as unknown[], executeTool: exec, llm,
      })
      const verdict = await judgeResponse({
        userMessage: caso.userMessage, finalText: turn.finalText, toolsUsed: turn.toolsUsed, rubric: caso.rubric,
      })
      if (!verdict.pass) failures.push(`[${caso.id}] ${verdict.reasons.join(' | ')} :: "${turn.finalText.slice(0, 160)}"`)
    }
    expect(failures, `\n${failures.join('\n')}`).toEqual([])
  }, 120_000)
})
