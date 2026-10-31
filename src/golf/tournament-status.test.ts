import { describe, it, expect } from 'vitest'
import {
  tournamentStatusLabel, tournamentStatusTone, tournamentStatusBadge, torneoAceptaScores, jugadorFueraDelTorneo, visorPuedeAnotar, motivoSinScores,
  PLAYER_STATUSES, JUGADOR_FUERA_STATUSES, JUGADOR_EN_TORNEO_STATUSES, torneoFueraDelBorrador, TORNEO_BORRADOR_STATUS,
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

describe('los estados del JUGADOR, repartidos desde una sola lista', () => {
  // `PLAYER_STATUSES` tiene que espejar el CHECK `players_status_check` del baseline. Si una
  // migración agrega un estado y acá no, el nuevo queda fuera de la tabla, de los grupos y del
  // leaderboard sin que nada avise — y era peor antes: el literal ['pending','approved','waitlist']
  // estaba copiado a mano en leaderboard.ts, scoring.ts y tvBoard.ts.
  it('espeja el CHECK de la tabla, sin repetidos', () => {
    expect([...PLAYER_STATUSES].sort()).toEqual(
      ['approved', 'disqualified', 'pending', 'waitlist', 'withdrawn'].sort(),
    )
    expect(new Set(PLAYER_STATUSES).size).toBe(PLAYER_STATUSES.length)
  })

  it('los que siguen dentro son EXACTAMENTE el complemento de los que quedan fuera', () => {
    const fuera = new Set<string>(JUGADOR_FUERA_STATUSES)
    expect([...JUGADOR_EN_TORNEO_STATUSES]).toEqual(PLAYER_STATUSES.filter((e) => !fuera.has(e)))
    // Ninguno en los dos lados, y entre los dos cubren todos: un estado no puede quedarse sin bando.
    for (const e of PLAYER_STATUSES) {
      expect(fuera.has(e) !== (JUGADOR_EN_TORNEO_STATUSES as readonly string[]).includes(e), e).toBe(true)
    }
    expect(JUGADOR_FUERA_STATUSES.length + JUGADOR_EN_TORNEO_STATUSES.length).toBe(PLAYER_STATUSES.length)
  })

  // El valor concreto que las tres consultas usaban a mano. Si la derivación se rompe, esto lo caza.
  it('hoy son pending, approved y waitlist', () => {
    expect([...JUGADOR_EN_TORNEO_STATUSES]).toEqual(['pending', 'approved', 'waitlist'])
  })

  it('jugadorFueraDelTorneo coincide con las listas', () => {
    for (const e of PLAYER_STATUSES) {
      expect(jugadorFueraDelTorneo(e), e).toBe((JUGADOR_FUERA_STATUSES as readonly string[]).includes(e))
    }
    // Un estado que no existe no deja a nadie fuera: no se descalifica a alguien por un dato raro.
    expect(jugadorFueraDelTorneo('inventado')).toBe(false)
    expect(jugadorFueraDelTorneo(null)).toBe(false)
  })
})

describe('torneoFueraDelBorrador', () => {
  // Decide el candado del formato (`tournament-config-locks.ts`): desde que el torneo sale del
  // borrador ya hay inscritos, grupos y equipos armados con el formato elegido.
  it('solo el borrador está dentro del borrador', () => {
    expect(torneoFueraDelBorrador(TORNEO_BORRADOR_STATUS)).toBe(false)
    for (const s of ['open', 'in_progress', 'active', 'closed', 'published']) {
      expect(torneoFueraDelBorrador(s), s).toBe(true)
    }
  })

  it('un status desconocido cuenta como fuera: no se afirma que sigue privado sin saberlo', () => {
    expect(torneoFueraDelBorrador('archivado_2027')).toBe(true)
  })

  it('el borrador es el status real de la base', () => {
    expect(TORNEO_BORRADOR_STATUS).toBe('draft')
    expect(tournamentStatusLabel(TORNEO_BORRADOR_STATUS, 'organizer')).toBe('Borrador')
  })
})
