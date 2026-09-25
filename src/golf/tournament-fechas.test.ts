import { describe, it, expect } from 'vitest'
import {
  FECHA_TORNEO_MARGEN_FUTURO_DIAS,
  FECHA_TORNEO_MARGEN_PASADO_DIAS,
  fechaISO,
  limitesFechaTorneo,
  parseFechaISO,
  validarFechaTorneo,
  validarFechasDeTorneo,
} from './tournament-fechas'

// "Hoy" fijo: los tests no pueden depender del reloj.
const HOY = new Date('2026-09-25T15:30:00-03:00')

function ronda(round_number: number, date: string | null) {
  return { round_number, date, course_id: 'c', hole_count: 18 as const, tee_assignment_mode: 'per_player' as const }
}

describe('parseFechaISO — fecha de calendario estricta', () => {
  it('acepta YYYY-MM-DD reales', () => {
    expect(parseFechaISO('2026-09-25')?.toISOString()).toBe('2026-09-25T00:00:00.000Z')
  })
  it('rechaza formato distinto, vacío y null', () => {
    expect(parseFechaISO('25-09-2026')).toBeNull()
    expect(parseFechaISO('2026-9-25')).toBeNull()
    expect(parseFechaISO('')).toBeNull()
    expect(parseFechaISO(null)).toBeNull()
  })
  it('rechaza fechas que no existen (no normaliza a marzo)', () => {
    expect(parseFechaISO('2026-02-30')).toBeNull()
    expect(parseFechaISO('2026-13-01')).toBeNull()
    expect(parseFechaISO('2026-04-31')).toBeNull()
  })
  it('acepta el 29 de febrero sólo en bisiesto', () => {
    expect(parseFechaISO('2028-02-29')).not.toBeNull()
    expect(parseFechaISO('2026-02-29')).toBeNull()
  })
})

describe('limitesFechaTorneo', () => {
  it('min = hoy − 365 días, max = hoy + 730 días, en calendario', () => {
    const { min, max } = limitesFechaTorneo(HOY)
    expect(min).toBe('2025-09-25')
    expect(max).toBe('2028-09-24')
    expect(FECHA_TORNEO_MARGEN_PASADO_DIAS).toBe(365)
    expect(FECHA_TORNEO_MARGEN_FUTURO_DIAS).toBe(730)
  })
  it('fechaISO es la inversa de parseFechaISO', () => {
    expect(fechaISO(parseFechaISO('2026-01-05')!)).toBe('2026-01-05')
  })
})

describe('validarFechaTorneo — los reportes del inbox', () => {
  it('01-01-0001 (ronda) y 01-01-1000 (inicio) son "muy_pasada"', () => {
    expect(validarFechaTorneo('0001-01-01', HOY)).toBe('muy_pasada')
    expect(validarFechaTorneo('1000-01-01', HOY)).toBe('muy_pasada')
  })
  it('hoy, ayer y el torneo del año pasado son válidos', () => {
    expect(validarFechaTorneo('2026-09-25', HOY)).toBeNull()
    expect(validarFechaTorneo('2026-09-24', HOY)).toBeNull()
    expect(validarFechaTorneo('2025-09-25', HOY)).toBeNull()
  })
  it('un día más allá del margen pasado no pasa', () => {
    expect(validarFechaTorneo('2025-09-24', HOY)).toBe('muy_pasada')
  })
  it('el calendario de la temporada siguiente pasa; 2999 no', () => {
    expect(validarFechaTorneo('2028-07-08', HOY)).toBeNull()
    expect(validarFechaTorneo('2028-09-24', HOY)).toBeNull()
    expect(validarFechaTorneo('2028-09-25', HOY)).toBe('muy_futura')
    expect(validarFechaTorneo('2999-01-01', HOY)).toBe('muy_futura')
  })
  it('formato inválido', () => {
    expect(validarFechaTorneo('mañana', HOY)).toBe('formato')
    expect(validarFechaTorneo('2026-02-30', HOY)).toBe('formato')
  })
  it('"hoy" es válido en cualquier zona horaria (se compara calendario)', () => {
    // 23:30 en Santiago = 02:30 UTC del día siguiente. El organizador escribe
    // la fecha de su calendario local; comparar con el UTC lo mandaría a ayer.
    const nocheChile = new Date('2026-09-25T23:30:00-03:00')
    expect(validarFechaTorneo('2026-09-25', nocheChile)).toBeNull()
    expect(validarFechaTorneo('2026-09-26', nocheChile)).toBeNull()
  })
})

