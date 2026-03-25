import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { validarRonda } from '@/lib/cpi'
import type { ImportRoundData } from '@/lib/import-types'
import { normalizeGarminColor, colorToDiff, isAmbiguousColor } from '@/lib/garmin-colors'

// Vercel Hobby: max 60s. Needed because Claude Vision can take 10-30s per image.
export const maxDuration = 60

// ============================================================
// VISION PROMPT — Garmin Golf specific
// Color system verified against real Garmin Golf screenshots:
//   Scorecard: azul oscuro=eagle, celeste=birdie, sin borde=par,
//              dorado/naranja=bogey, rojo=doble bogey+
//   Activity:  azul oscuro=eagle, celeste=birdie, verde=par,
//              dorado/naranja=bogey, rojo=doble bogey+
// ============================================================
const VISION_PROMPT = `You are an expert at reading Garmin Golf app screenshots. There are TWO formats:

**FORMAT 1 — SCORECARD (detailed view of ONE round)**
Shows: club name, tees, date, player name, total score (+/- par), and a grid with:
- Row of hole numbers (1-9 + "Out", then 10-18 + "In")
- Row of par values per hole
- Row of player scores per hole
- Scores have colored borders indicating performance:
  - Dark blue circle = Eagle or better (-2 or less vs par)
  - Light blue / celeste circle = Birdie (-1 vs par)
  - No border = Par (even with par)
  - Gold / orange / amber square = Bogey (+1 vs par)
  - Red square = Double bogey or worse (+2 or more vs par)

For this format, extract EXACT scores from the numbers shown. Also read the par row.

**FORMAT 2 — ACTIVITY LIST (multiple rounds summary)**
Shows a scrollable list of round cards, each with:
- Club name, date, total score, +/- par number
- A small color bar below each round where each colored segment = 1 hole:
  - Dark blue segment = Eagle or better (-2+)
  - Light blue / celeste segment = Birdie (-1)
  - Green segment = Par (0)
  - Gold / orange / amber segment = Bogey (+1)
  - Red segment = Double bogey or worse (+2+)

For this format, extract each round visible. Read the color bar LEFT TO RIGHT.

Respond EXCLUSIVELY with valid JSON (no markdown, no backticks):

For FORMAT 1:
{
  "format": "scorecard",
  "course_name": "string",
  "tees": "string or null",
  "played_at": "YYYY-MM-DD or null",
  "holes_played": 9 or 18,
  "scores": { "1": exact_score, "2": exact_score, ... },
  "total_gross": number,
  "vs_par": number,
  "par_per_hole": { "1": par, "2": par, ... },
  "confidence": 0.0 to 1.0
}

For FORMAT 2:
{
  "format": "activity_list",
  "rounds": [
    {
      "course_name": "string",
      "played_at": "YYYY-MM-DD or null",
      "total_gross": number,
      "vs_par": number,
      "holes_played": 9 or 18,
      "color_sequence": ["gold","green","light_blue","red",...],
      "confidence": 0.0 to 1.0
    }
  ]
}

Rules:
- If you can't read a score number, use null
- If you can't read a date, use null
- confidence reflects how certain you are of the reading
- For FORMAT 2, read ALL rounds visible in the image
- For color_sequence use ONLY: "dark_blue", "light_blue", "green", "gold", "red"
- IMPORTANT: In the activity bar, green = PAR, light_blue = BIRDIE, gold/orange = BOGEY
- If image is NOT a Garmin Golf screenshot, respond: {"error": "not_a_scorecard"}
- Respond ONLY with JSON, nothing else`

// ============================================================
// Score reconstruction from color-bar segments
// Uses garmin-colors.ts as single source of truth
// ============================================================
interface ReconstructionResult {
  scores: Record<string, number>
  confidence: number
  ambiguousHoles: number[]
}

