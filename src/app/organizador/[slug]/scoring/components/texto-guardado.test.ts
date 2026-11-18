import { describe, expect, it } from 'vitest'
import { textoAvisoHoyo, textoBotonCierre, textoChipPendientes, textoDescartablesOtras } from './texto-guardado'

const nombres: Record<string, string> = { ra: 'Ana', rb: 'Beto' }
const nombre = (r: string) => nombres[r] ?? null

describe('texto-guardado', () => {
  it('chip: cuenta sin confirmar y rechazados, no lo que está saliendo', () => {
    expect(textoChipPendientes([{ roundId: 'ra', hole: 1, estado: 'guardando' }], 'ra', nombre)).toBeNull()
    expect(textoChipPendientes([
      { roundId: 'ra', hole: 1, estado: 'sin_confirmar' },
      { roundId: 'ra', hole: 2, estado: 'sin_confirmar' },
      { roundId: 'ra', hole: 3, estado: 'rechazado' },
    ], 'ra', nombre)).toBe('Sin señal: 2 hoyos sin confirmar · 1 hoyo no se guardó')
  })

  it('chip: con nombre cuando los hoyos son de otra tarjeta', () => {
    expect(textoChipPendientes([
      { roundId: 'ra', hole: 18, estado: 'sin_confirmar' },
      { roundId: 'rb', hole: 1, estado: 'sin_confirmar' },
    ], 'rb', nombre)).toBe('Sin señal: 2 hoyos sin confirmar (Ana)')
  })

  it('aviso de hoyo con motivo sólo si fue rechazado', () => {
    expect(textoAvisoHoyo(4, { estado: 'sin_confirmar', motivo: null })).toBe('Hoyo 4: sin confirmar')
    expect(textoAvisoHoyo(4, { estado: 'rechazado', motivo: 'sin_sesion' })).toBe('Hoyo 4: no se guardó (tu sesión venció)')
  })

  it('botón de cierre', () => {
    const c = { roundId: 'ra', playerId: 'pa', nombre: 'Ana', fase: 'guardando' as const, hoyos: [18] }
    expect(textoBotonCierre(null, true)).toBe('Finalizar ronda ✓')
    expect(textoBotonCierre(c, true)).toBe('Terminando de guardar… hoyo 18')
    expect(textoBotonCierre({ ...c, fase: 'cerrando', hoyos: [] }, true)).toBe('Cerrando tarjeta…')
    expect(textoBotonCierre(c, false)).toBe('Cerrando tarjeta de Ana…')
  })
})

describe('textoDescartablesOtras', () => {
  it('nombra cada tarjeta con sus hoyos', () => {
    expect(textoDescartablesOtras([{ nombre: 'Ana', holes: [3, 4] }, { nombre: null, holes: [2] }]))
      .toBe('Ana: hoyos 3, 4 · Otra tarjeta: hoyo 2')
  })
})
