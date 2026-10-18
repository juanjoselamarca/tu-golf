import { describe, it, expect } from 'vitest'
import {
  tournamentStatusLabel, tournamentStatusTone, tournamentStatusBadge, torneoAceptaScores, jugadorFueraDelTorneo, visorPuedeAnotar, motivoSinScores,
} from './tournament-status'

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

describe('torneoAceptaScores', () => {
  it('solo un torneo en curso acepta golpes (lo mismo que exige /api/game)', () => {
    expect(torneoAceptaScores('in_progress')).toBe(true)
    expect(torneoAceptaScores('active')).toBe(true)
    for (const s of ['draft', 'open', 'closed', 'published', '', null, undefined]) {
      expect(torneoAceptaScores(s)).toBe(false)
    }
  })
})

describe('jugadorFueraDelTorneo', () => {
  it('retirado y descalificado quedan fuera; inscrito o sin estado, no', () => {
    expect(jugadorFueraDelTorneo('withdrawn')).toBe(true)
    expect(jugadorFueraDelTorneo('disqualified')).toBe(true)
    for (const s of ['registered', 'approved', 'pending', '', null, undefined]) {
      expect(jugadorFueraDelTorneo(s)).toBe(false)
    }
  })
})

describe('visorPuedeAnotar — el jugador inscrito llega al scorer del torneo', () => {
  const enCurso = { status: 'in_progress', es_demo: false }
  it('inscrito con el torneo en curso: sí', () => {
    expect(visorPuedeAnotar({ status: 'approved' }, enCurso)).toBe(true)
    expect(visorPuedeAnotar({ status: null }, enCurso)).toBe(true)
  })
  it('no inscrito, retirado o descalificado: no', () => {
    expect(visorPuedeAnotar(null, enCurso)).toBe(false)
    expect(visorPuedeAnotar({ status: 'withdrawn' }, enCurso)).toBe(false)
    expect(visorPuedeAnotar({ status: 'disqualified' }, enCurso)).toBe(false)
  })
  it('torneo con inscripciones abiertas, cerrado o demo: no', () => {
    expect(visorPuedeAnotar({ status: 'approved' }, { status: 'open' })).toBe(false)
    expect(visorPuedeAnotar({ status: 'approved' }, { status: 'closed' })).toBe(false)
    expect(visorPuedeAnotar({ status: 'approved' }, { ...enCurso, es_demo: true })).toBe(false)
  })
})

describe('motivoSinScores', () => {
  it('en curso no hay motivo: se anota', () => {
    expect(motivoSinScores('in_progress')).toBeNull()
    expect(motivoSinScores('active')).toBeNull()
  })

  // Reproducido en prod (18-oct): torneo con inscripciones abiertas a 62 días, el scorer avisaba "Torneo cerrado".
  it('borrador e inscripciones abiertas = todavía no empieza (no "cerrado")', () => {
    expect(motivoSinScores('open')).toBe('no_empezo')
    expect(motivoSinScores('draft')).toBe('no_empezo')
  })

  it('cerrado, publicado o desconocido = cerrado: nunca promete que va a empezar', () => {
    expect(motivoSinScores('closed')).toBe('cerrado')
    expect(motivoSinScores('published')).toBe('cerrado')
    expect(motivoSinScores('cancelado')).toBe('cerrado')
    expect(motivoSinScores(null)).toBe('cerrado')
  })

  it('coincide con torneoAceptaScores: motivo null ⇔ acepta scores', () => {
    for (const s of ['draft', 'open', 'in_progress', 'active', 'closed', 'published', null]) {
      expect(motivoSinScores(s) === null).toBe(torneoAceptaScores(s))
    }
  })
})
