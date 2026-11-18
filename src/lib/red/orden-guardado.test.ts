import { describe, expect, it } from 'vitest'
import { isUuid } from '@/lib/uuid'
import { idDeDispositivo, uuidDesdeAleatorios } from './orden-guardado'

describe('orden-guardado · id del dispositivo', () => {
  it('sin randomUUID (iOS < 15.4) arma un UUID v4 válido con getRandomValues: el servidor guarda CON orden', () => {
    const id = idDeDispositivo({ getRandomValues: (<T extends ArrayBufferView | null>(b: T) => {
      ;(b as unknown as Uint8Array).fill(0xab)
      return b
    }) as Crypto['getRandomValues'] })
    expect(isUuid(id)).toBe(true)
    expect(id!.charAt(14)).toBe('4')
    expect('89ab').toContain(id!.charAt(19))
  })

  it('con randomUUID lo usa; sin crypto es null', () => {
    expect(idDeDispositivo({ randomUUID: () => '11111111-2222-4333-8444-555555555555' })).toBe('11111111-2222-4333-8444-555555555555')
    expect(idDeDispositivo(undefined)).toBeNull()
  })

  it('dos ids de getRandomValues reales son distintos', () => {
    const gv = (b: Uint8Array) => crypto.getRandomValues(b)
    expect(uuidDesdeAleatorios(gv)).not.toBe(uuidDesdeAleatorios(gv))
  })
})
