import { describe, it, expect } from 'vitest'
import {
  decisionDeCierre,
  cierrePrevisto,
  DIAS_AVISO_ANTES_DEL_CIERRE,
  HORAS_MINIMAS_DE_AVISO,
  HORAS_SIN_ANOTAR_PARA_CERRAR,
  type TorneoParaCierre,
} from './tournament-auto-close'

// Noviembre: Chile en horario de verano, UTC-3. 10:00 de Chile = 13:00Z (hora del cron).
const chile = (dia: string, hora = '10:00') => new Date(`${dia}T${hora}:00-03:00`)

// Torneo del sábado 14-nov → aviso el lunes 16, cierre el martes 17.
const base: TorneoParaCierre = {
  status: 'in_progress',
  date_start: '2026-11-14',
  date_end: null,
  aviso_cierre_enviado_at: null,
  cierre_automatico: true,
  es_demo: false,
}
const con = (cambios: Partial<TorneoParaCierre>): TorneoParaCierre => ({ ...base, ...cambios })
const avisadoEl = (dia: string, hora = '10:00') => chile(dia, hora).toISOString()

describe('constantes', () => {
  it('son las del plan (aviso un día antes, 20 h de aviso, 24 h sin anotar)', () => {
    expect(DIAS_AVISO_ANTES_DEL_CIERRE).toBe(1)
    expect(HORAS_MINIMAS_DE_AVISO).toBe(20)
    expect(HORAS_SIN_ANOTAR_PARA_CERRAR).toBe(24)
  })
})

describe('decisionDeCierre: semana normal (sábado → martes)', () => {
  it('sábado, domingo: nada', () => {
    expect(decisionDeCierre(base, null, chile('2026-11-14'))).toBe('nada')
    expect(decisionDeCierre(base, null, chile('2026-11-15'))).toBe('nada')
  })

  it('lunes (cierre − 1) sin aviso: avisar', () => {
    expect(decisionDeCierre(base, null, chile('2026-11-16'))).toBe('avisar')
  })

  it('lunes con el aviso ya enviado: esperar', () => {
    expect(decisionDeCierre(con({ aviso_cierre_enviado_at: avisadoEl('2026-11-16') }), null, chile('2026-11-16', '12:00'))).toBe('esperar_aviso')
  })

  it('martes con aviso de 24 h y sin anotaciones: cerrar', () => {
    expect(decisionDeCierre(con({ aviso_cierre_enviado_at: avisadoEl('2026-11-16') }), null, chile('2026-11-17'))).toBe('cerrar')
  })

  it('martes con aviso de menos de 20 h (aviso tardío del lunes en la noche): esperar', () => {
    const t = con({ aviso_cierre_enviado_at: avisadoEl('2026-11-16', '22:00') })
    expect(decisionDeCierre(t, null, chile('2026-11-17', '10:00'))).toBe('esperar_aviso') // 12 h
    expect(decisionDeCierre(t, null, chile('2026-11-17', '18:00'))).toBe('cerrar') // 20 h exactas
  })

  it('anotación en las últimas 24 h: aplaza, también el aviso', () => {
    const hace2h = chile('2026-11-17', '08:00').toISOString()
    expect(decisionDeCierre(con({ aviso_cierre_enviado_at: avisadoEl('2026-11-16') }), hace2h, chile('2026-11-17'))).toBe('aplazar_por_actividad')
    expect(decisionDeCierre(base, chile('2026-11-16', '09:00').toISOString(), chile('2026-11-16'))).toBe('aplazar_por_actividad')
  })

  it('anotación de hace más de 24 h no frena', () => {
    const hace25h = chile('2026-11-16', '09:00').toISOString()
    expect(decisionDeCierre(con({ aviso_cierre_enviado_at: avisadoEl('2026-11-16') }), hace25h, chile('2026-11-17'))).toBe('cerrar')
  })

  it('anotación con fecha futura (reloj corrido) o ilegible: aplaza (lado seguro)', () => {
    const t = con({ aviso_cierre_enviado_at: avisadoEl('2026-11-16') })
    expect(decisionDeCierre(t, chile('2026-11-18').toISOString(), chile('2026-11-17'))).toBe('aplazar_por_actividad')
    expect(decisionDeCierre(t, 'basura', chile('2026-11-17'))).toBe('aplazar_por_actividad')
  })
})

describe('decisionDeCierre: borde de medianoche en Chile', () => {
  it('domingo 21:00–23:59 de Chile ya es lunes en UTC, pero sigue siendo domingo: nada', () => {
    expect(decisionDeCierre(base, null, chile('2026-11-15', '21:30'))).toBe('nada')
    expect(decisionDeCierre(base, null, chile('2026-11-15', '23:59'))).toBe('nada')
  })

  it('lunes 00:01 de Chile: avisar', () => {
    expect(decisionDeCierre(base, null, chile('2026-11-16', '00:01'))).toBe('avisar')
  })

  it('lunes 23:30 Chile → martes 19:30 Chile: 20 h, cerrar; a las 19:00 no', () => {
    const t = con({ aviso_cierre_enviado_at: avisadoEl('2026-11-16', '23:30') })
    expect(decisionDeCierre(t, null, chile('2026-11-17', '19:00'))).toBe('esperar_aviso')
    expect(decisionDeCierre(t, null, chile('2026-11-17', '19:30'))).toBe('cerrar')
  })
})

