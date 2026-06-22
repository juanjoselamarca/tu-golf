import { describe, it, expect } from 'vitest'
import { isSendKey } from './ChatInput'

describe('isSendKey — Enter envía, Shift+Enter salta de línea', () => {
  it('Enter sin Shift → envía', () => {
    expect(isSendKey('Enter', false)).toBe(true)
  })

  it('Shift+Enter → NO envía (salto de línea)', () => {
    expect(isSendKey('Enter', true)).toBe(false)
  })

  it('otras teclas no envían', () => {
    expect(isSendKey('a', false)).toBe(false)
    expect(isSendKey(' ', false)).toBe(false)
    expect(isSendKey('Tab', false)).toBe(false)
  })
})
