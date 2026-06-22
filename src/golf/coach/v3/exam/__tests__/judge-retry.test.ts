import { describe, it, expect, vi } from 'vitest'
import { withJudgePatience } from '../judge-retry'

const noSleep = (): Promise<void> => Promise.resolve()

describe('withJudgePatience', () => {
  it('devuelve el resultado al primer intento sin reintentar', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const out = await withJudgePatience(fn, { sleepFn: noSleep })
    expect(out).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('reintenta ante error transitorio y termina devolviendo el éxito', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('503 high demand'))
      .mockRejectedValueOnce(new Error('503 high demand'))
      .mockResolvedValue('ok')
    const out = await withJudgePatience(fn, { sleepFn: noSleep })
    expect(out).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('re-lanza el último error tras agotar los reintentos', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('503 persistente'))
    await expect(
      withJudgePatience(fn, { maxRetries: 2, sleepFn: noSleep }),
    ).rejects.toThrow(/503 persistente/)
    // 1 intento inicial + 2 reintentos = 3 llamadas
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('respeta maxRetries y notifica cada reintento con backoff exponencial', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('x'))
    const waits: number[] = []
    await expect(
      withJudgePatience(fn, {
        maxRetries: 3,
        baseMs: 1000,
        sleepFn: noSleep,
        onRetry: ({ waitMs }) => waits.push(waitMs),
      }),
    ).rejects.toThrow()
    expect(waits).toEqual([1000, 2000, 4000])
  })
})