describe('validarFechasDeTorneo — reglas del config', () => {
  it('config sin fechas (null) no da errores: "falta" lo dice el footer', () => {
    expect(validarFechasDeTorneo({ date_start: null, rounds: [ronda(1, null)] }, HOY)).toEqual([])
  })

  it('un torneo de una ronda con fechas coherentes es válido', () => {
    expect(
      validarFechasDeTorneo({ date_start: '2026-10-10', rounds: [ronda(1, '2026-10-10')] }, HOY),
    ).toEqual([])
  })

  it('date_start absurda → error con field date_start', () => {
    const e = validarFechasDeTorneo({ date_start: '1000-01-01', rounds: [ronda(1, null)] }, HOY)
    expect(e.map((x) => x.code)).toEqual(['date_start_muy_pasada'])
    expect(e[0].field).toBe('date_start')
  })

  it('fecha absurda en la ronda 2 → error con field rounds[2].date', () => {
    const e = validarFechasDeTorneo(
      { date_start: '2026-10-10', rounds: [ronda(1, '2026-10-10'), ronda(2, '0001-01-01')] },
      HOY,
    )
    expect(e.map((x) => x.code)).toEqual(['round_date_muy_pasada'])
    expect(e[0].field).toBe('rounds[2].date')
    expect(e[0].message).toMatch(/Ronda 2/)
  })

  it('la ronda 1 debe jugarse el día de inicio', () => {
    const e = validarFechasDeTorneo(
      { date_start: '2026-10-10', rounds: [ronda(1, '2026-10-12')] },
      HOY,
    )
    expect(e.map((x) => x.code)).toEqual(['date_start_mismatch'])
  })

  it('las rondas van en orden no decreciente (misma fecha permitida: 36 hoyos en un día)', () => {
    const ok = validarFechasDeTorneo(
      { date_start: '2026-10-10', rounds: [ronda(1, '2026-10-10'), ronda(2, '2026-10-10')] },
      HOY,
    )
    expect(ok).toEqual([])

    const mal = validarFechasDeTorneo(
      { date_start: '2026-10-10', rounds: [ronda(1, '2026-10-10'), ronda(2, '2026-10-09')] },
      HOY,
    )
    expect(mal.map((x) => x.code)).toEqual(['rounds_not_chronological'])
    expect(mal[0].field).toBe('rounds[2].date')
  })

  it('el orden se juzga por round_number, no por posición en el array', () => {
    const e = validarFechasDeTorneo(
      { date_start: '2026-10-10', rounds: [ronda(2, '2026-10-09'), ronda(1, '2026-10-10')] },
      HOY,
    )
    expect(e.map((x) => x.code)).toEqual(['rounds_not_chronological'])
  })

  it('una ronda sin fecha en el medio no rompe la comparación de las demás', () => {
    const e = validarFechasDeTorneo(
      {
        date_start: '2026-10-10',
        rounds: [ronda(1, '2026-10-10'), ronda(2, null), ronda(3, '2026-10-08')],
      },
      HOY,
    )
    // La 3 se compara con la 2 (sin fecha → se salta), no con la 1: la regla
    // es entre consecutivas con fecha. "Falta fecha en la ronda 2" lo dice el
    // footer, y al cargarla saltará el orden si corresponde.
    expect(e).toEqual([])
  })

  it('una fecha con formato inválido no dispara además mismatch ni orden', () => {
    const e = validarFechasDeTorneo(
      { date_start: '2026-10-10', rounds: [ronda(1, 'ayer'), ronda(2, '2026-10-11')] },
      HOY,
    )
    expect(e.map((x) => x.code)).toEqual(['round_date_formato'])
  })
})
