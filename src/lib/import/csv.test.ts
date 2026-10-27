import { describe, it, expect } from 'vitest'
import {
  avisoDeFilasNoLeidas,
  avisoDeOrdenSupuesto,
  buildRound,
  detectFormat,
  leerFechaCsv,
  ordenDeFechasCsv,
  parseCSV,
} from './csv'

const HOY = new Date('2026-10-26T12:00:00Z')

describe('leerFechaCsv', () => {
  it('lee AAAA-MM-DD, con o sin hora', () => {
    expect(leerFechaCsv('2025-10-25', HOY)).toBe('2025-10-25')
    expect(leerFechaCsv('2024-11-30T08:00:00Z', HOY)).toBe('2024-11-30')
  })

  it('con barra asume MM/DD/AAAA (apps de EE. UU.)', () => {
    expect(leerFechaCsv('03/15/2024', HOY)).toBe('2024-03-15')
  })

  it('con barra y primer número > 12 es DD/MM/AAAA (formato chileno)', () => {
    // Antes daba "2025-25-10": pasaba el regex del confirm y el insert reventaba.
    expect(leerFechaCsv('25/10/2025', HOY)).toBe('2025-10-25')
  })

  it('con guion o punto es DD-MM-AAAA, salvo que el segundo número pase de 12', () => {
    expect(leerFechaCsv('25-10-2025', HOY)).toBe('2025-10-25')
    expect(leerFechaCsv('05.10.2025', HOY)).toBe('2025-10-05')
    expect(leerFechaCsv('10-25-2025', HOY)).toBe('2025-10-25')
  })

  it('rechaza fechas imposibles, futuras, vacías o en otro formato', () => {
    expect(leerFechaCsv('2025-02-31', HOY)).toBeNull()
    expect(leerFechaCsv('2025-13-01', HOY)).toBeNull()
    expect(leerFechaCsv('2027-01-01', HOY)).toBeNull()
    expect(leerFechaCsv('', HOY)).toBeNull()
    expect(leerFechaCsv(undefined, HOY)).toBeNull()
    expect(leerFechaCsv('Oct 25, 2025', HOY)).toBeNull()
  })

  it('el futuro se mide con la fecha de hoy en Chile, no en UTC', () => {
    // 23:30 del 26 en Chile = 02:30 del 27 en UTC.
    const ahora = new Date('2026-10-26T23:30:00-03:00')
    expect(leerFechaCsv('2026-10-26', ahora)).toBe('2026-10-26')
    expect(leerFechaCsv('2026-10-27', ahora)).toBeNull()
  })
})

describe('ordenDeFechasCsv — día/mes se decide para todo el archivo', () => {
  it('un archivo chileno: 25/10 decide y 05/10 se lee como 5 de octubre (no 10 de mayo)', () => {
    const fechas = ['25/10/2025', '05/10/2025', '11/03/2025']
    const orden = ordenDeFechasCsv(fechas)
    expect(orden).toBe('dia-primero')
    expect(fechas.map(f => leerFechaCsv(f, HOY, orden))).toEqual(['2025-10-25', '2025-10-05', '2025-03-11'])
  })

  it('un archivo de EE. UU.: 03/15 decide mes/día también para las ambiguas', () => {
    const orden = ordenDeFechasCsv(['03/15/2025', '04/05/2025'])
    expect(orden).toBe('mes-primero')
    expect(leerFechaCsv('04/05/2025', HOY, orden)).toBe('2025-04-05')
  })

  it('si el archivo mezcla los dos órdenes, las fechas ambiguas no se leen', () => {
    const orden = ordenDeFechasCsv(['25/10/2025', '03/15/2025', '05/10/2025'])
    expect(orden).toBe('conflicto')
    expect(leerFechaCsv('25/10/2025', HOY, orden)).toBe('2025-10-25')
    expect(leerFechaCsv('05/10/2025', HOY, orden)).toBeNull()
  })

  it('sin ninguna fila que decida, se usa el default del separador y se avisa', () => {
    const fechas = ['04/05/2025', '2025-06-01']
    const orden = ordenDeFechasCsv(fechas)
    expect(orden).toBeNull()
    expect(leerFechaCsv('04/05/2025', HOY, orden)).toBe('2025-04-05')
    expect(avisoDeOrdenSupuesto(fechas, orden)).toContain('mes/día')
    expect(avisoDeOrdenSupuesto(['2025-06-01'], ordenDeFechasCsv(['2025-06-01']))).toBeNull()
    expect(avisoDeOrdenSupuesto(['25/10/2025'], 'dia-primero')).toBeNull()
  })
})

describe('buildRound', () => {
  const { headerMap } = detectFormat(['Date', 'Course', 'Total', ...Array.from({ length: 18 }, (_, i) => `Hole ${i + 1}`)])

  it('arma la ronda de 18 hoyos de 18Birdies', () => {
    const r = buildRound(['2024-03-15', 'Club de Golf Santiago', '90', ...Array(18).fill('5')], headerMap, HOY)
    expect(r.played_at).toBe('2024-03-15')
    expect(r.course_name).toBe('Club de Golf Santiago')
    expect(r.total_gross).toBe(90)
    expect(r.holes_played).toBe(18)
    expect(r.validation.valid).toBe(true)
    expect(r.metadata?.import_source).toBe('csv')
  })

  it('una fecha ilegible no se reemplaza por la de hoy: la fila se rechaza con el motivo', () => {
    // Antes: played_at = hoy y la ronda entraba al índice con una fecha inventada.
    expect(() => buildRound(['Oct 25, 2025', 'Granadilla', '90', ...Array(18).fill('5')], headerMap, HOY))
      .toThrow('fecha "Oct 25, 2025" no reconocida')
    expect(() => buildRound(['', 'Granadilla', '90', ...Array(18).fill('5')], headerMap, HOY)).toThrow('sin fecha')
  })

  it('una fecha ambigua en un archivo que mezcla órdenes se rechaza con ese motivo', () => {
    expect(() => buildRound(['05/10/2025', 'Granadilla', '90', ...Array(18).fill('5')], headerMap, HOY, 'conflicto'))
      .toThrow('fecha "05/10/2025" ambigua')
  })

  it('lee DD/MM/AAAA de punta a punta desde el texto del archivo', () => {
    const texto = 'Date,Course,Total\r\n25/10/2025,"Los Leones, Santiago",88\r\n'
    const [enc, fila] = parseCSV(texto)
    const r = buildRound(fila, detectFormat(enc).headerMap, HOY)
    expect(r.played_at).toBe('2025-10-25')
    expect(r.course_name).toBe('Los Leones, Santiago')
  })
})

describe('avisoDeFilasNoLeidas', () => {
  it('sin errores no hay aviso', () => {
    expect(avisoDeFilasNoLeidas([], true)).toBeNull()
  })

  it('con rondas, cuenta las filas descartadas y da un ejemplo', () => {
    const aviso = avisoDeFilasNoLeidas([{ row: 3, error: 'sin fecha' }, { row: 7, error: 'sin fecha' }], true)
    expect(aviso).toContain('No importamos 2 filas')
    expect(aviso).toContain('fila 3: sin fecha')
  })

  it('sin ninguna ronda, lo dice en vez de dejar al jugador esperando', () => {
    expect(avisoDeFilasNoLeidas([{ row: 2, error: 'fecha "Oct 25" no reconocida' }], false))
      .toContain('No pudimos leer ninguna ronda del archivo')
  })
})
