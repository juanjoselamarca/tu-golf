import { describe, it, expect } from 'vitest'
import { tournamentStatusLabel } from './tournament-status'

describe('tournamentStatusLabel', () => {
  it('NO anuncia inscripciones abiertas sobre un borrador (bug del preview 20-jul)', () => {
    // Regresión exacta: layout.tsx comparaba contra 'finished'/'active' —
    // status inexistentes — así que TODO torneo caía al else "Inscripciones
    // abiertas", incluido un draft.
    expect(tournamentStatusLabel('draft')).not.toBe(tournamentStatusLabel('open'))
    expect(tournamentStatusLabel('draft')).toBe('Inscripciones aún no abiertas')
  })

  it('cubre los status reales de la base para el jugador', () => {
    expect(tournamentStatusLabel('draft')).toBe('Inscripciones aún no abiertas')
    expect(tournamentStatusLabel('open')).toBe('Inscripciones abiertas')
    expect(tournamentStatusLabel('in_progress')).toBe('En vivo')
    expect(tournamentStatusLabel('closed')).toBe('Finalizado')
    expect(tournamentStatusLabel('published')).toBe('Finalizado')
  })

  it('trata "active" como sinónimo histórico de in_progress', () => {
    expect(tournamentStatusLabel('active')).toBe(tournamentStatusLabel('in_progress'))
  })

  it('usa vocabulario de organizador cuando se pide', () => {
    expect(tournamentStatusLabel('draft', 'organizer')).toBe('Borrador')
    expect(tournamentStatusLabel('in_progress', 'organizer')).toBe('En curso')
    expect(tournamentStatusLabel('closed', 'organizer')).toBe('Cerrado')
  })

  it('ante un status desconocido no afirma nada falso', () => {
    for (const s of ['', 'cualquier_cosa', null, undefined]) {
      expect(tournamentStatusLabel(s)).toBe('Torneo')
      expect(tournamentStatusLabel(s, 'organizer')).toBe('Borrador')
    }
  })
})
