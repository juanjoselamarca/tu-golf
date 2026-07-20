import { describe, it, expect } from 'vitest'
import { tournamentStatusLabel, tournamentStatusTone, tournamentStatusBadge } from './tournament-status'

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

describe('tournamentStatusTone', () => {
  it('da un tono distinto a cada situación que el jugador debe distinguir', () => {
    expect(tournamentStatusTone('in_progress')).toBe('live')
    expect(tournamentStatusTone('open')).toBe('open')
    expect(tournamentStatusTone('closed')).toBe('closed')
    expect(tournamentStatusTone('draft')).toBe('neutral')
  })

  it('status desconocido cae a neutral, nunca a "en vivo"', () => {
    // Pintar de verde-vivo algo que no está en vivo es peor que no pintarlo.
    expect(tournamentStatusTone('lo_que_sea')).toBe('neutral')
    expect(tournamentStatusTone(null)).toBe('neutral')
  })
})

describe('tournamentStatusBadge', () => {
  it('devuelve label + tokens CSS, nunca hex inline', () => {
    const badge = tournamentStatusBadge('in_progress', 'organizer')
    expect(badge.label).toBe('En curso')
    expect(badge.bg).toBe('var(--status-live-bg)')
    expect(badge.fg).toBe('var(--status-live-fg)')
  })

  it('todos los status reales resuelven a tokens, no a undefined', () => {
    // Regresión: el switch de LiveHeader no era exhaustivo y devolvía undefined
    // si el status se ensanchaba a open/published.
    for (const s of ['draft', 'open', 'in_progress', 'closed', 'published']) {
      const badge = tournamentStatusBadge(s)
      expect(badge.bg).toMatch(/^var\(--status-/)
      expect(badge.fg).toMatch(/^var\(--status-/)
      expect(badge.label).toBeTruthy()
    }
  })
})
