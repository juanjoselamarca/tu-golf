import { describe, it, expect } from 'vitest'
import { torneoEnVivo, estadoDelTorneo, fechaHoyChile, GRACE_DIAS_TORNEO, fechasAlIniciar, sumarDias, diaDeCierreDelTorneo } from './tournament-live-status'

const HOY = new Date('2026-06-11T15:00:00') // hora local del test

describe('torneoEnVivo', () => {
  it('no en progreso → nunca en vivo', () => {
    expect(torneoEnVivo('draft', '2026-06-11', null, HOY)).toBe(false)
    expect(torneoEnVivo('closed', '2026-06-11', null, HOY)).toBe(false)
    expect(torneoEnVivo('published', '2026-06-11', null, HOY)).toBe(false)
    expect(torneoEnVivo(null, '2026-06-11', null, HOY)).toBe(false)
  })

  it('in_progress hoy → en vivo', () => {
    expect(torneoEnVivo('in_progress', '2026-06-11', null, HOY)).toBe(true)
    expect(torneoEnVivo('active', '2026-06-11', null, HOY)).toBe(true)
  })

  it('in_progress con fecha FUTURA → NO en vivo (no empezó)', () => {
    // El caso real del test de personas: 30-oct-2026 marcado EN VIVO el 11-jun.
    expect(torneoEnVivo('in_progress', '2026-10-30', null, HOY)).toBe(false)
    expect(torneoEnVivo('in_progress', '2026-06-12', null, HOY)).toBe(false) // mañana
  })

  it('in_progress con fecha de hace meses → NO en vivo (abandonado)', () => {
    expect(torneoEnVivo('in_progress', '2026-05-12', null, HOY)).toBe(false)
    expect(torneoEnVivo('in_progress', '2026-03-30', null, HOY)).toBe(false)
  })

  it('multi-día real: hoy entre date_start y date_end → en vivo', () => {
    expect(torneoEnVivo('in_progress', '2026-06-10', '2026-06-13', HOY)).toBe(true)
    expect(torneoEnVivo('in_progress', '2026-06-11', '2026-06-11', HOY)).toBe(true)
  })

  it('gracia: terminó hace ≤ GRACE_DIAS → sigue en vivo; más → no', () => {
    const finHaceGrace = '2026-06-09' // 2 días atrás
    expect(torneoEnVivo('in_progress', finHaceGrace, finHaceGrace, HOY)).toBe(true)
    const finHaceGracePlus1 = '2026-06-08' // 3 días atrás
    expect(GRACE_DIAS_TORNEO).toBe(2)
    expect(torneoEnVivo('in_progress', finHaceGracePlus1, finHaceGracePlus1, HOY)).toBe(false)
  })

  it('sin date_start (dato viejo) → fail-open, respeta el status', () => {
    expect(torneoEnVivo('in_progress', null, null, HOY)).toBe(true)
    expect(torneoEnVivo('draft', null, null, HOY)).toBe(false)
  })

  it('dato corrupto date_end < date_start: arranca hoy → sigue en vivo (no esconder)', () => {
    // Fechas invertidas: date_end en el pasado, date_start hoy. No esconder el evento.
    expect(torneoEnVivo('in_progress', '2026-06-11', '2026-01-01', HOY)).toBe(true)
  })

  it('tolera timestamps completos en date_start/date_end (slice a YYYY-MM-DD)', () => {
    expect(torneoEnVivo('in_progress', '2026-06-11T08:00:00Z', null, HOY)).toBe(true)
    expect(torneoEnVivo('in_progress', '2026-10-30T00:00:00Z', null, HOY)).toBe(false)
  })
})

