import { describe, it, expect, vi } from 'vitest'
import { makeAnthropicExamLLM } from '../anthropic-llm'

describe('makeAnthropicExamLLM — adaptador del SDK al contrato del examen', () => {
  it('mapea texto y tool_use de la respuesta del SDK', async () => {
    const fakeAnthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'tool_use',
          content: [
            { type: 'text', text: 'Dejame buscar...' },
            { type: 'tool_use', id: 'tu_1', name: 'find_rounds', input: { course: 'Lomas' } },
          ],
        }),
      },
    }
    const llm = makeAnthropicExamLLM(fakeAnthropic as never)
    const r = await llm({ system: 's', messages: [{ role: 'user', content: 'hola' }], tools: [] })

    expect(r.stopReason).toBe('tool_use')
    expect(r.text).toBe('Dejame buscar...')
    expect(r.toolUses).toEqual([{ id: 'tu_1', name: 'find_rounds', input: { course: 'Lomas' } }])
    expect(r.assistantBlocks).toHaveLength(2)
  })

  it('en turno final devuelve solo texto y toolUses vacío', async () => {
    const fakeAnthropic = {
      messages: {
        create: vi.fn().mockResolvedValue({
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: 'Tenés 6 rondas.' }],
        }),
      },
    }
    const llm = makeAnthropicExamLLM(fakeAnthropic as never)
    const r = await llm({ system: 's', messages: [], tools: [] })
    expect(r.stopReason).toBe('end_turn')
    expect(r.text).toBe('Tenés 6 rondas.')
    expect(r.toolUses).toEqual([])
  })
})
