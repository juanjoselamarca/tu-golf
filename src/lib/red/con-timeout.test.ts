import { describe, it, expect, vi } from 'vitest'
import { conTimeout, TiempoAgotadoError } from './con-timeout'

describe('conTimeout', () => {
  it('devuelve el resultado si llega antes del plazo', async () => {
    await expect(conTimeout(Promise.resolve(7), 1000)).resolves.toBe(7)
  })
  it('rechaza con TiempoAgotadoError si la promesa se cuelga (caída del 04-oct: respuestas de 80 s)', async () => {
    vi.useFakeTimers()
    const colgada = new Promise<number>(() => {})
    const p = conTimeout(colgada, 10_000)
    vi.advanceTimersByTime(10_001)
    await expect(p).rejects.toBeInstanceOf(TiempoAgotadoError)
    vi.useRealTimers()
  })
  it('propaga el rechazo original', async () => {
    await expect(conTimeout(Promise.reject(new Error('x')), 1000)).rejects.toThrow('x')
  })
})