function reconstructScores(
  colorSequence: string[],
  totalGross: number,
  vsPar: number,
  holesPlayed: number,
  coursePars?: Record<number, number>
): ReconstructionResult {
  const defaultPar = 4
  const holes = colorSequence.length || holesPlayed
  const parForHole = (h: number) => coursePars?.[h] ?? defaultPar

  const baseScores: Record<string, number> = {}
  const ambiguousCandidates: number[] = [] // holes where color is ambiguous (red = +2 minimum)
  let baseTotal = 0

  for (let i = 0; i < holes; i++) {
    const holeNum = i + 1
    const par = parForHole(holeNum)
    const rawColor = colorSequence[i] || 'green'
    const normalized = normalizeGarminColor(rawColor)
    const diff = colorToDiff(rawColor)

    const score = Math.max(1, par + diff) // score can't be less than 1
    baseScores[String(holeNum)] = score
    baseTotal += score

    if (isAmbiguousColor(rawColor)) {
      ambiguousCandidates.push(holeNum)
    }
  }

  // Reconcile: if baseTotal doesn't match totalGross, distribute residual
  const residual = totalGross - baseTotal
  const ambiguousHoles: number[] = []

  if (residual > 0 && ambiguousCandidates.length > 0) {
    // Extra strokes go to red holes (double bogey or worse)
    const extraPerHole = Math.floor(residual / ambiguousCandidates.length)
    const remainder = residual % ambiguousCandidates.length

    for (let i = 0; i < ambiguousCandidates.length; i++) {
      const h = ambiguousCandidates[i]
      const extra = extraPerHole + (i >= ambiguousCandidates.length - remainder ? 1 : 0)
      baseScores[String(h)] += extra
      if (extra > 0) ambiguousHoles.push(h)
    }
  } else if (residual !== 0 && ambiguousCandidates.length > 0) {
    // Negative residual shouldn't happen, flag all red holes
    ambiguousHoles.push(...ambiguousCandidates)
  } else if (residual !== 0 && ambiguousCandidates.length === 0) {
    // Total doesn't match and no red holes to adjust — low confidence
    // This means the color reading was inaccurate
  }

  const conf = residual === 0 ? 0.95
    : ambiguousHoles.length === 0 ? 0.90
    : ambiguousHoles.length <= 2 ? 0.85
    : 0.70

  return { scores: baseScores, confidence: conf, ambiguousHoles }
}

// ---------------------------------------------------------------------------
// Types for Claude vision responses
// ---------------------------------------------------------------------------
interface VisionScorecard {
  format: 'scorecard'
  course_name: string
  tees?: string | null
  played_at: string | null
  holes_played: number
  scores: Record<string, number>
  total_gross: number
  vs_par: number
  par_per_hole?: Record<string, number> | null
  confidence: number
}

interface VisionActivityRound {
  course_name: string
  played_at: string | null
  total_gross: number
  vs_par: number
  holes_played: number
  color_sequence: string[]
  confidence: number
}

interface VisionActivityList {
  format: 'activity_list'
  rounds: VisionActivityRound[]
}

interface VisionError {
  error: string
}

// ---------------------------------------------------------------------------
// Post-processing: fix common Gemini mistakes
// ---------------------------------------------------------------------------
function fixActivityRound(r: VisionActivityRound): VisionActivityRound {
  // Fix 1: Correct holes_played based on score total
  // A 9-hole round rarely exceeds 60 strokes for an amateur
  // An 18-hole round is almost always > 60
  if (r.total_gross > 60 && r.holes_played === 9) {
    r.holes_played = 18
  } else if (r.total_gross <= 60 && r.holes_played === 18) {
    r.holes_played = 9
  }

  // Fix 2: If color_sequence length doesn't match holes_played, trust the score
  if (r.color_sequence && r.color_sequence.length !== r.holes_played) {
    // If sequence is double what expected (Gemini counted wrong), take first/second half
    if (r.color_sequence.length === r.holes_played * 2) {
      r.color_sequence = r.color_sequence.slice(0, r.holes_played)
    }
    // If sequence is half what expected, it's probably correct and holes_played is wrong
    else if (r.color_sequence.length * 2 === r.holes_played) {
      r.holes_played = r.color_sequence.length
    }
    // Otherwise truncate or pad to match
    else if (r.color_sequence.length > r.holes_played) {
      r.color_sequence = r.color_sequence.slice(0, r.holes_played)
    }
  }

  // Fix 3: Validate vs_par makes sense
  // vs_par should be total_gross minus expected par
  // For 9 holes, typical par is 36; for 18, typical par is 72
  const expectedPar = r.holes_played === 9 ? 36 : 72
  const calculatedVsPar = r.total_gross - expectedPar
  // If Gemini's vs_par is way off, recalculate
  if (Math.abs(r.vs_par - calculatedVsPar) > 5) {
    r.vs_par = calculatedVsPar
  }

  return r
}