describe('decisionDeCierre: el cron falla o la fecha cambia', () => {
  it('cron caído el lunes: el martes avisa (aunque sea el día de cierre) y el miércoles cierra', () => {
    expect(decisionDeCierre(base, null, chile('2026-11-17'))).toBe('avisar')
    expect(decisionDeCierre(con({ aviso_cierre_enviado_at: avisadoEl('2026-11-17') }), null, chile('2026-11-18'))).toBe('cerrar')
  })

  it('cron caído dos días: el miércoles avisa, el jueves cierra (nunca cierra sin aviso)', () => {
    expect(decisionDeCierre(base, null, chile('2026-11-18'))).toBe('avisar')
    expect(decisionDeCierre(con({ aviso_cierre_enviado_at: avisadoEl('2026-11-18') }), null, chile('2026-11-19'))).toBe('cerrar')
  })

  it('fecha movida al futuro: el aviso viejo no vale; nada hasta el nuevo cierre − 1, ahí avisa de nuevo', () => {
    const t = con({ date_start: '2026-11-21', aviso_cierre_enviado_at: avisadoEl('2026-11-16') })
    expect(decisionDeCierre(t, null, chile('2026-11-17'))).toBe('nada')
    expect(decisionDeCierre(t, null, chile('2026-11-23'))).toBe('avisar')
    expect(decisionDeCierre(t, null, chile('2026-11-24'))).toBe('avisar')
  })

  it('torneo de varios días: cuenta desde date_end', () => {
    const t = con({ date_start: '2026-11-13', date_end: '2026-11-15' })
    expect(decisionDeCierre(t, null, chile('2026-11-16'))).toBe('nada')
    expect(decisionDeCierre(t, null, chile('2026-11-17'))).toBe('avisar')
  })

  it('fechas invertidas: cuenta desde date_start (no cierra antes de tiempo)', () => {
    const t = con({ date_start: '2026-11-14', date_end: '2026-11-01' })
    expect(decisionDeCierre(t, null, chile('2026-11-15'))).toBe('nada')
    expect(decisionDeCierre(t, null, chile('2026-11-16'))).toBe('avisar')
  })

  it('aviso con fecha ilegible: se vuelve a avisar', () => {
    expect(decisionDeCierre(con({ aviso_cierre_enviado_at: 'basura' }), null, chile('2026-11-17'))).toBe('avisar')
  })
})

describe('decisionDeCierre: torneos que no se cierran solos', () => {
  const tarde = chile('2026-11-20')
  it.each([
    ['open vencido (nunca se inició)', con({ status: 'open' })],
    ['draft', con({ status: 'draft' })],
    ['ya cerrado', con({ status: 'closed' })],
    ['publicado', con({ status: 'published' })],
    ['status nulo', con({ status: null })],
    ['demo', con({ es_demo: true })],
    ['excluido (cierre_automatico = false)', con({ cierre_automatico: false })],
    ['sin fecha', con({ date_start: null })],
  ])('%s: nada', (_, t) => {
    expect(decisionDeCierre(t, null, tarde)).toBe('nada')
  })

  it("'active' (sinónimo histórico de in_progress) sí se cierra", () => {
    expect(decisionDeCierre(con({ status: 'active' }), null, chile('2026-11-16'))).toBe('avisar')
  })
})

describe('cierrePrevisto', () => {
  it('día de cierre y días que faltan (hora de Chile)', () => {
    expect(cierrePrevisto(base, chile('2026-11-14'))).toEqual({ dia: '2026-11-17', diasFaltan: 3 })
    expect(cierrePrevisto(base, chile('2026-11-16'))).toEqual({ dia: '2026-11-17', diasFaltan: 1 })
    expect(cierrePrevisto(base, chile('2026-11-16', '23:30'))).toEqual({ dia: '2026-11-17', diasFaltan: 1 })
  })

  it('no aplica (no se cierra solo) → null', () => {
    expect(cierrePrevisto(con({ status: 'closed' }), chile('2026-11-16'))).toBeNull()
    expect(cierrePrevisto(con({ cierre_automatico: false }), chile('2026-11-16'))).toBeNull()
    expect(cierrePrevisto(con({ es_demo: true }), chile('2026-11-16'))).toBeNull()
    expect(cierrePrevisto(con({ date_start: null }), chile('2026-11-16'))).toBeNull()
  })
})
