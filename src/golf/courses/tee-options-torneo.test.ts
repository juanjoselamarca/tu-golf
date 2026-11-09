import { describe, it, expect } from 'vitest'
import { opcionesDeTeeDelTorneo } from './tee-options-torneo'
import type { CourseTees } from './category-tee-options'

const cancha = (nombres: string[]): CourseTees[] => [
  { courseId: 'c1', courseName: 'The Lakes', tees: nombres.map(nombre => ({ nombre })) },
]

describe('opcionesDeTeeDelTorneo', () => {
  it('ofrece los tees reales de la cancha, dorado incluido', () => {
    const o = opcionesDeTeeDelTorneo(cancha(['negras', 'dorado', 'azul', 'blanco', 'rojo']), null)
    expect(o.map(x => x.value)).toEqual(['negras', 'dorado', 'azul', 'blanco', 'rojo'])
    expect(o.every(x => x.delCatalogo)).toBe(true)
    expect(o[1].label).toBe('Dorado')
  })

  it('no ofrece un tee que la cancha no tiene', () => {
    const o = opcionesDeTeeDelTorneo(cancha(['blanco', 'rojo']), null)
    expect(o.map(x => x.value)).toEqual(['blanco', 'rojo'])
    expect(o.some(x => x.value === 'negras')).toBe(false)
  })

  it('sin tees en el catálogo cae a los genéricos, que incluyen dorado', () => {
    const o = opcionesDeTeeDelTorneo([], null)
    expect(o.map(x => x.value)).toEqual(['negras', 'dorado', 'azul', 'blanco', 'rojo'])
    expect(o.every(x => x.delCatalogo)).toBe(false)
  })

  it('el tee ya guardado aparece aunque no esté en el catálogo, al final', () => {
    const o = opcionesDeTeeDelTorneo(cancha(['blanco', 'rojo']), 'dorado')
    expect(o.map(x => x.value)).toEqual(['blanco', 'rojo', 'dorado'])
    expect(o[2].delCatalogo).toBe(false)
  })

  it('el tee guardado no se duplica cuando sí está en el catálogo (otra caja)', () => {
    const o = opcionesDeTeeDelTorneo(cancha(['Negras', 'Azul']), 'negras')
    expect(o.map(x => x.value)).toEqual(['negras', 'azul'])
  })

  it('guarda en minúsculas aunque el catálogo traiga mayúsculas', () => {
    const o = opcionesDeTeeDelTorneo(cancha(['Dorado']), null)
    expect(o[0]).toMatchObject({ value: 'dorado', label: 'Dorado' })
  })

  it('canchas 27h: conserva los loops en el valor y los formatea en la etiqueta', () => {
    const o = opcionesDeTeeDelTorneo(cancha(['azul_norte_sur']), null)
    expect(o[0]).toMatchObject({ value: 'azul_norte_sur', label: 'Azul · norte / sur' })
  })

  it('un tee guardado vacío no agrega una opción fantasma', () => {
    expect(opcionesDeTeeDelTorneo(cancha(['blanco']), '  ')).toHaveLength(1)
  })

  // `tournaments.tees` guarda un MODO en todo torneo creado por el wizard
  // (18 de 45 en prod al 30-oct). No es un tee: no puede salir como botón.
  it.each(['per_player', 'manual', 'mixed', 'per_category'])(
    'el modo %s NO se ofrece como si fuera un tee',
    (modo) => {
      const o = opcionesDeTeeDelTorneo(cancha(['blanco', 'azul']), modo)
      expect(o.map(x => x.value)).toEqual(['blanco', 'azul'])
    },
  )

  it('un modo tampoco se cuela cuando la cancha no tiene tees cargados', () => {
    const o = opcionesDeTeeDelTorneo([], 'per_player')
    expect(o.map(x => x.value)).not.toContain('per_player')
    expect(o.every(x => !x.delCatalogo)).toBe(true)
  })

  it('un tee que SOLO se parece a un modo sigue apareciendo', () => {
    const o = opcionesDeTeeDelTorneo(cancha(['blanco']), 'manualito')
    expect(o.map(x => x.value)).toEqual(['blanco', 'manualito'])
  })
})
