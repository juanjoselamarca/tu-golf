import { beforeEach, describe, expect, it } from 'vitest'
import { leerEquiposTomados, marcarEquipoTomado } from './equipos-tomados'

describe('equipos tomados a mano (por ronda, en este teléfono)', () => {
  beforeEach(() => window.localStorage.clear())

  it('sin nada guardado: ninguno', () => {
    expect(leerEquiposTomados('ABC123').size).toBe(0)
  })

  it('marcar lo recuerda solo para esa ronda y sin repetir', () => {
    marcarEquipoTomado('ABC123', 'eq-2')
    marcarEquipoTomado('ABC123', 'eq-2')
    marcarEquipoTomado('ABC123', 'eq-3')
    expect([...leerEquiposTomados('ABC123')]).toEqual(['eq-2', 'eq-3'])
    expect(leerEquiposTomados('OTRA99').size).toBe(0)
  })

  it('dato corrupto: ninguno, sin lanzar', () => {
    window.localStorage.setItem('gp:equipos-tomados:v1:ABC123', '{no es json')
    expect(leerEquiposTomados('ABC123').size).toBe(0)
    marcarEquipoTomado('ABC123', 'eq-2')
    expect([...leerEquiposTomados('ABC123')]).toEqual(['eq-2'])
  })
})
