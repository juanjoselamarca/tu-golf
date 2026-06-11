import { describe, it, expect } from 'vitest'
import { buildExamSystem, buildExamContext } from '../build-exam-system'
import { EXAM_CASES } from '../fixtures'

const captura1 = EXAM_CASES.find((c) => c.id === 'captura1_indice_vs_hcp')!

describe('buildExamSystem — system prompt fiel al de producción', () => {
  it('reemplaza el placeholder {PLAYER_CONTEXT} (no lo deja literal)', () => {
    const sys = buildExamSystem(captura1.seed)
    expect(sys).not.toContain('{PLAYER_CONTEXT}')
  })

  it('inyecta el índice del jugador en el contexto (causa H captura 1)', () => {
    const ctx = buildExamContext(captura1.seed)
    expect(ctx).toContain('10') // índice del seed
    const sys = buildExamSystem(captura1.seed)
    expect(sys).toContain('10')
  })

  it('usa el session starter real y la instrucción de tools compartida', async () => {
    const { TAIGER_SESSION_STARTER } = await import('@/golf/coach/prompts')
    const { TOOLS_INSTRUCTION } = await import('@/golf/coach/prompts/tools-instruction')
    const sys = buildExamSystem(captura1.seed)
    expect(sys).toContain(TAIGER_SESSION_STARTER)
    expect(sys).toContain(TOOLS_INSTRUCTION.trim())
  })

  it('refleja el conteo de rondas sembradas', () => {
    const ctx = buildExamContext(captura1.seed)
    expect(ctx).toContain(String(captura1.seed.rounds.length))
  })
})
