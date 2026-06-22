import { describe, it, expect, vi } from 'vitest'
import { withJudgePatience, isRetryableJudgeError } from '../judge-retry'

const noSleep = (): Promise<void> => Promise.resolve()

/** Error transitorio como lo clasifica el gateway (status en RETRYABLE_STATUS). */
const transientErr = (): Error => Object.assign(new Error('503 high demand'), { status: 503 })
/** Error permanente (no transitorio). */
const permanentErr = (): Error => Object.assign(new Error('401 unauthorized'), { status: 401 })
/** Lo que el juez ve de verdad: AllProvidersFailedError con el 503 en .cause. */
const wrappedTransientErr = (): Error =>
  Object.assign(new Error('gateway: toda la cadena falló para rol=evaluator'), {
    cause: transientErr(),
  })

describe('isRetryableJudgeError', () => {
  it('reintenta transitorios directos y envueltos en .cause; no permanentes', () => {
    expect(isRetryableJudgeError(transientErr())).toBe(true)
    expect(isRetryableJudgeError(wrappedTransientErr())).toBe(true)
    expect(isRetryableJudgeError(permanentErr())).toBe(false)
  })
})

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
      .mockRejectedValueOnce(transientErr())
      .mockRejectedValueOnce(wrappedTransientErr())
      .mockResolvedValue('ok')
    const out = await withJudgePatience(fn, { sleepFn: noSleep })
    expect(out).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('re-lanza el último error tras agotar los reintentos', async () => {
    const fn = vi.fn().mockRejectedValue(transientErr())
    await expect(
      withJudgePatience(fn, { maxRetries: 2, sleepFn: noSleep }),
    ).rejects.toThrow(/503/)
    // 1 intento inicial + 2 reintentos = 3 llamadas
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('falla rápido ante error permanente: una sola llamada, sin backoff', async () => {
    const fn = vi.fn().mockRejectedValue(permanentErr())
    const onRetry = vi.fn()
    await expect(
      withJudgePatience(fn, { sleepFn: noSleep, onRetry }),
    ).rejects.toThrow(/401/)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('respeta maxRetries y notifica cada reintento con backoff exponencial', async () => {
    const fn = vi.fn().mockRejectedValue(transientErr())
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
