import { describe, it, expect } from 'vitest'
import { etiquetaDelResultadoDeEquipos, juegaContraElPar } from './resultado-de-equipos'

describe('etiquetaDelResultadoDeEquipos', () => {
  it('un solo equipo juega contra el par: no le gana a nadie, ni empata', () => {
    expect(etiquetaDelResultadoDeEquipos(1, false)).toBe('Contra el par')
    expect(etiquetaDelResultadoDeEquipos(1, true)).toBe('Contra el par')
    expect(juegaContraElPar(1)).toBe(true)
  })

  it('con rival hay ganador o empate', () => {
    expect(etiquetaDelResultadoDeEquipos(2, false)).toBe('Equipo ganador')
    expect(etiquetaDelResultadoDeEquipos(2, true)).toBe('Empate')
    expect(juegaContraElPar(2)).toBe(false)
  })
})