describe('estadoDelTorneo — fuente única del estado que se muestra', () => {
  // Mediodía de Chile del 17-nov-2026 (verano: UTC-3).
  const AHORA = new Date('2026-11-17T15:00:00Z')
  const e = (status: string | null, date_start: string | null, date_end: string | null = null, ahora = AHORA) =>
    estadoDelTorneo({ status, date_start, date_end }, ahora)

  it('zombie de abril (in_progress, nadie lo cerró) → finalizado', () => {
    expect(e('in_progress', '2026-04-20')).toBe('finalizado')
    expect(e('active', '2026-04-22')).toBe('finalizado')
  })

  it('open con fecha pasada hace más de 48 h → vencido (nunca se inició: no es un finalizado); dentro de la gracia → por jugar', () => {
    expect(e('open', '2026-10-30')).toBe('vencido')
    expect(e('open', '2026-11-01', '2026-11-14')).toBe('vencido')
    expect(e('open', '2026-11-15')).toBe('por_jugar') // 2 días: aún dentro
  })

  it('cierre a las 48 h: un torneo del sábado 14 sigue en curso el lunes 16 y se cierra el martes 17', () => {
    expect(e('in_progress', '2026-11-15')).toBe('en_curso') // terminó hace 2 días
    expect(e('in_progress', '2026-11-14')).toBe('finalizado') // hace 3 días
  })

  it('varios días: cuenta desde la ÚLTIMA fecha, no desde la primera', () => {
    expect(e('in_progress', '2026-11-01', '2026-11-16')).toBe('en_curso')
    expect(e('in_progress', '2026-11-01', '2026-11-14')).toBe('finalizado')
    // En la mitad del torneo, con la primera fecha hace semanas.
    expect(e('in_progress', '2026-10-20', '2026-11-20')).toBe('en_curso')
  })

  it('sin fecha → respeta el status (no esconde un evento real ni inventa uno)', () => {
    expect(e('in_progress', null)).toBe('en_curso')
    expect(e('open', null)).toBe('por_jugar')
    expect(e('closed', null)).toBe('finalizado')
    expect(e('draft', null)).toBe('borrador')
  })

  it('fecha en el futuro (2028) → por jugar, aunque esté in_progress', () => {
    expect(e('in_progress', '2028-03-01')).toBe('por_jugar')
    expect(e('open', '2028-03-01')).toBe('por_jugar')
  })

  it('closed / published / finished → finalizado aunque la fecha sea hoy o futura', () => {
    expect(e('closed', '2026-11-17')).toBe('finalizado')
    expect(e('published', '2028-01-01')).toBe('finalizado')
    expect(e('finished', '2026-11-17')).toBe('finalizado')
  })

  it('draft o status desconocido → borrador, sin importar la fecha', () => {
    expect(e('draft', '2026-04-20')).toBe('borrador')
    expect(e('lo_que_sea', '2026-11-17')).toBe('borrador')
    expect(e(null, '2026-11-17')).toBe('borrador')
  })

  it('fechas invertidas (date_end < date_start) no cierran antes de tiempo', () => {
    expect(e('in_progress', '2026-11-17', '2026-01-01')).toBe('en_curso')
  })

  it('rondas activas pasadas las 48 h no lo reviven: la regla no las mira (decisión documentada)', () => {
    // "Copa cabros" en prod: ronda in_progress colgada desde abril. Solo status + fechas.
    expect(estadoDelTorneo({ status: 'in_progress', date_start: '2026-04-20' }, AHORA)).toBe('finalizado')
  })

  describe('zona horaria: el día es el de Chile, no el del servidor (UTC)', () => {
    it('22:30 de Chile del martes 17 = 01:30 UTC del miércoles 18: sigue siendo el 17', () => {
      const nocheChile = new Date('2026-11-18T01:30:00Z')
      expect(fechaHoyChile(nocheChile)).toBe('2026-11-17')
      // Torneo del sábado 14: el martes en la noche de Chile se ve finalizado, pero uno
      // del domingo 15 todavía está dentro de la gracia (el servidor en UTC lo cerraba).
      expect(e('in_progress', '2026-11-15', null, nocheChile)).toBe('en_curso')
    })

    it('00:30 de Chile del miércoles 18 = 03:30 UTC: ya es el 18', () => {
      const madrugada = new Date('2026-11-18T03:30:00Z')
      expect(fechaHoyChile(madrugada)).toBe('2026-11-18')
      expect(e('in_progress', '2026-11-15', null, madrugada)).toBe('finalizado')
    })

    it('torneo de mañana visto a las 23:00 de Chile (02:00 UTC de mañana) no se ve en curso', () => {
      const noche = new Date('2026-11-18T02:00:00Z') // 23:00 del 17 en Chile
      expect(e('in_progress', '2026-11-18', null, noche)).toBe('por_jugar')
    })

    it('invierno (UTC-4): 23:30 del 10-jun en Chile = 03:30 UTC del 11', () => {
      expect(fechaHoyChile(new Date('2026-06-11T03:30:00Z'))).toBe('2026-06-10')
    })
  })
})

