import { describe, it, expect } from 'vitest'
import { getYardajeForTee, type HoleData } from './ronda'

const holeBase = { numero: 5, par: 4, stroke_index: 3 }

describe('getYardajeForTee — yardage per-player tee (BUG #2 #16)', () => {
  it('retorna yardaje del tee específico del jugador', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: 350,
      yardajes: { campeonato: 420, azul: 390, blanco: 350, rojo: 310 },
    }
    expect(getYardajeForTee(hole, 'campeonato')).toBe(420)
    expect(getYardajeForTee(hole, 'azul')).toBe(390)
    expect(getYardajeForTee(hole, 'blanco')).toBe(350)
    expect(getYardajeForTee(hole, 'rojo')).toBe(310)
  })

  it('acepta aliases en inglés', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: null,
      yardajes: { campeonato: 420, azul: 390, blanco: 350, rojo: 310 },
    }
    expect(getYardajeForTee(hole, 'black')).toBe(420)
    expect(getYardajeForTee(hole, 'blue')).toBe(390)
    expect(getYardajeForTee(hole, 'white')).toBe(350)
    expect(getYardajeForTee(hole, 'red')).toBe(310)
  })

  it('negro (sinónimo chileno) mapea a campeonato', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: null,
      yardajes: { campeonato: 420, azul: 390, blanco: 350, rojo: 310 },
    }
    expect(getYardajeForTee(hole, 'negro')).toBe(420)
  })

  it('case-insensitive', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: null,
      yardajes: { campeonato: 420, azul: 390, blanco: 350, rojo: 310 },
    }
    expect(getYardajeForTee(hole, 'AZUL')).toBe(390)
    expect(getYardajeForTee(hole, 'Blanco')).toBe(350)
  })

  it('fallback a legacy yardaje si el tee específico es null', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: 999,
      yardajes: { campeonato: null, azul: null, blanco: null, rojo: null },
    }
    expect(getYardajeForTee(hole, 'azul')).toBe(999)
  })

  it('fallback cascade azul → blanco cuando no hay nada más', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: null,
      yardajes: { azul: 300, blanco: 280 },
    }
    // Tee desconocido → sin match específico → cascade
    expect(getYardajeForTee(hole, 'naranja')).toBe(300)
    // Si ni siquiera azul está
    const hole2: HoleData = { ...holeBase, yardaje: null, yardajes: { blanco: 280 } }
    expect(getYardajeForTee(hole2, 'naranja')).toBe(280)
  })

  it('compat: retorna legacy yardaje si no hay yardajes map', () => {
    const hole: HoleData = { ...holeBase, yardaje: 400 }
    expect(getYardajeForTee(hole, 'azul')).toBe(400)
    expect(getYardajeForTee(hole, null)).toBe(400)
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

  it('tee null/undefined usa cascade de fallbacks', () => {
    const hole: HoleData = {
      ...holeBase,
      yardaje: 300,
      yardajes: { azul: 350, blanco: 340 },
    }
    // No hay key para mapear → usa yardaje legacy
    expect(getYardajeForTee(hole, null)).toBe(300)
    expect(getYardajeForTee(hole, undefined)).toBe(300)
  })
})
