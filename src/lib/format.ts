/**
 * Formatters de locale es-CL para Golfers+.
 *
 * Regla (CLAUDE.md § 6): español LatAm neutro, sin `MM/DD/YYYY` US-biased.
 * Usar `21 abr 2026` (short) o `21 de abril de 2026` (long).
 */

const MESES_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const

const MESES_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

export type DateFormat = 'short' | 'long' | 'input'

function asDate(d: Date | string | number): Date {
  if (d instanceof Date) return d
  return new Date(d)
}

export function formatDate(d: Date | string | number, format: DateFormat = 'short'): string {
  const date = asDate(d)
  if (isNaN(date.getTime())) return ''

  const day = date.getDate()
  const month = date.getMonth()
  const year = date.getFullYear()

  switch (format) {
    case 'short':
      return `${day} ${MESES_SHORT[month]} ${year}`
    case 'long':
      return `${day} de ${MESES_LONG[month]} de ${year}`
    case 'input':
      return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`
    default:
      return `${day} ${MESES_SHORT[month]} ${year}`
  }
}

export function parseInputDate(input: string): Date | null {
  if (!input) return null
  const m = input.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const day = parseInt(dd, 10)
  const month = parseInt(mm, 10) - 1
  const year = parseInt(yyyy, 10)
  const d = new Date(year, month, day)
  if (d.getDate() !== day || d.getMonth() !== month || d.getFullYear() !== year) {
    return null
  }
  return d
}

export function formatRelativeTime(d: Date | string | number): string {
  const date = asDate(d)
  if (isNaN(date.getTime())) return ''
  const now = Date.now()
  const diff = now - date.getTime()
  const sec = Math.floor(diff / 1000)
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  const days = Math.floor(hr / 24)

  if (sec < 30) return 'ahora'
  if (sec < 60) return `hace ${sec}s`
  if (min < 60) return `hace ${min} min`
  if (hr < 24) return `hace ${hr}h`
  if (days < 7) return `hace ${days} d`
  return formatDate(date, 'short')
}
