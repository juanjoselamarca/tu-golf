import { describe, it, expect } from 'vitest'
import { avisoYaMostrado, marcarAvisoMostrado } from './aviso-local'

function memStorage(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size
    },
  }
}

describe('aviso-local', () => {
  it('un cambio no visto → no mostrado; tras marcarlo → mostrado', () => {
    const s = memStorage()
    expect(avisoYaMostrado('u1', '2026-10-19T09:00:00Z', s)).toBe(false)
    marcarAvisoMostrado('u1', '2026-10-19T09:00:00Z', s)
    expect(avisoYaMostrado('u1', '2026-10-19T09:00:00Z', s)).toBe(true)
  })

  it('un cambio nuevo (otra fecha) se vuelve a avisar', () => {
    const s = memStorage()
    marcarAvisoMostrado('u1', '2026-10-19T09:00:00Z', s)
    expect(avisoYaMostrado('u1', '2026-10-20T09:00:00Z', s)).toBe(false)
  })

  it('es por usuario', () => {
    const s = memStorage()
    marcarAvisoMostrado('u1', 'f', s)
    expect(avisoYaMostrado('u2', 'f', s)).toBe(false)
  })

  it('storage que lanza → no rompe y avisa', () => {
    const roto = { getItem: () => { throw new Error('x') }, setItem: () => { throw new Error('x') } } as unknown as Storage
    expect(() => marcarAvisoMostrado('u1', 'f', roto)).not.toThrow()
    expect(avisoYaMostrado('u1', 'f', roto)).toBe(false)
  })
})
