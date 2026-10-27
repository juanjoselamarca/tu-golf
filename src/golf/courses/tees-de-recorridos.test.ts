import { describe, expect, it } from 'vitest'
import { colorDeTee, teeEsDeLosRecorridos, teeSugerido, teesDeLosRecorridos } from './tees-de-recorridos'

// Nombres reales del catálogo de prod (26-oct-2026).
const ROCAS = ['azul_azul_blanca', 'azul_roja_azul', 'azul_roja_blanca', 'blanco_azul_blanca', 'blanco_roja_azul', 'blanco_roja_blanca', 'rojo_roja_azul']
  .map(nombre => ({ nombre }))
const MARBELLA = ['azul_andes pro_pacifico norte', 'blanco_andes pro_pacifico norte', 'blanco_pacifico norte_pacifico sur']
  .map(nombre => ({ nombre }))

describe('teeEsDeLosRecorridos', () => {
  it('reconoce la combinación sin importar el orden del nombre ni el de la elección', () => {
    // "roja_azul" no está en orden alfabético: la clave ordenada lo perdía.
    expect(teeEsDeLosRecorridos('blanco_roja_azul', ['Roja', 'Azul'])).toBe(true)
    expect(teeEsDeLosRecorridos('blanco_roja_azul', ['Azul', 'Roja'])).toBe(true)
    expect(teeEsDeLosRecorridos('blanco_roja_blanca', ['Azul', 'Roja'])).toBe(false)
  })

  it('soporta recorridos con espacio', () => {
    expect(teeEsDeLosRecorridos('azul_andes pro_pacifico norte', ['Pacifico Norte', 'Andes Pro'])).toBe(true)
    expect(teeEsDeLosRecorridos('azul_andes pro_pacifico norte', ['Pacifico Sur', 'Andes Pro'])).toBe(false)
  })

  it('no confunde un recorrido que contiene al otro', () => {
    // Con `includes` "pacifico norte_pacifico sur" contenía "norte_pacifico".
    expect(teeEsDeLosRecorridos('blanco_pacifico norte_pacifico sur', ['norte', 'pacifico'])).toBe(false)
  })

  it('sin dos recorridos elegidos no filtra', () => {
    expect(teeEsDeLosRecorridos('blanco', [])).toBe(true)
    expect(teeEsDeLosRecorridos('blanco_roja_azul', ['Roja'])).toBe(true)
  })

  it('un tee sin recorridos no es de ninguna combinación', () => {
    expect(teeEsDeLosRecorridos('blanco', ['Roja', 'Azul'])).toBe(false)
  })
})

describe('teesDeLosRecorridos', () => {
  it('deja sólo los tees de la combinación', () => {
    expect(teesDeLosRecorridos(ROCAS, ['Roja', 'Azul']).map(t => t.nombre))
      .toEqual(['azul_roja_azul', 'blanco_roja_azul', 'rojo_roja_azul'])
  })

  it('si la combinación no tiene tees publicados devuelve todos', () => {
    expect(teesDeLosRecorridos(ROCAS, ['Roja', 'Verde'])).toHaveLength(ROCAS.length)
  })
})

describe('teeSugerido', () => {
  it('mantiene el tee actual si sigue disponible (repetir ronda no lo pisa)', () => {
    expect(teeSugerido([{ nombre: 'Azul' }, { nombre: 'Blanco' }], [], 'azul')).toBe('azul')
  })

  it('al cambiar de combinación conserva el color', () => {
    expect(teeSugerido(ROCAS, ['Roja', 'Blanca'], 'azul_roja_azul')).toBe('azul_roja_blanca')
    expect(teeSugerido(MARBELLA, ['Pacifico Sur', 'Pacifico Norte'], 'blanco_andes pro_pacifico norte'))
      .toBe('blanco_pacifico norte_pacifico sur')
  })

  it('un tee genérico de la ronda anterior encuentra su color en la combinación', () => {
    expect(teeSugerido(ROCAS, ['Azul', 'Roja'], 'azul')).toBe('azul_roja_azul')
  })

  it('sin tee actual válido sugiere blanco y, si no hay, el primero', () => {
    expect(teeSugerido(ROCAS, ['Azul', 'Roja'], null)).toBe('blanco_roja_azul')
    expect(teeSugerido([{ nombre: 'Negras' }, { nombre: 'Rojo' }], [], 'dorado')).toBe('negras')
  })

  it('sin tees publicados devuelve null para que el caller conserve lo suyo', () => {
    expect(teeSugerido([], [], 'azul')).toBeNull()
  })
})

describe('colorDeTee', () => {
  it('extrae el color', () => {
    expect(colorDeTee('Blanco_norte_sur')).toBe('blanco')
    expect(colorDeTee('Negras')).toBe('negras')
  })
})
