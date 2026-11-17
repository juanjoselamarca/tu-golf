import { describe, it, expect } from 'vitest'
import { indiceVisible, ROTULO_INDICE, CTA_SIN_INDICE } from './indice-visible'

describe('indiceVisible', () => {
  it('muestra profiles.indice con un decimal fijo', () => {
    expect(indiceVisible({ indice: 12 })).toEqual({ estado: 'con-indice', valor: 12, texto: '12.0' })
    expect(indiceVisible({ indice: 8.46 })).toEqual({ estado: 'con-indice', valor: 8.46, texto: '8.5' })
  })

  it('un plus se escribe con "+"', () => {
    expect(indiceVisible({ indice: -1.2 })).toMatchObject({ texto: '+1.2' })
  })

  it('cero es un índice válido, no "sin índice"', () => {
    expect(indiceVisible({ indice: 0 })).toMatchObject({ estado: 'con-indice', texto: '0.0' })
  })

  it('sin índice no inventa número', () => {
    expect(indiceVisible({ indice: null })).toEqual({ estado: 'sin-indice' })
    expect(indiceVisible({ indice: undefined })).toEqual({ estado: 'sin-indice' })
    expect(indiceVisible({ indice: Number.NaN })).toEqual({ estado: 'sin-indice' })
  })

  it('rótulo y CTA: "Índice", nunca "HCP"', () => {
    expect(ROTULO_INDICE).toBe('Índice')
    expect(CTA_SIN_INDICE).toBe('Agrega tu índice')
  })
})
