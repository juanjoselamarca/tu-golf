import { describe, it, expect, vi } from 'vitest'
import { runExamTurn, type ExamLLM, type ExamMessage } from '../tool-loop'

/**
 * El tool-loop puro del examen ESPEJA el loop real de `runChatStream`
 * (chat-engine.ts): itera, en `tool_use` despacha la tool y realimenta el
 * resultado, en `end_turn` devuelve el texto final. Cero streaming, cero
 * Supabase, cero side-effects — testeable offline con un LLM mockeado.
 */
describe('runExamTurn — tool-loop puro del examen', () => {
  it('ejecuta una tool y devuelve texto final + tools usadas', async () => {
    const llm = vi
      .fn()
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        toolUses: [{ id: 't1', name: 'find_rounds', input: { course: 'Lomas' } }],
        assistantBlocks: [{ type: 'tool_use', id: 't1', name: 'find_rounds', input: { course: 'Lomas' } }],
      })
      .mockResolvedValueOnce({
        stopReason: 'end_turn',
        text: 'Tenés 5 rondas en Lomas, promedio 84.',
        toolUses: [],
        assistantBlocks: [{ type: 'text', text: 'Tenés 5 rondas en Lomas, promedio 84.' }],
      })
    const executeTool = vi.fn().mockResolvedValue({ ok: true, data: { count: 5 } })

    const r = await runExamTurn({
      system: 'sos tAIger',
      userMessage: '¿cuántas rondas tengo en Lomas?',
      tools: [{ name: 'find_rounds' }],
      executeTool,
      llm,
      maxIters: 5,
    })

    expect(r.toolsUsed).toEqual(['find_rounds'])
    expect(r.finalText).toContain('5 rondas')
    expect(executeTool).toHaveBeenCalledWith('find_rounds', { course: 'Lomas' })
  })

  it('realimenta el resultado de la tool como tool_result al siguiente turno del LLM', async () => {
    const llm = vi
      .fn()
      .mockResolvedValueOnce({
        stopReason: 'tool_use',
        text: '',
        toolUses: [{ id: 'abc', name: 'get_playing_handicap', input: {} }],
        assistantBlocks: [{ type: 'tool_use', id: 'abc', name: 'get_playing_handicap', input: {} }],
      })
      .mockResolvedValueOnce({ stopReason: 'end_turn', text: 'Tu handicap de juego es 14.', toolUses: [], assistantBlocks: [] })
    const executeTool = vi.fn().mockResolvedValue({ ok: true, data: { playing_handicap: 14 } })

    await runExamTurn({ system: 's', userMessage: 'u', tools: [], executeTool, llm, maxIters: 5 })

    // El 2º llamado al LLM debe incluir el tool_result con el handicap.
    const secondCallMessages = llm.mock.calls[1][0].messages
    const toolResultMsg = secondCallMessages.find((m: ExamMessage) => m.role === 'user' && Array.isArray(m.content))
    expect(JSON.stringify(toolResultMsg)).toContain('"tool_use_id":"abc"')
    expect(JSON.stringify(toolResultMsg)).toContain('14')
  })

  it('corta en maxIters si el LLM siempre pide tools (sin loop infinito)', async () => {
    const llm = vi.fn().mockResolvedValue({
      stopReason: 'tool_use',
      text: '',
      toolUses: [{ id: 't', name: 'find_rounds', input: {} }],
      assistantBlocks: [{ type: 'tool_use', id: 't', name: 'find_rounds', input: {} }],
    })
    const executeTool = vi.fn().mockResolvedValue({ ok: true, data: {} })

    const r = await runExamTurn({ system: 's', userMessage: 'u', tools: [], executeTool, llm, maxIters: 3 })

    expect(llm).toHaveBeenCalledTimes(3)
    expect(typeof r.finalText).toBe('string')
  })

  it('usa MAX_TOOL_ITERS del coach como default cuando no se pasa maxIters', async () => {
    const llm = vi.fn().mockResolvedValue({
      stopReason: 'tool_use',
      text: '',
      toolUses: [{ id: 't', name: 'x', input: {} }],
      assistantBlocks: [{ type: 'tool_use', id: 't', name: 'x', input: {} }],
    })
    const executeTool = vi.fn().mockResolvedValue({ ok: true, data: {} })

    await runExamTurn({ system: 's', userMessage: 'u', tools: [], executeTool, llm })

    const { MAX_TOOL_ITERS } = await import('@/golf/coach/loop-config')
    expect(llm).toHaveBeenCalledTimes(MAX_TOOL_ITERS)
  })
})
