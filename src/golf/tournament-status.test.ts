import { describe, it, expect } from 'vitest'
import {
  badgeDelTorneo, badgeDelStatusEscrito, contarInscritos, torneoAceptaScores, jugadorFueraDelTorneo, visorPuedeAnotar, motivoSinScores, torneoInscribible, motivoNoInscribible, gruposFijos,
} from './tournament-status'

// Mediodía de Chile del 17-nov-2026 (15:00 UTC).
const AHORA = new Date('2026-11-17T15:00:00Z')
const HOY = '2026-11-17'
const label = (status: string | null | undefined, audience: 'player' | 'organizer' = 'player') =>
  badgeDelTorneo({ status, date_start: HOY, date_end: null }, AHORA, audience).label

describe('badgeDelTorneo · label (torneo de hoy)', () => {
  it('NO anuncia inscripciones abiertas sobre un borrador (bug del preview 20-jul)', () => {
    // Regresión exacta: layout.tsx comparaba contra 'finished'/'active' —
    // status inexistentes — así que TODO torneo caía al else "Inscripciones
    // abiertas", incluido un draft.
    expect(label('draft')).not.toBe(label('open'))
    expect(label('draft')).toBe('Inscripciones aún no abiertas')
  })

  it('cubre los status reales de la base para el jugador', () => {
    expect(label('draft')).toBe('Inscripciones aún no abiertas')
    expect(label('open')).toBe('Inscripciones abiertas')
    expect(label('in_progress')).toBe('En vivo')
    expect(label('closed')).toBe('Finalizado')
    expect(label('published')).toBe('Finalizado')
  })

  it('trata "active" como sinónimo histórico de in_progress', () => {
    expect(label('active')).toBe(label('in_progress'))
  })

  it('usa vocabulario de organizador cuando se pide', () => {
    expect(label('draft', 'organizer')).toBe('Borrador')
    expect(label('in_progress', 'organizer')).toBe('En curso')
    expect(label('closed', 'organizer')).toBe('Cerrado')
    expect(label('published', 'organizer')).toBe('Publicado')
  })

  it('ante un status desconocido no afirma nada falso', () => {
    for (const s of ['', 'cualquier_cosa', null, undefined]) {
      expect(label(s)).toBe('Torneo')
      expect(label(s, 'organizer')).toBe('Borrador')
    }
  })
})

describe('badgeDelTorneo · cierre automático (auditoría 16-nov)', () => {
  it('in_progress de abril que nadie cerró → "Finalizado" en listas, "Resultados provisorios" en la ficha, "Por cerrar" para el organizador', () => {
    const zombie = { status: 'in_progress', date_start: '2026-04-20', date_end: null }
    expect(badgeDelTorneo(zombie, AHORA).label).toBe('Finalizado')
    expect(badgeDelTorneo(zombie, AHORA).tone).toBe('closed')
    expect(badgeDelTorneo(zombie, AHORA, 'player', 'ficha').label).toBe('Resultados provisorios')
    expect(badgeDelTorneo(zombie, AHORA, 'organizer').label).toBe('Por cerrar')
    expect(badgeDelTorneo({ ...zombie, status: 'active' }, AHORA, 'organizer').label).toBe('Por cerrar')
  })

  it('cerrado por escrito: "Finalizado" también en la ficha; nunca "Por cerrar"', () => {
    const cerrado = { status: 'closed', date_start: '2026-04-20' }
    expect(badgeDelTorneo(cerrado, AHORA, 'player', 'ficha').label).toBe('Finalizado')
    expect(badgeDelTorneo(cerrado, AHORA, 'organizer').label).toBe('Cerrado')
  })

  it('open vencido (nunca se inició, caso "LB OPEN 30-oct"): "Sin iniciar" / "Fecha vencida", nunca Finalizado ni Por cerrar', () => {
    const vencido = { status: 'open', date_start: '2026-10-30', date_end: null }
    for (const vista of ['lista', 'ficha'] as const) {
      expect(badgeDelTorneo(vencido, AHORA, 'player', vista).label).toBe('Sin iniciar')
      expect(badgeDelTorneo(vencido, AHORA, 'organizer', vista).label).toBe('Fecha vencida')
    }
    expect(badgeDelTorneo(vencido, AHORA).tone).toBe('neutral')
    expect(badgeDelTorneo(vencido, AHORA).estado).toBe('vencido')
  })

  it('in_progress con fecha futura → "Por jugar", nunca "En vivo"', () => {
    const b = badgeDelTorneo({ status: 'in_progress', date_start: '2028-03-01', date_end: null }, AHORA)
    expect(b.label).toBe('Por jugar')
    expect(b.tone).toBe('open')
  })
})

