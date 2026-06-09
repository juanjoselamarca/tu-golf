import { describe, it, expect } from 'vitest'
import { getCpiColor, getCpiLabel, getPlayerTier } from './perfilFormat'

describe('getCpiColor', () => {
  it('verde >=75', () => expect(getCpiColor(80)).toBe('#16a34a'))
  it('rojo <25', () => expect(getCpiColor(10)).toBe('#dc2626'))
})
describe('getCpiLabel', () => {
  it('Estable en 40-59', () => expect(getCpiLabel(50)).toBe('Estable'))
})
describe('getPlayerTier', () => {
  it('null → en construcción', () => expect(getPlayerTier(null)).toBe('Perfil en construcción'))
  it('<=5 → avanzado', () => expect(getPlayerTier(4)).toBe('Competidor avanzado'))
  it('>20 → activo', () => expect(getPlayerTier(25)).toBe('Jugador activo'))
})
