import { describe, it, expect, vi } from 'vitest'
import { judgeResponse, type JudgeLLM } from '../judge'

const rubric = {
  must: ['usa los pares reales de la cancha'],
  mustNot: ['le pide la tarjeta al jugador', 'culpa al sistema'],
}

describe('judgeResponse — juez semántico del examen', () => {
  it('pass=true cuando el LLM no reporta violaciones', async () => {
    const llm: JudgeLLM = vi.fn().mockResolvedValue({
      text: JSON.stringify({ failed_must: [], violated_mustNot: [] }),
    })
    const v = await judgeResponse({
      userMessage: 'dame los pares de Lomas',
      finalText: 'Lomas es par 72: par 3 en 4 hoyos...',
      toolsUsed: ['get_course_scorecard'],
      rubric,
      llm,
    })
    expect(v.pass).toBe(true)
    expect(v.reasons).toEqual([])
  })

  it('pass=false con razones cuando hay violaciones', async () => {
    const llm: JudgeLLM = vi.fn().mockResolvedValue({
      text: JSON.stringify({ failed_must: ['usa los pares reales de la cancha'], violated_mustNot: ['culpa al sistema'] }),
    })
    const v = await judgeResponse({
      userMessage: 'dame los pares de Lomas',
      finalText: 'No tengo esa cancha en el sistema, pasame la tarjeta.',
      toolsUsed: [],
      rubric,
      llm,
    })
    expect(v.pass).toBe(false)
    expect(v.reasons.join(' ')).toContain('usa los pares reales')
    expect(v.reasons.join(' ')).toContain('culpa al sistema')
  })

  it('tolera que el LLM envuelva el JSON en code fences ```json', async () => {
    const llm: JudgeLLM = vi.fn().mockResolvedValue({
      text: '```json\n{"failed_must":[],"violated_mustNot":[]}\n```',
    })
    const v = await judgeResponse({ userMessage: 'x', finalText: 'y', toolsUsed: [], rubric, llm })
    expect(v.pass).toBe(true)
  })

  it('le pasa al LLM la respuesta del coach + la rúbrica completa', async () => {
    const llm = vi.fn().mockResolvedValue({ text: '{"failed_must":[],"violated_mustNot":[]}' })
    await judgeResponse({
      userMessage: '¿cuántas rondas tengo?',
      finalText: 'Tenés 6 rondas en Lomas.',
      toolsUsed: ['find_rounds'],
      rubric,
      llm: llm as unknown as JudgeLLM,
    })
    const sent = JSON.stringify(llm.mock.calls[0][0])
    expect(sent).toContain('Tenés 6 rondas en Lomas.')
    expect(sent).toContain('usa los pares reales de la cancha')
    expect(sent).toContain('culpa al sistema')
    expect(sent).toContain('find_rounds')
  })

  it('falla ruidoso (NO falso-verde) si el JSON no trae las claves esperadas', async () => {
    const llm: JudgeLLM = vi.fn().mockResolvedValue({ text: '{}' })
    await expect(
      judgeResponse({ userMessage: 'x', finalText: 'y', toolsUsed: [], rubric, llm }),
    ).rejects.toThrow()
  })

  it('falla ruidoso si el juez devuelve las claves en otro formato (camelCase)', async () => {
    const llm: JudgeLLM = vi.fn().mockResolvedValue({ text: '{"failedMust":["a"],"violatedMustNot":[]}' })
    await expect(
      judgeResponse({ userMessage: 'x', finalText: 'y', toolsUsed: [], rubric, llm }),
    ).rejects.toThrow()
  })

  it('exige JSON puro al proveedor (responseJson=true)', async () => {
    const llm = vi.fn().mockResolvedValue({ text: '{"failed_must":[],"violated_mustNot":[]}' })
    await judgeResponse({ userMessage: 'x', finalText: 'y', toolsUsed: [], rubric, llm: llm as unknown as JudgeLLM })
    expect(llm.mock.calls[0][0].responseJson).toBe(true)
  })
})
