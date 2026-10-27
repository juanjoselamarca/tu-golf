// 19-oct (#602, revisión Fable) — La imagen de respaldo de "compartir" de un 9h que se
// juega en la vuelta pintaba los hoyos 1-9 con "–", TOTAL 0 y −36. Ahora pinta 10-18.
import { describe, it, expect } from 'vitest'
import { drawScorecard } from './share-card'

/** Contexto de canvas que no dibuja nada y anota cada `fillText`. */
function ctxQueAnota() {
  const textos: string[] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => (k === 'fillText' ? (t: string) => { textos.push(String(t)) } : () => {}),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D
  return { ctx, textos }
}

const back = (v: number) => Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 10, v]))

describe('drawScorecard — 9 hoyos desde el 10', () => {
  it('pinta los hoyos 10-18 con sus golpes, rótulo IN y el total real', () => {
    const { ctx, textos } = ctxQueAnota()
    drawScorecard(ctx, back(5), back(4), [10, 11, 12, 13, 14, 15, 16, 17, 18], 0, 1080)
    expect(textos).toContain('10')
    expect(textos).toContain('18')
    expect(textos).toContain('IN')
    expect(textos).not.toContain('OUT')
    expect(textos).not.toContain('–')
    expect(textos).toContain('45')
  })

  it('18 hoyos desde el 1: OUT y IN como siempre', () => {
    const { ctx, textos } = ctxQueAnota()
    drawScorecard(ctx, {}, {}, Array.from({ length: 18 }, (_, i) => i + 1), 0, 1080)
    expect(textos.filter(t => t === 'OUT')).toHaveLength(1)
    expect(textos.filter(t => t === 'IN')).toHaveLength(1)
  })
})
