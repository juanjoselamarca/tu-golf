import { describe, it, expect } from 'vitest'
import { tournamentConfigPartialSchema } from './schema'
import { describeFieldPath, describeIssues, humanizeFieldPath, type FieldIssue } from './field-labels'

describe('humanizeFieldPath', () => {
  it('traduce paths conocidos y cae al último segmento', () => {
    expect(humanizeFieldPath('registration.max_players')).toBe('cupo máx.')
    expect(humanizeFieldPath('rounds.0.course_id')).toBe('cancha')
    expect(humanizeFieldPath('algo.sin_label')).toBe('sin label')
  })
})

describe('describeFieldPath', () => {
  it('numera los items de listas desde 1', () => {
    expect(describeFieldPath(['prizes', 0, 'description'])).toBe('premio 1 · descripción')
    expect(describeFieldPath(['categories', 2, 'name'])).toBe('categoría 3 · nombre')
    expect(describeFieldPath(['registration', 'max_players'])).toBe('inscripción · cupo máx.')
    expect(describeFieldPath(['name'])).toBe('nombre')
  })
})

describe('describeIssues — issues reales de zod v4', () => {
  const issuesOf = (partial: unknown): FieldIssue[] => {
    const r = tournamentConfigPartialSchema.safeParse(partial)
    return r.success ? [] : (r.error.issues as unknown as FieldIssue[])
  }

  it('descripción de premio vacía → obligatorio', () => {
    expect(describeIssues(issuesOf({ prizes: [{ id: 'p1', description: '' }] }))).toBe(
      'premio 1 · descripción: obligatorio',
    )
  })

  it('hoyo 0/19 y decimales → mínimo/máximo/entero', () => {
    expect(describeIssues(issuesOf({ prizes: [{ id: 'p1', hole_number: 0 }] }))).toBe('premio 1 · hoyo: mínimo 1')
    expect(describeIssues(issuesOf({ prizes: [{ id: 'p1', hole_number: 19 }] }))).toBe('premio 1 · hoyo: máximo 18')
    expect(describeIssues(issuesOf({ team_config: { min_drives_per_player: 1.5 } }))).toBe(
      'equipos · mín. drives: debe ser un número entero',
    )
  })

  it('varios issues se unen sin repetir', () => {
    const msg = describeIssues(issuesOf({ name: 3, prizes: [{ id: 'p1', description: '' }] }))
    expect(msg).toBe('nombre: debe ser texto; premio 1 · descripción: obligatorio')
  })
})
