import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { validarRonda } from '@/lib/cpi'
import type { ImportRoundData } from '@/lib/import-types'

// ── CSV Parser (handles quoted fields) ────────────────────────

function parseCSV(text: string): string[][] {
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

// ── Format Detection ──────────────────────────────────────────

type CSVFormat = '18birdies' | 'golfgamebook' | 'unknown'

interface FormatDetection {
  format: CSVFormat
  headerMap: Record<string, number>
}

function detectFormat(headers: string[]): FormatDetection {
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

// ── Build ImportRoundData from row ────────────────────────────

function buildRound(row: string[], headerMap: Record<string, number>): ImportRoundData {
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

  // Parse date (handle multiple formats)
  let playedAt = ''
  const dateStr = headerMap.date !== undefined ? row[headerMap.date] : ''
  if (dateStr) {
    // Try YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      playedAt = dateStr.split('T')[0]
    }
    // Try MM/DD/YYYY or DD/MM/YYYY
    else if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
      const parts = dateStr.split('/')
      // Assume MM/DD/YYYY (US format, common in golf apps)
      playedAt = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
    }
    // Try DD-MM-YYYY
    else if (/^\d{1,2}-\d{1,2}-\d{4}/.test(dateStr)) {
      const parts = dateStr.split('-')
      playedAt = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    }
  }
  if (!playedAt) playedAt = new Date().toISOString().split('T')[0]

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
    metadata: { putts, fairways, gir },
    import_confidence: 0.9,
    validation: { valid: false, holesPlayed: 0, issues: [] },
  }

  const validation = validarRonda(round)
  round.validation = validation

  return round
}

// ── Route Handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json({ error: 'No se recibió contenido válido (se espera multipart/form-data con un archivo CSV)' }, { status: 400 })
    }

    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No se recibió archivo CSV. Envía el archivo con el campo "file".' }, { status: 400 })
    }

    const text = await file.text()
    const rows = parseCSV(text)

    if (rows.length < 2) {
      return NextResponse.json({ error: 'CSV vacío o sin datos' }, { status: 400 })
    }

    const headers = rows[0]
    const dataRows = rows.slice(1)
    const { format, headerMap } = detectFormat(headers)

    // Create import job
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        user_id: user.id,
        source: 'csv',
        status: 'processing',
        total_detected: dataRows.length,
        raw_data: { format, headers },
      })
      .select()
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Error creando job de importación' }, { status: 500 })
    }

    // Unknown format: return headers for manual mapping
    if (format === 'unknown') {
      await supabase
        .from('import_jobs')
        .update({
          status: 'review_required',
          raw_data: { format, headers, previewRows: dataRows.slice(0, 5) },
          updated_at: new Date().toISOString(),
        })
        .eq('id', job.id)

      return NextResponse.json({
        job_id: job.id,
        needsMapping: true,
        headers,
        previewRows: dataRows.slice(0, 5),
        total_rows: dataRows.length,
      })
    }

    // Known format: parse all rows
    const rounds: ImportRoundData[] = []
    const errors: Array<{ row: number; error: string }> = []

    for (let i = 0; i < dataRows.length; i++) {
      try {
        const round = buildRound(dataRows[i], headerMap)
        rounds.push(round)
      } catch (err) {
        errors.push({ row: i + 2, error: err instanceof Error ? err.message : 'Error desconocido' })
      }
    }

    const totalValid = rounds.filter(r => r.validation.valid).length

    await supabase
      .from('import_jobs')
      .update({
        status: 'review_required',
        total_detected: dataRows.length,
        total_valid: totalValid,
        total_excluded: dataRows.length - rounds.length,
        mapped_data: rounds,
        errors: errors.length > 0 ? errors : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return NextResponse.json({
      job_id: job.id,
      format,
      total_detected: dataRows.length,
      total_valid: totalValid,
      total_errors: errors.length,
      rounds,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('CSV import error:', err)
    return NextResponse.json(
      { error: 'Error interno en importación CSV' },
      { status: 500 }
    )
  }
}
