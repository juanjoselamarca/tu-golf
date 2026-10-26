import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import type { ImportRoundData } from '@/lib/import-types'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { buildRound, detectFormat, parseCSV, type ErrorFilaCsv } from '@/lib/import/csv'
export const dynamic = 'force-dynamic'

// ── Route Handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const contentLength = parseInt(request.headers.get('content-length') || '0')
    if (contentLength > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'El archivo CSV no puede superar 10MB' }, { status: 413 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Rate limit: 5 CSV imports per minute per user
    const rl = checkRateLimit(`import-csv:${user.id}`, 5, 60_000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos de importación. Espera un momento.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
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
    const errors: ErrorFilaCsv[] = []

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
    void captureError(err, { context: 'import.csv' })
    return NextResponse.json(
      { error: 'Error interno en importación CSV' },
      { status: 500 }
    )
  }
}
