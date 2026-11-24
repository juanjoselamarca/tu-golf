import { describe, it, expect, vi } from 'vitest'
import { conPlazoCancelable, conTimeout, LecturaCanceladaError, TiempoAgotadoError } from './con-timeout'

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

describe('conPlazoCancelable', () => {
  it('devuelve el resultado y no deja la señal abortada', async () => {
    let senal: AbortSignal | undefined
    await expect(conPlazoCancelable(s => { senal = s; return Promise.resolve(7) }, 1000)).resolves.toBe(7)
    expect(senal?.aborted).toBe(false)
  })
  it('al vencer el plazo rechaza con TiempoAgotadoError y ABORTA la lectura (el fetch se corta)', async () => {
    vi.useFakeTimers()
    let senal: AbortSignal | undefined
    const p = conPlazoCancelable(s => { senal = s; return new Promise<number>(() => {}) }, 10_000)
    const rechazo = expect(p).rejects.toBeInstanceOf(TiempoAgotadoError)
    await vi.advanceTimersByTimeAsync(10_001)
    await rechazo
    expect(senal?.aborted).toBe(true)
    vi.useRealTimers()
  })
  it('la señal del que llama, abortada, cancela la lectura con LecturaCanceladaError', async () => {
    const padre = new AbortController()
    let senal: AbortSignal | undefined
    const p = conPlazoCancelable(s => { senal = s; return new Promise<number>(() => {}) }, 10_000, { signal: padre.signal })
    padre.abort()
    await expect(p).rejects.toBeInstanceOf(LecturaCanceladaError)
    expect(senal?.aborted).toBe(true)
  })
  it('con la señal del que llama ya abortada no llega a leer', async () => {
    const padre = new AbortController()
    padre.abort()
    const leer = vi.fn(() => Promise.resolve(1))
    await expect(conPlazoCancelable(leer, 1000, { signal: padre.signal })).rejects.toBeInstanceOf(LecturaCanceladaError)
    expect(leer).not.toHaveBeenCalled()
  })
  it('propaga el error de la lectura (también si lanza sincrónico) y suelta el listener del padre', async () => {
    const padre = new AbortController()
    const quitar = vi.spyOn(padre.signal, 'removeEventListener')
    await expect(conPlazoCancelable(() => { throw new Error('x') }, 1000, { signal: padre.signal })).rejects.toThrow('x')
    expect(quitar).toHaveBeenCalledWith('abort', expect.any(Function))
  })
})
