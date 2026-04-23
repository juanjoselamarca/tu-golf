/**
 * Tests para src/lib/format.ts — formatters de fecha es-CL.
 *
 * Regla crítica (CLAUDE.md § 6): nunca usar MM/DD/YYYY US-biased.
 * Cobertura previa: 0%.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { formatDate, parseInputDate, formatRelativeTime } from './format'

describe('formatDate', () => {
  // Fecha fija para tests: 15 de marzo de 2026
  const FECHA = new Date(2026, 2, 15)

  it('formato short: "15 mar 2026"', () => {
    expect(formatDate(FECHA)).toBe('15 mar 2026')
    expect(formatDate(FECHA, 'short')).toBe('15 mar 2026')
  })

  it('formato long: "15 de marzo de 2026"', () => {
    expect(formatDate(FECHA, 'long')).toBe('15 de marzo de 2026')
  })

  it('formato input: "15/03/2026" con zero-padding', () => {
    expect(formatDate(FECHA, 'input')).toBe('15/03/2026')
  })

  it('acepta string ISO', () => {
    expect(formatDate('2026-03-15T12:00:00Z')).toContain('mar 2026')
  })

  it('acepta timestamp numérico', () => {
    const ts = FECHA.getTime()
    expect(formatDate(ts)).toBe('15 mar 2026')
  })

  it('fecha inválida → string vacío', () => {
    expect(formatDate('not-a-date')).toBe('')
    expect(formatDate('')).toBe('')
    expect(formatDate(NaN)).toBe('')
  })

  it('enero y diciembre en short', () => {
    expect(formatDate(new Date(2026, 0, 1), 'short')).toBe('1 ene 2026')
    expect(formatDate(new Date(2026, 11, 31), 'short')).toBe('31 dic 2026')
  })

  it('meses long (todos los 12)', () => {
    const esperados = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
    for (let m = 0; m < 12; m++) {
      expect(formatDate(new Date(2026, m, 1), 'long')).toContain(esperados[m])
    }
  })

  it('input zero-pad día < 10', () => {
    expect(formatDate(new Date(2026, 0, 5), 'input')).toBe('05/01/2026')
  })
})

describe('parseInputDate', () => {
  it('DD/MM/YYYY válido → Date', () => {
    const d = parseInputDate('15/03/2026')
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(15)
    expect(d!.getMonth()).toBe(2) // marzo (0-indexed)
    expect(d!.getFullYear()).toBe(2026)
  })

  it('D/M/YYYY sin pad → también válido', () => {
    const d = parseInputDate('5/3/2026')
    expect(d).not.toBeNull()
    expect(d!.getDate()).toBe(5)
    expect(d!.getMonth()).toBe(2)
  })

  it('string vacío → null', () => {
    expect(parseInputDate('')).toBeNull()
  })

  it('formato US MM/DD/YYYY con día 31 → null si no es día real', () => {
    // 31/02/2026 → feb no tiene 31 → null (roll-over detectado)
    expect(parseInputDate('31/02/2026')).toBeNull()
  })

  it('formato inválido (YYYY-MM-DD) → null', () => {
    expect(parseInputDate('2026-03-15')).toBeNull()
  })

  it('día 32 → null', () => {
    expect(parseInputDate('32/03/2026')).toBeNull()
  })

  it('mes 13 → null', () => {
    expect(parseInputDate('15/13/2026')).toBeNull()
  })
})

describe('formatRelativeTime', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-23T12:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const AHORA = '2026-04-23T12:00:00Z'

  it('< 30 segundos → "ahora"', () => {
    const hace15s = new Date(Date.parse(AHORA) - 15_000)
    expect(formatRelativeTime(hace15s)).toBe('ahora')
  })

  it('30–59 segundos → "hace Ns"', () => {
    const hace45s = new Date(Date.parse(AHORA) - 45_000)
    expect(formatRelativeTime(hace45s)).toBe('hace 45s')
  })

  it('minutos → "hace N min"', () => {
    const hace5min = new Date(Date.parse(AHORA) - 5 * 60 * 1000)
    expect(formatRelativeTime(hace5min)).toBe('hace 5 min')
  })

  it('horas → "hace Nh"', () => {
    const hace3h = new Date(Date.parse(AHORA) - 3 * 60 * 60 * 1000)
    expect(formatRelativeTime(hace3h)).toBe('hace 3h')
  })

  it('días < 7 → "hace N d"', () => {
    const hace3d = new Date(Date.parse(AHORA) - 3 * 24 * 60 * 60 * 1000)
    expect(formatRelativeTime(hace3d)).toBe('hace 3 d')
  })

  it('≥ 7 días → fecha completa short', () => {
    const hace10d = new Date(Date.parse(AHORA) - 10 * 24 * 60 * 60 * 1000)
    const result = formatRelativeTime(hace10d)
    expect(result).toMatch(/\d+ [a-z]+ 2026/)
  })

  it('fecha inválida → string vacío', () => {
    expect(formatRelativeTime('not-a-date')).toBe('')
  })
})
