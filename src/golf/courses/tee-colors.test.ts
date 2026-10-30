import { describe, it, expect } from 'vitest'
import {
  TEE_COLOR_OPTIONS,
  TEE_COLOR_VALUES,
  TEE_NAMES_GENERICOS,
  TEE_COLORES_EN_PROSA,
} from './tee-colors'

describe('TEE_COLOR_OPTIONS', () => {
  it('incluye el dorado (48 canchas activas del catálogo, más que las negras)', () => {
    expect(TEE_COLOR_VALUES).toContain('dorado')
    expect(TEE_NAMES_GENERICOS).toContain('dorado')
  })

  it('no repite ni colores ni nombres de catálogo', () => {
    expect(new Set(TEE_COLOR_VALUES).size).toBe(TEE_COLOR_VALUES.length)
    expect(new Set(TEE_NAMES_GENERICOS).size).toBe(TEE_NAMES_GENERICOS.length)
  })

  it('cada opción trae swatch y etiqueta', () => {
    for (const o of TEE_COLOR_OPTIONS) {
      expect(o.label, o.color).toBeTruthy()
      expect(o.swatch, o.color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})

describe('TEE_COLORES_EN_PROSA', () => {
  // El bug original fue que el banner ofrecía un color que el endpoint
  // rechazaba con 400. El mensaje de error tampoco puede nombrar una lista
  // distinta de la que valida.
  it('nombra exactamente los colores que se validan, en el mismo orden', () => {
    for (const c of TEE_COLOR_VALUES) {
      expect(TEE_COLORES_EN_PROSA, c).toContain(c)
    }
    const nombrados = TEE_COLORES_EN_PROSA.split(/,\s*| o /)
    expect(nombrados).toEqual(TEE_COLOR_VALUES)
  })

  it('usa "o" antes del último y comas en el resto', () => {
    expect(TEE_COLORES_EN_PROSA).toBe('negro, dorado, azul, blanco o rojo')
  })
})
