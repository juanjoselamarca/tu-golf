// src/lib/import/csv.ts — Lectura de los CSV de 18Birdies y GolfGameBook para el importador.
// La ruta /api/import/csv solo autentica, guarda el job y responde; todo el parseo vive acá.

import { validarRonda } from '@/golf/stats/cpi'
import type { ImportRoundData } from '@/lib/import-types'
import { hoyEnChile } from '@/lib/fecha-chile'

// ── Parser (campos entre comillas) ────────────────────────────

export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.split(/\r?\n/)

  for (const line of lines) {
    if (!line.trim()) continue
    const row: string[] = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (inQuotes) {
        if (char === '"' && line[i + 1] === '"') {
          current += '"'
          i++
        } else if (char === '"') {
          inQuotes = false
        } else {
          current += char
        }
      } else {
        if (char === '"') {
          inQuotes = true
        } else if (char === ',') {
          row.push(current.trim())
          current = ''
        } else {
          current += char
        }
      }
    }
    row.push(current.trim())
    rows.push(row)
  }

  return rows
}

// ── Detección de formato ──────────────────────────────────────

export type CSVFormat = '18birdies' | 'golfgamebook' | 'unknown'

export interface FormatDetection {
  format: CSVFormat
  headerMap: Record<string, number>
}

export function detectFormat(headers: string[]): FormatDetection {
  const lower = headers.map(h => h.toLowerCase().trim())

  // 18Birdies format
  if (lower.includes('date') && lower.includes('course') && lower.includes('total')) {
    const headerMap: Record<string, number> = {}
    headerMap.date = lower.indexOf('date')
    headerMap.course = lower.indexOf('course')
    headerMap.total = lower.indexOf('total')
    // 18Birdies has hole columns: hole 1, hole 2, ... or h1, h2, ...
    for (let h = 1; h <= 18; h++) {
      const idx = lower.findIndex(col =>
        col === `hole ${h}` || col === `h${h}` || col === `hole${h}` || col === String(h)
      )
      if (idx !== -1) headerMap[`hole_${h}`] = idx
    }
    headerMap.putts = lower.indexOf('putts')
    headerMap.fairways = lower.indexOf('fairways hit') !== -1
      ? lower.indexOf('fairways hit')
      : lower.indexOf('fairways')
    headerMap.gir = lower.indexOf('gir') !== -1
      ? lower.indexOf('gir')
      : lower.indexOf('greens in regulation')
    return { format: '18birdies', headerMap }
  }

  // GolfGameBook format
  if (lower.includes('date') && lower.includes('course name') && lower.includes('gross score')) {
    const headerMap: Record<string, number> = {}
    headerMap.date = lower.indexOf('date')
    headerMap.course = lower.indexOf('course name')
    headerMap.total = lower.indexOf('gross score')
    for (let h = 1; h <= 18; h++) {
      const idx = lower.findIndex(col => col === `h${h}` || col === `hole ${h}`)
      if (idx !== -1) headerMap[`hole_${h}`] = idx
    }
    headerMap.putts = lower.indexOf('total putts')
    headerMap.course_rating = lower.indexOf('course rating')
    headerMap.slope_rating = lower.indexOf('slope rating')
    return { format: 'golfgamebook', headerMap }
  }

  return { format: 'unknown', headerMap: {} }
}

// ── Fecha ─────────────────────────────────────────────────────

/**
 * Cómo leer las fechas DD?MM?AAAA de un archivo. Se decide UNA vez por archivo: si se decidiera fila por
 * fila, en un CSV chileno "25/10/2025" saldría bien y "05/10/2025" quedaría en el 10 de mayo, sin aviso.
 * - 'dia-primero' / 'mes-primero': alguna fila lo resuelve (un número > 12 en una posición).
 * - 'conflicto': hay filas de los dos tipos; las ambiguas (ambos ≤ 12) no se pueden leer con certeza.
 * - null: ninguna fila lo resuelve; se usa el default del separador (ver `leerFechaCsv`).
 */
export type OrdenFechasCsv = 'dia-primero' | 'mes-primero' | 'conflicto' | null

const RE_ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/
const RE_DMY = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})(?:$|[T\s])/

export function ordenDeFechasCsv(valores: Array<string | undefined>): OrdenFechasCsv {
  let dia = false
  let mes = false
  for (const v of valores) {
    const m = RE_DMY.exec((v ?? '').trim())
    if (!m) continue
    if (Number(m[1]) > 12) dia = true
    if (Number(m[3]) > 12) mes = true
  }
  if (dia && mes) return 'conflicto'
  return dia ? 'dia-primero' : mes ? 'mes-primero' : null
}

function fechaValida(y: number, m: number, d: number, hoy: Date): string | null {
  if (y < 1900 || m < 1 || m > 12 || d < 1 || d > 31) return null
  const fecha = new Date(Date.UTC(y, m - 1, d))
  // 31/02 → 03/03: el calendario lo corrige en silencio; acá se rechaza.
  if (fecha.getUTCMonth() !== m - 1 || fecha.getUTCDate() !== d) return null
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  // La fecha del CSV es la local del jugador: se compara contra hoy en Chile, no en UTC.
  return iso > hoyEnChile(hoy) ? null : iso
}

/**
 * Fecha de una fila del CSV en AAAA-MM-DD, o null si no se puede leer con certeza.
 *
 * - AAAA-MM-DD (con o sin hora).
 * - DD?MM?AAAA según `orden` (decidido para todo el archivo con `ordenDeFechasCsv`). Sin orden decidido y con
 *   ambos números ≤ 12: con barra se asume MM/DD (las apps de origen, 18Birdies y GolfGameBook, exportan en
 *   formato de EE. UU.); con guion o punto, DD-MM (así se escribe en Chile y Europa). Con 'conflicto' → null.
 * - Fechas imposibles (31/02, mes 25) o futuras → null.
 *
 * Antes una fecha ilegible se reemplazaba por la de hoy: la ronda entraba al índice con una fecha inventada,
 * desplazando a las de verdad de las últimas 20.
 */
