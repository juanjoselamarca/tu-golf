import { describe, it, expect } from 'vitest'
import { executeTool, type ToolExecutionContext } from '../tools'

/**
 * Mock de Supabase para el lookup de course_holes. `pars === null` simula "cancha
 * sin datos"; un array simula los pares por hoyo (uno por elemento).
 * La cadena from→select→eq→order termina en order (await).
 */
function mockCtx(pars: number[] | null): ToolExecutionContext {
  const result = {
    data: pars == null ? null : pars.map((par, i) => ({ numero: i + 1, par })),
    error: null,
  }
  const chain: Record<string, unknown> = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    order: () => Promise.resolve(result),
  }
  return { supabase: chain as never, userId: 'u1', defaultRondaId: null, sessionId: null }
}

describe('compute_score_projection', () => {
  it('con course_id de par completo (18 hoyos, par 72) devuelve absoluto que cierra', async () => {
    const ctx = mockCtx(Array(18).fill(4)) // 18 × par 4 = 72
    const r = await executeTool('compute_score_projection', { course_id: 'c1', holes: 18, targetOver: 7 }, ctx)
    expect(r.ok).toBe(true)
    const d = (r as { ok: true; data: { absolute: number | null; over: number } }).data
    expect(d.absolute).toBe(79)
    expect(d.over).toBe(7)
  })

  it('sin course_id devuelve solo relativo, absolute null (no inventa par)', async () => {
    const ctx = mockCtx(null)
    const r = await executeTool('compute_score_projection', { holes: 18, targetOver: 7 }, ctx)
    const d = (r as { ok: true; data: { absolute: number | null; relativeLabel: string } }).data
    expect(d.absolute).toBeNull()
    expect(d.relativeLabel).toBe('+7')
  })

  it('par INCOMPLETO (17 de 18 hoyos) NO produce absoluto — cierra el caso P1 del review', async () => {
    const ctx = mockCtx(Array(17).fill(4)) // solo 17 hoyos con par
    const r = await executeTool('compute_score_projection', { course_id: 'c1', holes: 18, targetOver: 7 }, ctx)
    const d = (r as { ok: true; data: { absolute: number | null; relativeLabel: string } }).data
    expect(d.absolute).toBeNull()
    expect(d.relativeLabel).toBe('+7')
  })

  it('un parTotal suelto del LLM (sin course_id) NUNCA produce absoluto', async () => {
    const ctx = mockCtx(null)
    const r = await executeTool('compute_score_projection', { parTotal: 72, holes: 18, targetOver: 7 }, ctx)
    const d = (r as { ok: true; data: { absolute: number | null } }).data
    expect(d.absolute).toBeNull()
  })

  it('verifica un desglose puntual via distribution (7 pares + 8 bogeys + 3 dobles ⇒ +14)', async () => {
    const ctx = mockCtx(Array(18).fill(4))
    const r = await executeTool(
      'compute_score_projection',
      { course_id: 'c1', holes: 18, distribution: { par: 7, bogey: 8, double: 3 } },
      ctx,
    )
    const d = (r as { ok: true; data: { absolute: number | null; over: number } }).data
    expect(d.over).toBe(14)
    expect(d.absolute).toBe(86)
  })
})
