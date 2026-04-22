import { describe, it, expect } from 'vitest'
import { getUltimaRondaReciente, type RondaConScores } from './ultima-ronda'

const mk = (
  overrides: Partial<RondaConScores> & Pick<RondaConScores, 'id' | 'fecha'>,
): RondaConScores => ({
  id: overrides.id,
  codigo: overrides.codigo ?? 'ABC123',
  course_name: overrides.course_name ?? 'Los Leones',
  fecha: overrides.fecha,
  estado: overrides.estado ?? 'finalizada',
  total_gross: overrides.total_gross ?? 82,
  vsPar: overrides.vsPar ?? 10,
  scores: overrides.scores ?? null,
  parPerHole: overrides.parPerHole ?? null,
})

describe('getUltimaRondaReciente', () => {
  it('retorna null con array vacío', () => {
    expect(getUltimaRondaReciente([], '2026-04-21')).toBeNull()
  })

  it('retorna null si ninguna fecha coincide con fechaHoy', () => {
    const rondas = [
      mk({ id: '1', fecha: '2026-04-20' }),
      mk({ id: '2', fecha: '2026-04-19' }),
    ]
    expect(getUltimaRondaReciente(rondas, '2026-04-21')).toBeNull()
  })

  it('retorna la ronda si hay una sola con fecha === hoy', () => {
    const rondas = [
      mk({ id: '1', fecha: '2026-04-20' }),
      mk({ id: '2', fecha: '2026-04-21' }),
    ]
    const result = getUltimaRondaReciente(rondas, '2026-04-21')
    expect(result?.id).toBe('2')
  })

  it('retorna la primera del array si hay múltiples con fecha de hoy', () => {
    const rondas = [
      mk({ id: 'first', fecha: '2026-04-21' }),
      mk({ id: 'second', fecha: '2026-04-21' }),
    ]
    const result = getUltimaRondaReciente(rondas, '2026-04-21')
    expect(result?.id).toBe('first')
  })

  it('usa comparación estricta de string ISO (no parsing de Date)', () => {
    const rondas = [mk({ id: '1', fecha: '2026-04-21' })]
    expect(getUltimaRondaReciente(rondas, '2026-04-21')).not.toBeNull()
    expect(getUltimaRondaReciente(rondas, '2026-4-21')).toBeNull()
    expect(getUltimaRondaReciente(rondas, '2026-04-22')).toBeNull()
  })
})
