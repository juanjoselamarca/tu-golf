import { describe, it, expect, beforeEach } from 'vitest'
import { borrarClavesConPrefijo } from './local-storage-prefijo'

beforeEach(() => localStorage.clear())

describe('borrarClavesConPrefijo', () => {
  it('borra todas las claves con el prefijo, también las contiguas, y ninguna otra', () => {
    for (const k of ['p_1', 'p_2', 'x', 'p_3', 'q_p_1']) localStorage.setItem(k, '1')
    borrarClavesConPrefijo('p_')
    expect(Object.keys(localStorage).sort()).toEqual(['q_p_1', 'x'])
  })

  it('un prefijo vacío no borra nada (borraría todo el storage)', () => {
    localStorage.setItem('a', '1')
    borrarClavesConPrefijo('')
    expect(localStorage.getItem('a')).toBe('1')
  })
})