type VisionResponse = VisionScorecard | VisionActivityList | VisionError

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
      return NextResponse.json({ error: 'El servicio de lectura de fotos no está configurado (GEMINI_API_KEY faltante). Contacta al administrador.' }, { status: 503 })
    }

    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
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
    // Helper: build ImportRoundData from a scorecard response
    // -------------------------------------------------------------------
    const buildScorecardRound = (parsed: VisionScorecard): ImportRoundData => {
      const round: ImportRoundData = {
        tempId: crypto.randomUUID(),
        played_at: parsed.played_at || new Date().toISOString().split('T')[0],
        course_name: parsed.course_name || 'Cancha desconocida',
        total_gross: parsed.total_gross || 0,
        holes_played: parsed.holes_played === 9 ? 9 : 18,
        scores: parsed.scores || {},
        metadata: {},
        import_confidence: parsed.confidence ?? 0.5,
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
    // Helper: build ImportRoundData from an activity-list round
    // -------------------------------------------------------------------
    const buildActivityRound = async (actRound: VisionActivityRound): Promise<ImportRoundData> => {
      const { pars } = await lookupCoursePars(actRound.course_name)

      const { scores, confidence, ambiguousHoles } = reconstructScores(
        actRound.color_sequence,
        actRound.total_gross,
        actRound.vs_par,
        actRound.holes_played,
        pars
      )

      const finalConfidence = Math.min(actRound.confidence ?? 0.5, confidence)

      const round: ImportRoundData = {
        tempId: crypto.randomUUID(),
        played_at: actRound.played_at || new Date().toISOString().split('T')[0],
        course_name: actRound.course_name || 'Cancha desconocida',
        total_gross: actRound.total_gross || 0,
        holes_played: actRound.holes_played === 9 ? 9 : 18,
        scores,
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

        let mimeType = 'image/jpeg'
        if (file.type === 'image/png') mimeType = 'image/png'
        else if (file.type === 'image/gif') mimeType = 'image/gif'
        else if (file.type === 'image/webp') mimeType = 'image/webp'

        const result = await model.generateContent([
          { inlineData: { mimeType, data: base64 } },
          { text: VISION_PROMPT },
        ])

        const responseText = result.response.text()
        if (!responseText) {
          return { type: 'error', index, error: 'No se recibió respuesta de texto' }
        }

        // Clean response: Gemini sometimes wraps in markdown code blocks
        const cleanJson = responseText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
        const parsed: VisionResponse = JSON.parse(cleanJson)

        if ('error' in parsed) {
          return { type: 'error', index, error: parsed.error }
        }

        if (parsed.format === 'scorecard') {
          const round = buildScorecardRound(parsed)
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
          const round = buildScorecardRound({ ...legacy, format: 'scorecard' })
          return { type: 'rounds', rounds: [round] }
        }

        return { type: 'error', index, error: 'Formato de respuesta no reconocido' }
      } catch (err) {
        return { type: 'error', index, error: err instanceof Error ? err.message : 'Error desconocido' }
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
