import { describe, it, expect } from 'vitest'
import { getYardajeForTee, type HoleData } from './ronda'

const holeBase = { numero: 5, par: 4, stroke_index: 3 }

describe('getYardajeForTee — yardage per-player tee (BUG #2 #16)', () => {
  it('retorna yardaje del tee específico del jugador', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: 350,
      yardajes: { negras: 420, azul: 390, blanco: 350, rojo: 310 },
    }
    expect(getYardajeForTee(hole, 'negras')).toBe(420)
    expect(getYardajeForTee(hole, 'campeonato')).toBe(420) // alias defensivo
    expect(getYardajeForTee(hole, 'azul')).toBe(390)
    expect(getYardajeForTee(hole, 'blanco')).toBe(350)
    expect(getYardajeForTee(hole, 'rojo')).toBe(310)
  })

  it('acepta aliases en inglés', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: null,
      yardajes: { negras: 420, azul: 390, blanco: 350, rojo: 310 },
    }
    expect(getYardajeForTee(hole, 'black')).toBe(420)
    expect(getYardajeForTee(hole, 'blue')).toBe(390)
    expect(getYardajeForTee(hole, 'white')).toBe(350)
    expect(getYardajeForTee(hole, 'red')).toBe(310)
  })

  it('negro (alias defensivo) mapea a negras', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: null,
      yardajes: { negras: 420, azul: 390, blanco: 350, rojo: 310 },
    }
    expect(getYardajeForTee(hole, 'negro')).toBe(420)
  })

  it('case-insensitive', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: null,
      yardajes: { negras: 420, azul: 390, blanco: 350, rojo: 310 },
    }
    expect(getYardajeForTee(hole, 'AZUL')).toBe(390)
    expect(getYardajeForTee(hole, 'Blanco')).toBe(350)
  })

  it('sin fallback: tee del jugador con dato null → null', () => {
    // Mostrar yardaje de OTRO tee a una jugadora desde rojo es información errónea.
    // Mejor mostrar "—" en UI que un metro equivocado.
    const hole: HoleData = {
      ...holeBase,
      yardaje: 999,
      yardajes: { negras: null, azul: null, blanco: null, rojo: null },
    }
    expect(getYardajeForTee(hole, 'azul')).toBe(null)
  })

  it('sin cascade: tee desconocido → null aunque haya datos en otros tees', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: null,
      yardajes: { azul: 300, blanco: 280 },
    }
    // Tee desconocido → sin match específico → null (no cascade)
    expect(getYardajeForTee(hole, 'naranja')).toBe(null)
    const hole2: HoleData = { ...holeBase, yardaje: null, yardajes: { blanco: 280 } }
    expect(getYardajeForTee(hole2, 'naranja')).toBe(null)
  })

  it('sin yardajes map: retorna null (legacy yardaje ignorado)', () => {
    const hole: HoleData = { ...holeBase, yardaje: 400 }
    expect(getYardajeForTee(hole, 'azul')).toBe(null)
    expect(getYardajeForTee(hole, null)).toBe(null)
  })

  it('retorna null para hole undefined/null', () => {
    expect(getYardajeForTee(null, 'azul')).toBe(null)
    expect(getYardajeForTee(undefined, 'azul')).toBe(null)
  })

  it('retorna null si todos los yardajes son null y no hay fallback', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: null,
      yardajes: {},
    }
    expect(getYardajeForTee(hole, 'azul')).toBe(null)
  })

  it('tee null/undefined → null (sin cascade)', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: 300,
      yardajes: { azul: 350, blanco: 340 },
    }
    // No hay key para mapear → null (no cascade a yardaje legacy ni a otros tees)
    expect(getYardajeForTee(hole, null)).toBe(null)
    expect(getYardajeForTee(hole, undefined)).toBe(null)
  })
})