describe('fechasAlIniciar — postergado por lluvia e iniciado en la cancha', () => {
  const MEDIODIA = new Date('2026-06-11T16:00:00Z') // 12:00 en Chile, 11-jun

  it('iniciado 3 días después → se corre a hoy y queda EN CURSO', () => {
    const t = { status: 'open', date_start: '2026-06-08', date_end: '2026-06-08' }
    expect(estadoDelTorneo({ ...t, status: 'in_progress' }, MEDIODIA)).toBe('finalizado') // el bug sin correr fechas
    const f = fechasAlIniciar(t, MEDIODIA)
    expect(f).toEqual({ date_start: '2026-06-11', date_end: '2026-06-11', delta: 3 })
    expect(estadoDelTorneo({ status: 'in_progress', ...f! }, MEDIODIA)).toBe('en_curso')
  })

  it('después de la última fecha: conserva la duración de un torneo de varios días', () => {
    expect(fechasAlIniciar({ date_start: '2026-06-05', date_end: '2026-06-06' }, MEDIODIA))
      .toEqual({ date_start: '2026-06-11', date_end: '2026-06-12', delta: 6 })
  })

  it('después de la última fecha sin date_end: corre solo date_start', () => {
    expect(fechasAlIniciar({ date_start: '2026-06-01', date_end: null }, MEDIODIA))
      .toEqual({ date_start: '2026-06-11', date_end: null, delta: 10 })
  })

  it('un día iniciado al día siguiente (carga desde papel): se corre a hoy', () => {
    expect(fechasAlIniciar({ date_start: '2026-06-10', date_end: '2026-06-10' }, MEDIODIA))
      .toEqual({ date_start: '2026-06-11', date_end: '2026-06-11', delta: 1 })
  })

  it('sábado–domingo 06-06/06-07 iniciado el 06-09: corre a 06-09/06-10', () => {
    expect(fechasAlIniciar({ date_start: '2026-06-06', date_end: '2026-06-07' }, new Date('2026-06-09T16:00:00Z')))
      .toEqual({ date_start: '2026-06-09', date_end: '2026-06-10', delta: 3 })
  })

  it('dentro del rango: sábado–domingo iniciado el domingo no se desplaza', () => {
    expect(fechasAlIniciar({ date_start: '2026-06-10', date_end: '2026-06-11' }, MEDIODIA)).toBeNull()
  })

  it('un día iniciado el mismo día no se desplaza', () => {
    expect(fechasAlIniciar({ date_start: '2026-06-11', date_end: '2026-06-11' }, MEDIODIA)).toBeNull()
  })

  it('hoy, futuro o sin fecha → no mueve nada', () => {
    expect(fechasAlIniciar({ date_start: '2026-06-11' }, MEDIODIA)).toBeNull()
    expect(fechasAlIniciar({ date_start: '2026-06-20' }, MEDIODIA)).toBeNull()
    expect(fechasAlIniciar({ date_start: null }, MEDIODIA)).toBeNull()
  })

  it('usa el día de Chile: 23:30 del 10-jun en Chile → 06-07 está a 3 días, no a 4', () => {
    expect(fechasAlIniciar({ date_start: '2026-06-07' }, new Date('2026-06-11T03:30:00Z'))?.date_start).toBe('2026-06-10')
  })

  it('sumarDias cruza fin de mes', () => {
    expect(sumarDias('2026-06-29', 3)).toBe('2026-07-02')
  })
})

describe('diaDeCierreDelTorneo (fuente única del día de cierre)', () => {
  it('torneo del sábado → martes (fin + gracia + 1)', () => {
    expect(diaDeCierreDelTorneo({ status: 'in_progress', date_start: '2026-11-14' })).toBe('2026-11-17')
    expect(diaDeCierreDelTorneo({ status: 'in_progress', date_start: '2026-11-13', date_end: '2026-11-14' })).toBe('2026-11-17')
  })

  it('fechas invertidas: cuenta desde date_start (no cierra antes de tiempo)', () => {
    expect(diaDeCierreDelTorneo({ status: 'in_progress', date_start: '2026-11-14', date_end: '2026-11-10' })).toBe('2026-11-17')
  })

  it('sin fecha → null', () => {
    expect(diaDeCierreDelTorneo({ status: 'in_progress', date_start: null })).toBeNull()
  })

  it('estadoDelTorneo cambia exactamente el día de cierre (hora de Chile)', () => {
    const t = { status: 'in_progress', date_start: '2026-11-14' }
    // 23:59 del lunes 16 en Chile (UTC-3) = 02:59Z del 17.
    expect(estadoDelTorneo(t, new Date('2026-11-17T02:59:00Z'))).toBe('en_curso')
    // 00:01 del martes 17 en Chile.
    expect(estadoDelTorneo(t, new Date('2026-11-17T03:01:00Z'))).toBe('finalizado')
    expect(fechaHoyChile(new Date('2026-11-17T03:01:00Z'))).toBe(diaDeCierreDelTorneo(t))
  })
})
