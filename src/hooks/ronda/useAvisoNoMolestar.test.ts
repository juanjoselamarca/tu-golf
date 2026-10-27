import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import {
  reclamarAvisoNoMolestar,
  useAvisoNoMolestar,
  claveAvisoRondaLibre,
  claveAvisoTorneo,
  CLAVE_STORAGE_AVISO_NO_MOLESTAR,
  MAX_RONDAS_RECORDADAS,
  RETRASO_AVISO_MS,
} from './useAvisoNoMolestar'

function almacenEnMemoria(inicial: Record<string, string> = {}) {
  const datos = { ...inicial }
  return {
    datos,
    getItem: (k: string) => (k in datos ? datos[k] : null),
    setItem: (k: string, v: string) => { datos[k] = v },
  }
}

describe('claves por ronda', () => {
  it('ronda libre: individual y grupo comparten la clave del código', () => {
    expect(claveAvisoRondaLibre('ABC123')).toBe('ronda-libre:ABC123')
    expect(claveAvisoRondaLibre('')).toBeNull()
    expect(claveAvisoRondaLibre(undefined)).toBeNull()
  })

  it('torneo: una clave por ronda (multi-ronda vuelve a avisar en la ronda 2)', () => {
    expect(claveAvisoTorneo('r1')).toBe('torneo:r1')
    expect(claveAvisoTorneo('r2')).not.toBe(claveAvisoTorneo('r1'))
    expect(claveAvisoTorneo(null)).toBeNull()
  })
})

describe('reclamarAvisoNoMolestar — ¿mostrar en esta ronda?', () => {
  it('la primera vez sí y queda registrado; la segunda (recarga) no', () => {
    const a = almacenEnMemoria()
    expect(reclamarAvisoNoMolestar(a, 'ronda-libre:X')).toBe(true)
    expect(reclamarAvisoNoMolestar(a, 'ronda-libre:X')).toBe(false)
  })

  it('otra ronda vuelve a mostrarse', () => {
    const a = almacenEnMemoria()
    reclamarAvisoNoMolestar(a, 'ronda-libre:X')
    expect(reclamarAvisoNoMolestar(a, 'ronda-libre:Y')).toBe(true)
  })

  it('sin clave (scorer aún no listo) o sin almacenamiento: no se muestra', () => {
    expect(reclamarAvisoNoMolestar(almacenEnMemoria(), null)).toBe(false)
    expect(reclamarAvisoNoMolestar(null, 'ronda-libre:X')).toBe(false)
  })

  it('si leer el almacenamiento lanza, no se muestra y no lanza', () => {
    const roto = { getItem: () => { throw new Error('SecurityError') }, setItem: () => {} }
    expect(() => reclamarAvisoNoMolestar(roto, 'ronda-libre:X')).not.toThrow()
    expect(reclamarAvisoNoMolestar(roto, 'ronda-libre:X')).toBe(false)
  })

  it('si no se puede escribir (cuota/Safari privado), no se muestra: nunca en cada recarga', () => {
    const lleno = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') } }
    expect(reclamarAvisoNoMolestar(lleno, 'ronda-libre:X')).toBe(false)
    const mudo = { getItem: () => null, setItem: () => {} } // escribe "sin error" pero no guarda
    expect(reclamarAvisoNoMolestar(mudo, 'ronda-libre:X')).toBe(false)
  })

  it('dato corrupto se trata como vacío y se repara', () => {
    const a = almacenEnMemoria({ [CLAVE_STORAGE_AVISO_NO_MOLESTAR]: '{no es json' })
    expect(reclamarAvisoNoMolestar(a, 'ronda-libre:X')).toBe(true)
    expect(JSON.parse(a.datos[CLAVE_STORAGE_AVISO_NO_MOLESTAR])).toEqual(['ronda-libre:X'])
    const noLista = almacenEnMemoria({ [CLAVE_STORAGE_AVISO_NO_MOLESTAR]: '{"a":1}' })
    expect(reclamarAvisoNoMolestar(noLista, 'ronda-libre:X')).toBe(true)
  })

  it('recuerda como máximo las últimas MAX_RONDAS_RECORDADAS rondas', () => {
    const a = almacenEnMemoria()
    for (let i = 0; i < MAX_RONDAS_RECORDADAS + 5; i++) reclamarAvisoNoMolestar(a, `r:${i}`)
    const lista = JSON.parse(a.datos[CLAVE_STORAGE_AVISO_NO_MOLESTAR])
    expect(lista).toHaveLength(MAX_RONDAS_RECORDADAS)
    expect(lista.at(-1)).toBe(`r:${MAX_RONDAS_RECORDADAS + 4}`)
    // La ronda en curso (la más reciente) sigue recordada.
    expect(reclamarAvisoNoMolestar(a, `r:${MAX_RONDAS_RECORDADAS + 4}`)).toBe(false)
  })
})

describe('useAvisoNoMolestar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    localStorage.clear()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('se abre tras el retardo (el scorer pinta primero) y cerrar lo cierra', () => {
    const { result } = renderHook(() => useAvisoNoMolestar('ronda-libre:A'))
    expect(result.current.abierto).toBe(false)
    act(() => { vi.advanceTimersByTime(RETRASO_AVISO_MS) })
    expect(result.current.abierto).toBe(true)
    act(() => result.current.cerrar())
    expect(result.current.abierto).toBe(false)
  })

  it('al volver a montar la misma ronda (recarga) no se abre', () => {
    const primero = renderHook(() => useAvisoNoMolestar('ronda-libre:A'))
    act(() => { vi.advanceTimersByTime(RETRASO_AVISO_MS) })
    primero.unmount()
    const segundo = renderHook(() => useAvisoNoMolestar('ronda-libre:A'))
    act(() => { vi.advanceTimersByTime(RETRASO_AVISO_MS * 2) })
    expect(segundo.result.current.abierto).toBe(false)
  })

  it('con clave null (scorer no listo) no se abre ni gasta la ronda', () => {
    const { result, rerender } = renderHook(({ c }) => useAvisoNoMolestar(c), { initialProps: { c: null as string | null } })
    act(() => { vi.advanceTimersByTime(RETRASO_AVISO_MS * 2) })
    expect(result.current.abierto).toBe(false)
    expect(localStorage.getItem(CLAVE_STORAGE_AVISO_NO_MOLESTAR)).toBeNull()
    rerender({ c: 'torneo:r1' })
    act(() => { vi.advanceTimersByTime(RETRASO_AVISO_MS) })
    expect(result.current.abierto).toBe(true)
  })

  it('si el scorer deja de estar listo antes del retardo, no se registra', () => {
    const { rerender } = renderHook(({ c }) => useAvisoNoMolestar(c), { initialProps: { c: 'torneo:r1' as string | null } })
    rerender({ c: null })
    act(() => { vi.advanceTimersByTime(RETRASO_AVISO_MS * 2) })
    expect(localStorage.getItem(CLAVE_STORAGE_AVISO_NO_MOLESTAR)).toBeNull()
  })

  it('si localStorage lanza, no se abre y no rompe', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    const { result } = renderHook(() => useAvisoNoMolestar('ronda-libre:A'))
    act(() => { vi.advanceTimersByTime(RETRASO_AVISO_MS) })
    expect(result.current.abierto).toBe(false)
  })
})
