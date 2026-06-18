import { describe, it, expect, vi } from 'vitest'
import { judgeSixPieces, type SixPieceJudgeLLM } from '../quality-judge'

const allTrue = {
  identidad: true, hecho: true, veredicto: true, target: true, delta: true, accion: true,
}

describe('judgeSixPieces', () => {
  it('cuenta las 6 piezas presentes y score 6 cuando están todas', async () => {
    const llm: SixPieceJudgeLLM = vi.fn().mockResolvedValue({ text: JSON.stringify(allTrue) })
    const v = await judgeSixPieces({ userMessage: 'x', finalText: 'respuesta completa', llm })
    expect(v.score).toBe(6)
    expect(v.missing).toEqual([])
  })

  it('marca las piezas faltantes y baja el score', async () => {
    const llm: SixPieceJudgeLLM = vi
      .fn()
      .mockResolvedValue({ text: JSON.stringify({ ...allTrue, delta: false, accion: false }) })
    const v = await judgeSixPieces({ userMessage: 'x', finalText: 'sin delta ni acción', llm })
    expect(v.score).toBe(4)
    expect(v.missing).toEqual(['delta', 'accion'])
  })

  it('NO falso-verde: lanza si el juez no devuelve las 6 claves booleanas', async () => {
    const llm: SixPieceJudgeLLM = vi.fn().mockResolvedValue({ text: JSON.stringify({ identidad: true }) })
    await expect(judgeSixPieces({ userMessage: 'x', finalText: 'y', llm })).rejects.toThrow(/claves/)
  })

  it('tolera code fences ```json del LLM', async () => {
    const llm: SixPieceJudgeLLM = vi
      .fn()
      .mockResolvedValue({ text: '```json\n' + JSON.stringify(allTrue) + '\n```' })
    const v = await judgeSixPieces({ userMessage: 'x', finalText: 'y', llm })
    expect(v.score).toBe(6)
  })
})
