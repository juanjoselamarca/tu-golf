import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { validarRonda } from '@/golf/stats/cpi'
import { ERROR_IMPORT_IA_NO_DISPONIBLE, ERROR_IMPORT_LECTURA_FALLIDA, type ImportRoundData } from '@/lib/import-types'
import { extractTeeColor } from '@/golf/courses/tee-resolver'
import { matchCourseInDB } from '@/golf/courses/matching'
import { checkRateLimit } from '@/lib/rate-limit'
import { captureError } from '@/lib/error-tracking'
import { reconstructScores } from '@/golf/import/garmin-color-reconstruction'
import {
  VISION_PROMPT,
  fixActivityRound,
  type VisionActivityRound,
  type VisionResponse,
  type VisionScorecard,
} from '@/lib/import/screenshot-vision'
export const dynamic = 'force-dynamic'

// Vercel Hobby: max 60s. Needed because Claude Vision can take 10-30s per image.
export const maxDuration = 60

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Rate limit: 20 requests por hora por usuario (protege costos Gemini)
    const rl = checkRateLimit(`screenshot:${user.id}`, 20, 60 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiadas importaciones. Intenta de nuevo en una hora.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      )
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

    const MAX_IMAGE_SIZE = 5 * 1024 * 1024
    for (const file of files) {
      if (file.size > MAX_IMAGE_SIZE) {
        return NextResponse.json(
          { error: `La imagen ${file.name} supera 5MB. Reduce la resolución.` },
          { status: 413 }
        )
      }
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

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY
    if (!geminiKey) {
      return NextResponse.json({ error: 'El reconocimiento de fotos no está disponible. Usa importación manual o Garmin.' }, { status: 503 })
    }

    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-3.7-flash' })
    const rounds: ImportRoundData[] = []
    const errors: Array<{ index: number; error: string }> = []

    // -------------------------------------------------------------------
    // Helper: look up course pars from DB
    // -------------------------------------------------------------------
    const lookupCoursePars = async (courseName: string): Promise<{ courseId?: string; pars?: Record<number, number> }> => {
      try {
        const searchTerms = courseName.split(' ').slice(-2).join(' ')
        const { data: course } = await supabase
          .from('courses')
          .select('id, par_total')
          .ilike('nombre', `%${searchTerms}%`)
          .limit(1)
          .single()

        if (!course) return {}

        const { data: holes } = await supabase
          .from('course_holes')
          .select('numero, par')
          .eq('course_id', course.id)
          .order('numero')

        if (!holes || holes.length === 0) return { courseId: course.id }

        const pars: Record<number, number> = {}
        for (const h of holes) {
          pars[h.numero] = h.par
        }
        return { courseId: course.id, pars }
      } catch {
        return {}
      }
    }

    // -------------------------------------------------------------------
    // Cache: avoid repeated course lookups + hole fetches across images
    // -------------------------------------------------------------------
    const courseMatchCache = new Map<string, { id: string } | null>()
    const courseHolesCache = new Map<string, Array<{ numero: number; par: number }>>()

    const cachedMatchCourse = async (courseName: string) => {
      if (courseMatchCache.has(courseName)) return courseMatchCache.get(courseName)!
      const match = await matchCourseInDB(courseName, supabase)
      courseMatchCache.set(courseName, match)
      if (match && !courseHolesCache.has(match.id)) {
        const { data: holes } = await supabase
          .from('course_holes')
          .select('numero, par')
          .eq('course_id', match.id)
          .order('numero')
        courseHolesCache.set(match.id, holes ?? [])
      }
      return match
    }

    const getCachedHoles = (courseId: string) => {
      return courseHolesCache.get(courseId) ?? []
    }

    // -------------------------------------------------------------------
    // Helper: build ImportRoundData from a scorecard response
    // -------------------------------------------------------------------
    const buildScorecardRound = async (parsed: VisionScorecard): Promise<ImportRoundData> => {
      // El tee aparece en la tarjeta Garmin; el OCR ya lo lee (parsed.tees).
      // Lo extraemos como color para que confirm/importRound resuelva el CR/slope
      // del catálogo (antes se descartaba → fotos sin diferencial).
      const teeColor = extractTeeColor(parsed.tees)
      const round: ImportRoundData = {
        tempId: crypto.randomUUID(),
        played_at: parsed.played_at || new Date().toISOString().split('T')[0],
        course_name: parsed.course_name || 'Cancha desconocida',
        total_gross: parsed.total_gross || 0,
        holes_played: parsed.holes_played === 9 ? 9 : 18,
        scores: parsed.scores || {},
        tee_color: teeColor,
        metadata: parsed.tees ? { tee_box: parsed.tees } : {},
        import_confidence: parsed.confidence ?? 0.5,
        validation: { valid: false, holesPlayed: 0, issues: [] },
      }

      // Save par_per_hole from Gemini if available
      if (parsed.par_per_hole) {
        round.par_per_hole = parsed.par_per_hole
      }

      // If Gemini didn't return pars, look up from DB (cached)
      if (!round.par_per_hole && round.course_name !== 'Cancha desconocida') {
        const match = await cachedMatchCourse(round.course_name)
        if (match) {
          const holes = getCachedHoles(match.id)
          if (holes.length > 0) {
            const pars: Record<string, number> = {}
            for (const h of holes) {
              pars[String(h.numero)] = h.par
            }
            round.par_per_hole = pars
          }
        }
      }

      if (!round.total_gross) {
        const scoreValues = Object.values(round.scores).filter((v): v is number => typeof v === 'number')
        round.total_gross = scoreValues.reduce((a, b) => a + b, 0)
      }

      round.validation = validarRonda(round)
      return round
    }

    // -------------------------------------------------------------------
    // Helper: build ImportRoundData from an activity-list round
    // -------------------------------------------------------------------
    const buildActivityRound = async (actRound: VisionActivityRound): Promise<ImportRoundData> => {
      // Use cached course matching
      let dbPars: Record<number, number> | undefined
      let dbParPerHole: Record<string, number> | undefined

      if (actRound.course_name) {
        const match = await cachedMatchCourse(actRound.course_name)
        if (match) {
          const holes = getCachedHoles(match.id)

          if (holes.length > 0) {
            // If course has multiple recorridos (e.g. 27 holes), try to match combo
            // by checking if the course name hints at a specific 9-hole loop
            let filteredHoles = holes
            if (holes.length > actRound.holes_played) {
              // Try to take first N holes matching holes_played
              filteredHoles = holes.slice(0, actRound.holes_played)
            }

            dbPars = {}
            dbParPerHole = {}
            for (const h of filteredHoles) {
              dbPars[h.numero] = h.par
              dbParPerHole[String(h.numero)] = h.par
            }
          }
        }
      }

      const { scores, confidence, ambiguousHoles } = reconstructScores(
        actRound.color_sequence,
        actRound.total_gross,
        actRound.vs_par,
        actRound.holes_played,
        dbPars
      )

      const finalConfidence = Math.min(actRound.confidence ?? 0.5, confidence)

      const round: ImportRoundData = {
        tempId: crypto.randomUUID(),
        played_at: actRound.played_at || new Date().toISOString().split('T')[0],
        course_name: actRound.course_name || 'Cancha desconocida',
        total_gross: actRound.total_gross || 0,
        holes_played: actRound.holes_played === 9 ? 9 : 18,
        scores,
        par_per_hole: dbParPerHole,
        metadata: {
          reconstruction_method: 'color_bar',
          ambiguous_holes: ambiguousHoles.length > 0 ? ambiguousHoles : undefined,
        },
        import_confidence: finalConfidence,
        validation: { valid: false, holesPlayed: 0, issues: [] },
      }

      if (!round.total_gross) {
        const scoreValues = Object.values(round.scores).filter((v): v is number => typeof v === 'number')
        round.total_gross = scoreValues.reduce((a, b) => a + b, 0)
      }

      round.validation = validarRonda(round)
      return round
    }

    // -------------------------------------------------------------------
    // Helper: process a single image → one or more rounds
    // -------------------------------------------------------------------
    type ProcessResult =
      | { type: 'rounds'; rounds: ImportRoundData[] }
      | { type: 'error'; index: number; error: string }

    const processImage = async (file: File, index: number): Promise<ProcessResult> => {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')

        // HEIC/HEIF (iPhone) llega tal cual si el navegador no pudo convertirla a JPEG
        // (Chrome/Android no la decodifica): declararla como JPEG hacía fallar la lectura.
        const MIMES_SOPORTADOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
        const extension = file.name.toLowerCase().split('.').pop()
        const mimeType = MIMES_SOPORTADOS.includes(file.type)
          ? file.type
          : extension === 'heic' || extension === 'heif' ? `image/${extension}` : 'image/jpeg'

        const result = await model.generateContent([
          { inlineData: { mimeType, data: base64 } },
          { text: VISION_PROMPT },
        ])

        const responseText = result.response.text()
        if (!responseText) {
          return { type: 'error', index, error: ERROR_IMPORT_LECTURA_FALLIDA }
        }

        // Clean response: Gemini sometimes wraps in markdown code blocks
        const cleanJson = responseText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
        const parsed: VisionResponse = JSON.parse(cleanJson)

        if ('error' in parsed) {
          // El prompt solo define 'not_a_scorecard'; cualquier otro texto de la IA no es para el jugador.
          return { type: 'error', index, error: parsed.error === 'not_a_scorecard' ? parsed.error : ERROR_IMPORT_LECTURA_FALLIDA }
        }

        if (parsed.format === 'scorecard') {
          const round = await buildScorecardRound(parsed)
          return { type: 'rounds', rounds: [round] }
        }

        if (parsed.format === 'activity_list') {
          // Post-process: fix Gemini mistakes in holes/colors
          const fixedRounds = parsed.rounds
            .filter(r => r && r.total_gross > 0)
            .map(r => fixActivityRound(r))
          const actRounds = await Promise.all(
            fixedRounds.map(r => buildActivityRound(r))
          )
          return { type: 'rounds', rounds: actRounds }
        }

        // Fallback: try treating as legacy scorecard (no format field)
        const legacy = parsed as unknown as VisionScorecard
        if (legacy.scores && legacy.total_gross) {
          const round = await buildScorecardRound({ ...legacy, format: 'scorecard' })
          return { type: 'rounds', rounds: [round] }
        }

        return { type: 'error', index, error: ERROR_IMPORT_LECTURA_FALLIDA }
      } catch (err) {
        // Falla del servicio de IA (503 saturado, 429 cuota, red con Google): código
        // estable para el cliente; el detalle técnico va a error tracking, no al jugador.
        if (err instanceof Error && err.message.includes('GoogleGenerativeAI')) {
          void captureError(err, { context: 'import.screenshot.gemini', userId: user.id })
          return { type: 'error', index, error: ERROR_IMPORT_IA_NO_DISPONIBLE }
        }
        void captureError(err, { context: 'import.screenshot.lectura', userId: user.id })
        return { type: 'error', index, error: ERROR_IMPORT_LECTURA_FALLIDA }
      }
    }

    // Process images in parallel chunks of 5
    const CHUNK_SIZE = 5
    for (let i = 0; i < files.length; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE)
      const results = await Promise.all(
        chunk.map((file, chunkIdx) => processImage(file, i + chunkIdx))
      )
      for (const result of results) {
        if (result.type === 'rounds') {
          rounds.push(...result.rounds)
        } else {
          errors.push({ index: result.index, error: result.error })
        }
      }
    }

    // -------------------------------------------------------------------
    // Duplicate detection: check against existing historical_rounds
    // -------------------------------------------------------------------
    let totalDuplicates = 0
    if (rounds.length > 0) {
      const { data: existingRounds } = await supabase
        .from('historical_rounds')
        .select('course_name, played_at, total_gross')
        .eq('user_id', user.id)

      if (existingRounds && existingRounds.length > 0) {
        const existingSet = new Set(
          existingRounds.map(r => `${r.course_name}|${r.played_at}|${r.total_gross}`)
        )

        for (const round of rounds) {
          const key = `${round.course_name}|${round.played_at}|${round.total_gross}`
          if (existingSet.has(key)) {
            round.metadata = {
              ...round.metadata,
              is_duplicate: true,
            }
            totalDuplicates++
          }
        }
      }
    }

    const totalValid = rounds.filter(r => r.validation.valid).length

    // Update job
    await supabase
      .from('import_jobs')
      .update({
        status: 'review_required',
        total_detected: rounds.length,
        total_valid: totalValid,
        total_excluded: files.length - (files.length - errors.length),
        mapped_data: rounds,
        errors: errors.length > 0 ? errors : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id)

    return NextResponse.json({
      job_id: job.id,
      total_detected: rounds.length,
      total_valid: totalValid,
      total_duplicates: totalDuplicates,
      total_errors: errors.length,
      rounds,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    void captureError(err, { context: 'import.screenshot' })
    return NextResponse.json(
      { error: 'Error interno en importación de screenshot' },
      { status: 500 }
    )
  }
}