export function leerFechaCsv(texto: string | undefined, hoy: Date = new Date(), orden: OrdenFechasCsv = null): string | null {
  const s = (texto ?? '').trim()
  if (!s) return null

  const iso = RE_ISO.exec(s)
  if (iso) return fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]), hoy)

  const dmy = RE_DMY.exec(s)
  if (!dmy) return null
  const a = Number(dmy[1])
  const b = Number(dmy[3])
  const y = Number(dmy[4])
  let diaPrimero: boolean
  if (a > 12 || b > 12) diaPrimero = a > 12
  else if (orden === 'conflicto') return null
  else if (orden) diaPrimero = orden === 'dia-primero'
  else diaPrimero = dmy[2] !== '/'
  return diaPrimero ? fechaValida(y, b, a, hoy) : fechaValida(y, a, b, hoy)
}

/** Aviso cuando las fechas se leyeron con el default (ninguna fila decidía día/mes). null si no hace falta. */
export function avisoDeOrdenSupuesto(valores: Array<string | undefined>, orden: OrdenFechasCsv): string | null {
  if (orden !== null) return null
  const ambiguas = valores.map(v => RE_DMY.exec((v ?? '').trim())).filter(m => m !== null)
  if (ambiguas.length === 0) return null
  const conBarra = ambiguas.some(m => m[2] === '/')
  return conBarra
    ? 'Leímos las fechas del archivo como mes/día (así exportan 18Birdies y GolfGameBook). Revisa que estén bien.'
    : 'Leímos las fechas del archivo como día-mes. Revisa que estén bien.'
}

// ── Fila → ronda ──────────────────────────────────────────────

/** Construye la ronda de una fila. Lanza si la fila no se puede importar (el mensaje llega al jugador). */
export function buildRound(
  row: string[],
  headerMap: Record<string, number>,
  hoy: Date = new Date(),
  orden: OrdenFechasCsv = null,
): ImportRoundData {
  const scores: Record<string, number> = {}
  let holesCount = 0

  for (let h = 1; h <= 18; h++) {
    const idx = headerMap[`hole_${h}`]
    if (idx !== undefined && row[idx]) {
      const val = parseInt(row[idx], 10)
      if (!isNaN(val) && val > 0) {
        scores[String(h)] = val
        holesCount++
      }
    }
  }

  const totalStr = headerMap.total !== undefined ? row[headerMap.total] : ''
  let totalGross = parseInt(totalStr, 10)
  if (isNaN(totalGross)) {
    totalGross = Object.values(scores).reduce((a, b) => a + b, 0)
  }

  const dateStr = headerMap.date !== undefined ? row[headerMap.date] : ''
  const playedAt = leerFechaCsv(dateStr, hoy, orden)
  if (!playedAt) {
    const f = dateStr?.trim()
    throw new Error(
      !f ? 'sin fecha'
        : orden === 'conflicto' && RE_DMY.test(f) ? `fecha "${f}" ambigua (el archivo mezcla día/mes y mes/día)`
          : `fecha "${f}" no reconocida`,
    )
  }

  const courseRating = headerMap.course_rating !== undefined
    ? parseFloat(row[headerMap.course_rating]) || null
    : null
  const slopeRating = headerMap.slope_rating !== undefined
    ? parseFloat(row[headerMap.slope_rating]) || null
    : null
  const putts = headerMap.putts !== undefined
    ? parseInt(row[headerMap.putts], 10) || undefined
    : undefined
  const fairways = headerMap.fairways !== undefined && headerMap.fairways !== -1
    ? parseInt(row[headerMap.fairways], 10) || undefined
    : undefined
  const gir = headerMap.gir !== undefined && headerMap.gir !== -1
    ? parseInt(row[headerMap.gir], 10) || undefined
    : undefined

  const round: ImportRoundData = {
    tempId: crypto.randomUUID(),
    played_at: playedAt,
    course_name: (headerMap.course !== undefined ? row[headerMap.course] : '') || 'Cancha desconocida',
    total_gross: totalGross,
    holes_played: holesCount <= 9 ? 9 : 18,
    scores,
    course_rating: courseRating,
    slope_rating: slopeRating,
    // Sin import_source el confirm la guardaba como 'photo_scan'.
    metadata: { putts, fairways, gir, import_source: 'csv' },
    import_confidence: 0.9,
    validation: { valid: false, holesPlayed: 0, issues: [] },
  }

  round.validation = validarRonda(round)

  return round
}

// ── Aviso al jugador ──────────────────────────────────────────

export interface ErrorFilaCsv {
  /** Fila del archivo (1 = encabezados). */
  row: number
  error: string
}

/**
 * Texto para el jugador cuando algunas filas no se pudieron leer. null si no hubo errores.
 * Antes la ruta las descartaba y el asistente no lo decía: el jugador creía haber importado todo.
 */
export function avisoDeFilasNoLeidas(errores: ErrorFilaCsv[], hayRondas: boolean): string | null {
  if (errores.length === 0) return null
  const ejemplo = `fila ${errores[0].row}: ${errores[0].error}`
  const formato = 'Usa fechas como 2025-10-25.'
  if (!hayRondas) {
    return `No pudimos leer ninguna ronda del archivo (${ejemplo}). ${formato}`
  }
  const cuantas = errores.length === 1 ? '1 fila' : `${errores.length} filas`
  return `No importamos ${cuantas} del archivo (${ejemplo}). ${formato} Revisa las rondas de abajo.`
}
