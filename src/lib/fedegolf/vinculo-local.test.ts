import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordarNoVinculado,
  sabemosQueNoEstaVinculado,
  olvidarVinculo,
  NO_VINCULADO_TTL_MS,
} from './vinculo-local'

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

describe('vinculo-local', () => {
  let s: Storage
  beforeEach(() => {
    s = memStorage()
  })

  it('sin memo → no sabemos', () => expect(sabemosQueNoEstaVinculado('u1', 0, s)).toBe(false))

  it('memo vigente → no vinculado', () => {
    recordarNoVinculado('u1', 1000, s)
    expect(sabemosQueNoEstaVinculado('u1', 1000 + NO_VINCULADO_TTL_MS - 1, s)).toBe(true)
  })

  it('memo vencido → vuelve a preguntar', () => {
    recordarNoVinculado('u1', 1000, s)
    expect(sabemosQueNoEstaVinculado('u1', 1000 + NO_VINCULADO_TTL_MS, s)).toBe(false)
  })

  it('es por usuario', () => {
    recordarNoVinculado('u1', 1000, s)
    expect(sabemosQueNoEstaVinculado('u2', 1000, s)).toBe(false)
  })

  it('olvidarVinculo borra el memo', () => {
    recordarNoVinculado('u1', 1000, s)
    olvidarVinculo('u1', s)
    expect(sabemosQueNoEstaVinculado('u1', 1000, s)).toBe(false)
  })

  it('valor corrupto → no sabemos', () => {
    s.setItem('gp:fedegolf-no-vinculado:u1', 'basura')
    expect(sabemosQueNoEstaVinculado('u1', 1000, s)).toBe(false)
  })

  it('storage que lanza (modo privado) → no rompe y no sabemos', () => {
    const roto = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
      removeItem: () => {
        throw new Error('denied')
      },
    } as unknown as Storage
    expect(() => recordarNoVinculado('u1', 0, roto)).not.toThrow()
    expect(() => olvidarVinculo('u1', roto)).not.toThrow()
    expect(sabemosQueNoEstaVinculado('u1', 0, roto)).toBe(false)
  })
})
