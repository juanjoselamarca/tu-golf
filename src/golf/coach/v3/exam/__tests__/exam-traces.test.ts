import { describe, it, expect, vi } from 'vitest'
import { writeExamTraces, type ExamTraceRow } from '../exam-traces'

function mockClient() {
  const insert = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn().mockReturnValue({ insert })
  return { client: { from } as never, insert, from }
}

const row: ExamTraceRow = {
  run_id: 'run-1', case_id: 'captura1', tags: ['data-access'], coach_model: 'claude-x',
  user_message: 'u', final_text: 'f', tools_used: ['find_rounds'],
  correctness_pass: true, correctness_reasons: [],
  six_pieces_applicable: false, six_pieces_score: null, six_pieces_missing: [],
}

describe('writeExamTraces', () => {
  it('inserta en coach_eval_traces y no lanza si error es null', async () => {
    const { client, from, insert } = mockClient()
    await writeExamTraces(client, [row])
    expect(from).toHaveBeenCalledWith('coach_eval_traces')
    expect(insert).toHaveBeenCalledWith([row])
  })

  it('lanza si Supabase devuelve error (no traga el fallo)', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: 'boom' } })
    const client = { from: vi.fn().mockReturnValue({ insert }) } as never
    await expect(writeExamTraces(client, [row])).rejects.toThrow(/boom/)
  })

  it('no llama a Supabase con lista vacía', async () => {
    const { client, from } = mockClient()
    await writeExamTraces(client, [])
    expect(from).not.toHaveBeenCalled()
  })
})
