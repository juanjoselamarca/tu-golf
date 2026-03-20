import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { validarRonda } from '@/lib/cpi'
import type { ImportRoundData } from '@/lib/import-types'

const VISION_PROMPT = `Eres un experto en leer scorecards de golf. Analiza esta imagen de una scorecard y extrae los datos.

Responde EXCLUSIVAMENTE con un JSON válido (sin markdown, sin backticks, sin texto adicional):

{
  "course_name": "nombre del campo",
  "played_at": "YYYY-MM-DD o null si no se ve",
  "holes_played": 9 o 18,
  "scores": { "1": score_hoyo_1, "2": score_hoyo_2, ... },
  "total_gross": número_total,
  "course_rating": número o null,
  "slope_rating": número o null,
  "putts": número_total o null,
  "putts_per_hole": { "1": putts_hoyo_1, ... } o null,
  "fairways": número_de_fairways_hit o null,
  "gir": número_de_greens_in_regulation o null,
  "gir_per_hole": { "1": true/false, ... } o null,
  "confidence": 0.0 a 1.0
}

Reglas:
- Si no puedes leer un hoyo, usa null para ese score
- Si no ves la fecha, usa null
- El confidence refleja qué tan seguro estás de la lectura
- Si la imagen NO es una scorecard, responde: {"error": "not_a_scorecard"}
- Responde SOLO el JSON, nada más`

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
      return NextResponse.json({ error: 'No se recibió contenido válido (se espera multipart/form-data)' }, { status: 400 })
    }

    const files: File[] = []
    const entries = formData.getAll('images')
    for (const value of entries) {
      if (value instanceof File) {
        files.push(value)
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No se recibieron imágenes' }, { status: 400 })
    }
    if (files.length > 20) {
      return NextResponse.json({ error: 'Máximo 20 imágenes por importación' }, { status: 400 })
    }

    // Create import job
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        user_id: user.id,
        source: 'photo_scan',
        status: 'processing',
        total_detected: files.length,
      })
      .select()
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Error creando job de importación' }, { status: 500 })
    }

    const anthropic = new Anthropic()
    const rounds: ImportRoundData[] = []
    const errors: Array<{ index: number; error: string }> = []

    for (let i = 0; i < files.length; i++) {
      try {
        const file = files[i]
        const arrayBuffer = await file.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')

        // Determine media type
        let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg'
        if (file.type === 'image/png') mediaType = 'image/png'
        else if (file.type === 'image/gif') mediaType = 'image/gif'
        else if (file.type === 'image/webp') mediaType = 'image/webp'

        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              { type: 'text', text: VISION_PROMPT },
            ],
          }],
        })

        const textBlock = response.content.find(b => b.type === 'text')
        if (!textBlock || textBlock.type !== 'text') {
          errors.push({ index: i, error: 'No se recibió respuesta de texto' })
          continue
        }

        const parsed = JSON.parse(textBlock.text)

        if (parsed.error) {
          errors.push({ index: i, error: parsed.error })
          continue
        }

        const round: ImportRoundData = {
          tempId: crypto.randomUUID(),
          played_at: parsed.played_at || new Date().toISOString().split('T')[0],
          course_name: parsed.course_name || 'Cancha desconocida',
          total_gross: parsed.total_gross || 0,
          holes_played: parsed.holes_played === 9 ? 9 : 18,
          scores: parsed.scores || {},
          course_rating: parsed.course_rating ?? null,
          slope_rating: parsed.slope_rating ?? null,
          metadata: {
            putts: parsed.putts ?? undefined,
            putts_per_hole: parsed.putts_per_hole ?? undefined,
            fairways: parsed.fairways ?? undefined,
            gir: parsed.gir ?? undefined,
            gir_per_hole: parsed.gir_per_hole ?? undefined,
          },
          import_confidence: parsed.confidence ?? 0.5,
          validation: { valid: false, holesPlayed: 0, issues: [] },
        }

        // Calculate total_gross from scores if not provided
        if (!round.total_gross) {
          const scoreValues = Object.values(round.scores).filter((v): v is number => typeof v === 'number')
          round.total_gross = scoreValues.reduce((a, b) => a + b, 0)
        }

        // Validate
        const validation = validarRonda(round)
        round.validation = validation

        rounds.push(round)
      } catch (err) {
        errors.push({ index: i, error: err instanceof Error ? err.message : 'Error desconocido' })
      }
    }

    const totalValid = rounds.filter(r => r.validation.valid).length

    // Update job
    await supabase
      .from('import_jobs')
      .update({
        status: 'review_required',
        total_detected: files.length,
        total_valid: totalValid,
        total_excluded: files.length - rounds.length,
        mapped_data: rounds,
        errors: errors.length > 0 ? errors : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return NextResponse.json({
      job_id: job.id,
      total_detected: files.length,
      total_valid: totalValid,
      total_errors: errors.length,
      rounds,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    console.error('Screenshot import error:', err)
    return NextResponse.json(
      { error: 'Error interno en importación de screenshot' },
      { status: 500 }
    )
  }
}