describe('badgeDelTorneo · tono y tokens', () => {
  it('da un tono distinto a cada situación que el jugador debe distinguir', () => {
    const tono = (s: string) => badgeDelTorneo({ status: s, date_start: HOY }, AHORA).tone
    expect(tono('in_progress')).toBe('live')
    expect(tono('open')).toBe('open')
    expect(tono('closed')).toBe('closed')
    expect(tono('draft')).toBe('neutral')
    // Pintar de verde-vivo algo que no está en vivo es peor que no pintarlo.
    expect(tono('lo_que_sea')).toBe('neutral')
  })

  it('devuelve label + tokens CSS, nunca hex inline', () => {
    const badge = badgeDelTorneo({ status: 'in_progress', date_start: HOY }, AHORA, 'organizer')
    expect(badge.label).toBe('En curso')
    expect(badge.bg).toBe('var(--status-live-bg)')
    expect(badge.fg).toBe('var(--status-live-fg)')
  })

  it('todos los status reales resuelven a tokens, no a undefined', () => {
    for (const s of ['draft', 'open', 'in_progress', 'closed', 'published']) {
      const badge = badgeDelTorneo({ status: s, date_start: HOY }, AHORA)
      expect(badge.bg).toMatch(/^var\(--status-/)
      expect(badge.fg).toMatch(/^var\(--status-/)
      expect(badge.label).toBeTruthy()
    }
  })
})

describe('badgeDelStatusEscrito (pantallas operativas del organizador)', () => {
  it('refleja el status escrito aunque la fecha haya pasado: coincide con lo que acepta el servidor', () => {
    expect(badgeDelStatusEscrito('in_progress', 'organizer').label).toBe('En curso')
    expect(badgeDelStatusEscrito('open', 'organizer').label).toBe('Inscripciones abiertas')
    expect(badgeDelStatusEscrito('closed', 'organizer').label).toBe('Cerrado')
    expect(badgeDelStatusEscrito(null, 'organizer').label).toBe('Borrador')
  })
})

describe('contarInscritos', () => {
  it('cuenta solo aprobados: retirados, pendientes y lista de espera no son jugadores del torneo', () => {
    const jugadores = [
      { status: 'approved' }, { status: 'approved' }, { status: 'withdrawn' },
      { status: 'pending' }, { status: 'waitlist' }, { status: 'disqualified' }, { status: null },
    ]
    expect(contarInscritos(jugadores)).toBe(2)
    expect(contarInscritos([])).toBe(0)
    expect(contarInscritos(null)).toBe(0)
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
  const enCurso = { status: 'in_progress', date_start: HOY, es_demo: false }
  it('inscrito con el torneo en curso: sí', () => {
    expect(visorPuedeAnotar({ status: 'approved' }, enCurso, AHORA)).toBe(true)
    expect(visorPuedeAnotar({ status: null }, enCurso, AHORA)).toBe(true)
  })
  it('no inscrito, retirado o descalificado: no', () => {
    expect(visorPuedeAnotar(null, enCurso, AHORA)).toBe(false)
    expect(visorPuedeAnotar({ status: 'withdrawn' }, enCurso, AHORA)).toBe(false)
    expect(visorPuedeAnotar({ status: 'disqualified' }, enCurso, AHORA)).toBe(false)
  })
  it('torneo con inscripciones abiertas, cerrado o demo: no', () => {
    expect(visorPuedeAnotar({ status: 'approved' }, { status: 'open', date_start: HOY }, AHORA)).toBe(false)
    expect(visorPuedeAnotar({ status: 'approved' }, { status: 'closed', date_start: HOY }, AHORA)).toBe(false)
    expect(visorPuedeAnotar({ status: 'approved' }, { ...enCurso, es_demo: true }, AHORA)).toBe(false)
  })
  it('anotar tarde: dentro de los 2 días de gracia sí; pasada la gracia ("Resultados provisorios") no', () => {
    expect(visorPuedeAnotar({ status: 'approved' }, { status: 'in_progress', date_start: '2026-11-15' }, AHORA)).toBe(true)
    expect(visorPuedeAnotar({ status: 'approved' }, { status: 'in_progress', date_start: '2026-11-14' }, AHORA)).toBe(false)
  })
  it('organizador lo inició antes de la fecha: se ofrece (el servidor lo acepta)', () => {
    expect(visorPuedeAnotar({ status: 'approved' }, { status: 'in_progress', date_start: '2026-11-20' }, AHORA)).toBe(true)
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

describe('gruposFijos (#810)', () => {
  const sinTarjeta = [{ ronda_libre_id: null }, { ronda_libre_id: null }]
  const conTarjeta = [{ ronda_libre_id: null }, { ronda_libre_id: 'r1' }]

  it('antes del inicio, sin tarjetas, los grupos se pueden rearmar', () => {
    expect(gruposFijos('draft', sinTarjeta)).toBe(false)
    expect(gruposFijos('open', sinTarjeta)).toBe(false)
    expect(gruposFijos('open', [])).toBe(false)
  })

  it('con el torneo en juego o terminado quedan fijos, aunque la lista no traiga tarjetas', () => {
    for (const s of ['in_progress', 'active', 'closed', 'published']) {
      expect(gruposFijos(s, sinTarjeta)).toBe(true)
    }
  })

  it('un grupo con tarjeta los fija aunque el estado leído siga en "open" (pestaña vieja)', () => {
    expect(gruposFijos('open', conTarjeta)).toBe(true)
  })

  it('status desconocido o vacío: fijos (no se afirma que se puede rearmar)', () => {
    expect(gruposFijos(null, sinTarjeta)).toBe(true)
    expect(gruposFijos('raro', sinTarjeta)).toBe(true)
  })
})

describe('torneoInscribible / motivoNoInscribible — fuente única de la inscripción', () => {
  it('open por jugar (o sin fecha, o dentro de la gracia) → inscribible', () => {
    expect(torneoInscribible({ status: 'open', date_start: '2026-11-20' }, AHORA)).toBe(true)
    expect(torneoInscribible({ status: 'open', date_start: null }, AHORA)).toBe(true)
    expect(torneoInscribible({ status: 'open', date_start: '2026-11-15' }, AHORA)).toBe(true)
  })
  it('open vencido → fecha_vencida (caso "LB OPEN 30-oct")', () => {
    expect(motivoNoInscribible({ status: 'open', date_start: '2026-10-30' }, AHORA)).toBe('fecha_vencida')
    expect(torneoInscribible({ status: 'open', date_start: '2026-10-30' }, AHORA)).toBe(false)
  })
  it('draft → borrador; cualquier otro status → cerrado', () => {
    expect(motivoNoInscribible({ status: 'draft', date_start: '2026-11-20' }, AHORA)).toBe('borrador')
    for (const status of ['in_progress', 'active', 'closed', 'published', 'cancelled', '', null]) {
      expect(motivoNoInscribible({ status, date_start: '2026-11-20' }, AHORA)).toBe('cerrado')
    }
  })
})
