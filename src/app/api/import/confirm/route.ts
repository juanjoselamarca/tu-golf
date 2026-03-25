import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { calcularCPI } from '@/lib/cpi'
import type { ImportRoundData } from '@/lib/import-types'

// ── Generate tAIger+ insights (async, non-blocking) ──────────

async function generarInsights(
  userId: string,
  importedCount: number,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const anthropic = new Anthropic()

    // Get recent rounds for context
    const { data: recentRounds } = await supabase
      .from('historical_rounds')
      .select('course_name, total_gross, played_at, scores')
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .limit(10)

    if (!recentRounds || recentRounds.length < 3) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('nombre, indice')
      .eq('id', userId)
      .single()

    const prompt = `El jugador ${profile?.nombre || 'anónimo'} (índice: ${profile?.indice ?? 'desconocido'}) acaba de importar ${importedCount} rondas históricas.

Sus últimas rondas:
${recentRounds.map(r => `- ${r.course_name}: ${r.total_gross} golpes (${r.played_at})`).join('\n')}

Genera un análisis breve (máximo 3 oraciones) de lo que revelan estos datos importados sobre su juego. Sé específico y usa los números. Responde en español.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') return

    // Store insight
    await supabase
      .from('taiger_sessions')
      .insert({
        user_id: userId,
        session_type: 'import_insight',
        messages: [
          { role: 'assistant', content: textBlock.text },
        ],
        metadata: { source: 'import', imported_count: importedCount },
      })
  } catch (err) {
    // Non-blocking: log but don't fail
    console.error('Error generating import insights:', err)
  }
}

// ── Route Handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { job_id, rounds: selectedRounds } = body as {
      job_id: string
      rounds: ImportRoundData[]
    }

    if (!job_id) {
      return NextResponse.json({ error: 'job_id requerido' }, { status: 400 })
    }
    if (!selectedRounds || !Array.isArray(selectedRounds) || selectedRounds.length === 0) {
      return NextResponse.json({ error: 'No se seleccionaron rondas para importar' }, { status: 400 })
    }

    // Verify job belongs to user
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', job_id)
      .eq('user_id', user.id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job no encontrado o no te pertenece' }, { status: 404 })
    }

    if (job.status === 'completed') {
      return NextResponse.json({ error: 'Este job ya fue completado' }, { status: 400 })
    }

    // Insert valid rounds — BATCH insert for scalability
    const validRounds = selectedRounds.filter(r => r.validation?.valid !== false)
    const insertedIds: string[] = []
    const insertErrors: Array<{ tempId: string; error: string }> = []
    const duplicates: Array<{ tempId: string; course: string; date: string }> = []

    // Step 1: Check duplicates in a single query
    const dupeChecks = validRounds.map(r => ({
      tempId: r.tempId,
      course: r.course_name,
      date: r.played_at.split('T')[0],
      gross: r.total_gross,
    }))

    const { data: existingRounds } = await supabase
      .from('historical_rounds')
      .select('course_name, played_at, total_gross')
      .eq('user_id', user.id)

    const existingSet = new Set(
      (existingRounds || []).map(r =>
        `${r.course_name}|${r.played_at}|${r.total_gross}`
      )
    )

    // Step 2: Prepare batch — filter out duplicates and build insert rows
    const rowsToInsert: Array<{
      user_id: string
      course_name: string
      played_at: string
      scores: number[]
      total_gross: number
      holes_played: number
      import_confidence: number
      import_source: string
      privacy: string
    }> = []

    const tempIdMap: string[] = [] // parallel array to track tempIds

    for (const round of validRounds) {
      const dupeKey = `${round.course_name}|${round.played_at.split('T')[0]}|${round.total_gross}`
      if (existingSet.has(dupeKey)) {
        duplicates.push({ tempId: round.tempId, course: round.course_name, date: round.played_at })
        continue
      }

      const scoresArray: number[] = []
      const holeCount = round.holes_played || 18
      for (let h = 1; h <= holeCount; h++) {
        const score = round.scores[String(h)]
        if (typeof score === 'number') scoresArray.push(score)
      }

      if (scoresArray.length === 0) {
        insertErrors.push({ tempId: round.tempId, error: 'No se pudieron extraer scores' })
        continue
      }

      rowsToInsert.push({
        user_id: user.id,
        course_name: round.course_name,
        played_at: round.played_at,
        scores: scoresArray,
        total_gross: round.total_gross,
        holes_played: round.holes_played || scoresArray.length,
        import_confidence: round.import_confidence ?? 0.5,
        import_source: 'photo_scan',
        privacy: 'private',
      })
      tempIdMap.push(round.tempId)
    }

    // Step 3: Single batch insert
    if (rowsToInsert.length > 0) {
      const { data: inserted, error: batchError } = await supabase
        .from('historical_rounds')
        .insert(rowsToInsert)
        .select('id')

      if (batchError) {
        // If batch fails, report all as errors
        tempIdMap.forEach(tid => insertErrors.push({ tempId: tid, error: batchError.message }))
      } else if (inserted) {
        inserted.forEach(row => insertedIds.push(row.id))
      }
    }

    // Update job status
    await supabase
      .from('import_jobs')
      .update({
        status: 'completed',
        total_imported: insertedIds.length,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job_id)

    // Recalculate CPI
    let cpiResult = null
    try {
      const { data: allRounds } = await supabase
        .from('historical_rounds')
        .select('total_gross, played_at, course_rating, slope_rating')
        .eq('user_id', user.id)
        .order('played_at', { ascending: false })
        .limit(20)

      if (allRounds && allRounds.length >= 3) {
        const rondasCPI = allRounds.map(r => ({
          total_gross: r.total_gross,
          played_at: r.played_at,
          course_rating: r.course_rating ?? null,
          slope_rating: r.slope_rating ?? null,
        }))

        cpiResult = calcularCPI(rondasCPI)

        await supabase
          .from('profiles')
          .update({
            cpi_score: cpiResult.score,
            cpi_trend: cpiResult.trend,
            cpi_status: cpiResult.status,
            cpi_updated_at: new Date().toISOString(),
          })
          .eq('id', user.id)
      }
    } catch (err) {
      console.error('Error recalculating CPI:', err)
    }

    // Generate tAIger+ insights (async, don't block)
    generarInsights(user.id, insertedIds.length, supabase).catch(() => {})

    return NextResponse.json({
      success: true,
      job_id,
      total_imported: insertedIds.length,
      total_errors: insertErrors.length,
      total_duplicates: duplicates.length,
      inserted_ids: insertedIds,
      errors: insertErrors.length > 0 ? insertErrors : undefined,
      duplicates: duplicates.length > 0 ? duplicates : undefined,
      cpi: cpiResult ?? null,
      cpiResult: cpiResult ?? null,
    })
  } catch (err) {
    console.error('Confirm import error:', err)
    return NextResponse.json(
      { error: 'Error interno al confirmar importación' },
      { status: 500 }
    )
  }
}
