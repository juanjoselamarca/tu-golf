import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import JSZip from 'jszip'
import { validarRonda } from '@/lib/cpi'
import type { ImportRoundData } from '@/lib/import-types'

export const maxDuration = 60

// ── Garmin JSON types ────────────────────────────────────────

interface GarminHole {
  number: number
  strokes: number | null
  penalties: number
  handicapScore?: number
  putts: number | null
  fairwayShotOutcome?: string
}

interface GarminScorecard {
  id: number
  roundPlayerName?: string
  courseGlobalId?: number
  courseSnapshotId?: number
  scoreType?: string
  startTime: string
  formattedStartTime?: string
  holesCompleted: number
  inProgress: boolean
  excludeFromStats?: boolean
  teeBox?: string
  teeBoxRating?: number
  teeBoxSlope?: number
  strokes: number
  score?: number // vs par (e.g., 19 means +19 over par)
  holes: GarminHole[]
  distanceWalked?: number
}

interface GarminScorecardFile {
  version?: string
  type?: string
  data: GarminScorecard[]
}

interface GarminCourseFile {
  data: Array<Record<string, string>>
}

// ── Helpers ──────────────────────────────────────────────────

function buildCourseMap(courseFile: GarminCourseFile): Map<string, string> {
  const map = new Map<string, string>()
  for (const entry of courseFile.data) {
    for (const [id, name] of Object.entries(entry)) {
      map.set(String(id), name)
    }
  }
  return map
}

function findFileInZip(zip: JSZip, fileName: string): JSZip.JSZipObject | null {
  // Try exact path first
  const exactPaths = [
    `DI_CONNECT/DI-GOLF/${fileName}`,
    `DI_CONNECT/DI-GOLF/${fileName}`.toLowerCase(),
  ]

  for (const p of exactPaths) {
    const file = zip.file(p)
    if (file) return file
  }

  // Search case-insensitive and with any nesting
  const lowerName = fileName.toLowerCase()
  let found: JSZip.JSZipObject | null = null

  zip.forEach((relativePath, file) => {
    if (!found && !file.dir && relativePath.toLowerCase().endsWith(lowerName.toLowerCase())) {
      // Prefer paths containing DI-GOLF
      if (relativePath.toUpperCase().includes('DI-GOLF')) {
        found = file
      }
    }
  })

  // If no DI-GOLF match, accept any match
  if (!found) {
    zip.forEach((relativePath, file) => {
      if (!found && !file.dir && relativePath.toLowerCase().endsWith(lowerName)) {
        found = file
      }
    })
  }

  return found
}

// ── Route Handler ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Size check
    const contentLength = parseInt(request.headers.get('content-length') || '0')
    if (contentLength > 200 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'El archivo ZIP no puede superar 200MB' },
        { status: 413 }
      )
    }

    // 2. Auth
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // 3. Read formData — accepts EITHER a ZIP file OR pre-extracted JSONs
    // The client extracts Golf-SCORECARD.json from the ZIP in the browser
    // because the full ZIP can be 80+ MB (exceeds Vercel's 4.5MB body limit)
    let formData: FormData
    try {
      formData = await request.formData()
    } catch {
      return NextResponse.json(
        { error: 'No se recibió contenido válido' },
        { status: 400 }
      )
    }

    let scorecardData: GarminScorecardFile
    let courseFileData: GarminCourseFile | null = null

    // Mode A: Pre-extracted JSONs from client (preferred — small payload)
    const scorecardBlob = formData.get('scorecard_json')
    if (scorecardBlob && scorecardBlob instanceof File) {
      try {
        const text = await scorecardBlob.text()
        scorecardData = JSON.parse(text) as GarminScorecardFile
      } catch {
        return NextResponse.json(
          { error: 'Error al leer Golf-SCORECARD.json — formato inválido' },
          { status: 400 }
        )
      }

      const courseBlob = formData.get('course_json')
      if (courseBlob && courseBlob instanceof File) {
        try {
          courseFileData = JSON.parse(await courseBlob.text()) as GarminCourseFile
        } catch { /* course map is optional */ }
      }
    } else {
      // Mode B: Full ZIP file (fallback — may fail on Vercel due to size limits)
      const file = formData.get('file')
      if (!file || !(file instanceof File)) {
        return NextResponse.json(
          { error: 'No se recibió archivo. Intenta de nuevo.' },
          { status: 400 }
        )
      }

      const arrayBuffer = await file.arrayBuffer()
      let zip: JSZip
      try {
        zip = await JSZip.loadAsync(arrayBuffer)
      } catch {
        return NextResponse.json(
          { error: 'El archivo no es un ZIP válido' },
          { status: 400 }
        )
      }

      const scorecardFile = findFileInZip(zip, 'Golf-SCORECARD.json')
      if (!scorecardFile) {
        return NextResponse.json(
          { error: 'No se encontraron datos de golf en este archivo.' },
          { status: 400 }
        )
      }

      try {
        scorecardData = JSON.parse(await scorecardFile.async('text')) as GarminScorecardFile
      } catch {
        return NextResponse.json(
          { error: 'Error al leer Golf-SCORECARD.json' },
          { status: 400 }
        )
      }

      const courseFile = findFileInZip(zip, 'Golf-COURSE.json')
      if (courseFile) {
        try {
          courseFileData = JSON.parse(await courseFile.async('text')) as GarminCourseFile
        } catch { /* optional */ }
      }
    }

    if (!scorecardData.data || !Array.isArray(scorecardData.data)) {
      return NextResponse.json(
        { error: 'Golf-SCORECARD.json no contiene datos válidos' },
        { status: 400 }
      )
    }

    // 6. Build course name mapping
    let courseMap = new Map<string, string>()
    if (courseFileData) {
      try {
        courseMap = buildCourseMap(courseFileData)
      } catch {
        // Non-fatal — we'll use "Cancha desconocida" as fallback
        console.warn('Could not parse Golf-COURSE.json, using fallback course names')
      }
    }

    // 7. Process each round
    const rounds: ImportRoundData[] = []
    const skipped: Array<{ garmin_id: number; reason: string }> = []
    const garminIds: string[] = []

    for (const sc of scorecardData.data) {
      // Skip in-progress rounds
      if (sc.inProgress) {
        skipped.push({ garmin_id: sc.id, reason: 'Ronda en progreso' })
        continue
      }

      // Skip rounds that aren't 9 or 18 holes
      if (sc.holesCompleted !== 9 && sc.holesCompleted !== 18) {
        skipped.push({ garmin_id: sc.id, reason: `Hoyos completados: ${sc.holesCompleted} (se requiere 9 o 18)` })
        continue
      }

      // Check for null strokes in any hole
      if (!sc.holes || sc.holes.length === 0) {
        skipped.push({ garmin_id: sc.id, reason: 'Sin datos de hoyos' })
        continue
      }

      const expectedHoles = sc.holes.slice(0, sc.holesCompleted)
      const hasNullStrokes = expectedHoles.some(h => h.strokes === null || h.strokes === undefined)
      if (hasNullStrokes) {
        skipped.push({ garmin_id: sc.id, reason: 'Hoyos con score incompleto (null)' })
        continue
      }

      // Build scores
      const scores: Record<string, number> = {}
      let totalFromHoles = 0
      let totalPutts = 0
      let totalPenalties = 0
      let fairwaysHit = 0
      const puttsPerHole: Record<string, number> = {}

      for (const hole of expectedHoles) {
        scores[String(hole.number)] = hole.strokes as number
        totalFromHoles += hole.strokes as number
        if (hole.putts !== null && hole.putts !== undefined) {
          totalPutts += hole.putts
          puttsPerHole[String(hole.number)] = hole.putts
        }
        if (hole.penalties) totalPenalties += hole.penalties
        if (hole.fairwayShotOutcome === 'HIT') fairwaysHit++
      }

      // Resolve course name
      let courseName = 'Cancha desconocida'
      if (sc.courseSnapshotId && courseMap.has(String(sc.courseSnapshotId))) {
        courseName = courseMap.get(String(sc.courseSnapshotId))!
      } else if (sc.courseGlobalId && courseMap.has(String(sc.courseGlobalId))) {
        courseName = courseMap.get(String(sc.courseGlobalId))!
      }

      // Resolve date
      let playedAt: string
      if (sc.formattedStartTime) {
        playedAt = sc.formattedStartTime.substring(0, 10)
      } else {
        playedAt = sc.startTime.substring(0, 10)
      }

      // Use strokes field if available, otherwise sum from holes
      const totalGross = sc.strokes || totalFromHoles

      // Calculate par per hole
      // Strategy: 1) Try our DB, 2) Calculate from Garmin's score field, 3) Default
      const parPerHole: Record<string, number> = {}
      let parSource = 'default'

      // Try looking up course in our DB — multiple strategies
      // Clean course name: remove "~ Norte-Este", "~ Sur-Este", etc. from Garmin combos
      const cleanName = courseName.split('~')[0].trim()

      // Strategy A: search by significant keywords (skip common words)
      const skipWords = new Set(['club', 'de', 'golf', 'las', 'los', 'la', 'el', 'del', 'y', 'country', 'campo'])
      const keywords = cleanName.split(/\s+/).filter(w => !skipWords.has(w.toLowerCase()) && w.length > 2)
      const mainKeyword = keywords.slice(-2).join(' ') // last 2 significant words

      // Try multiple search patterns
      let dbCourse: { id: string } | null = null
      const searchPatterns = [
        cleanName, // full clean name
        mainKeyword, // significant keywords
        keywords[0], // first significant keyword alone
      ]

      for (const pattern of searchPatterns) {
        if (!pattern || pattern.length < 3) continue
        const { data } = await supabase
          .from('courses')
          .select('id')
          .ilike('nombre', `%${pattern}%`)
          .limit(1)
          .single()
        if (data) { dbCourse = data; break }
      }

      if (dbCourse) {
        // Check if course has multiple recorridos (e.g., 27-hole courses like Brisas, Rocas)
        const { data: allHoles } = await supabase
          .from('course_holes')
          .select('recorrido, numero, par')
          .eq('course_id', dbCourse.id)
          .order('recorrido')
          .order('numero')

        const recorridos = new Map<string, Array<{ numero: number; par: number }>>()
        if (allHoles) {
          for (const h of allHoles) {
            const rec = h.recorrido || 'default'
            if (!recorridos.has(rec)) recorridos.set(rec, [])
            recorridos.get(rec)!.push({ numero: h.numero, par: h.par })
          }
        }

        const hasMultipleRecorridos = recorridos.size > 1 && !recorridos.has('default')

        if (hasMultipleRecorridos && sc.holesCompleted === 18) {
          // Extract recorrido combo from Garmin course name (e.g., "~ Norte-Sur", "~ Roja/Azul")
          const comboMatch = courseName.match(/[~]\s*(.+)$/)
          if (comboMatch) {
            const combo = comboMatch[1].trim()
            // Parse combo: "Norte + Sur", "Norte-Sur", "Norte + Este", "Roja/Azul", etc.
            const parts = combo.split(/[\s+\-\/]+/).map(s => s.trim()).filter(Boolean)

            if (parts.length >= 2) {
              // Find matching recorridos
              const findRec = (name: string) => {
                const lower = name.toLowerCase()
                const keys = Array.from(recorridos.keys())
                for (const key of keys) {
                  if (key.toLowerCase().includes(lower) || lower.includes(key.toLowerCase())) return recorridos.get(key)!
                }
                return null
              }

              const front9 = findRec(parts[0])
              const back9 = findRec(parts[1])

              if (front9 && back9) {
                // Combine: front 9 as holes 1-9, back 9 as holes 10-18
                for (const h of front9) parPerHole[String(h.numero)] = h.par
                for (const h of back9) parPerHole[String(h.numero + 9)] = h.par
                parSource = 'database_combo'
              }
            }
          }

          // Fallback: if combo parsing failed, use first 18 holes sequentially
          if (parSource === 'default') {
            const allPars = Array.from(recorridos.values()).flat()
            if (allPars.length >= 18) {
              for (let i = 0; i < 18; i++) {
                parPerHole[String(i + 1)] = allPars[i].par
              }
              parSource = 'database_fallback'
            }
          }
        } else if (!hasMultipleRecorridos && allHoles && allHoles.length >= sc.holesCompleted) {
          // Standard 18-hole course
          for (const h of allHoles) {
            parPerHole[String(h.numero)] = h.par
          }
          parSource = 'database'
        }
      }

      // If DB didn't have pars, calculate from Garmin's score field
      if (parSource === 'default' && sc.score !== undefined && sc.score !== null) {
        const parTotal = totalGross - sc.score
        // Distribute parTotal across holes
        const holePars = new Array(sc.holesCompleted).fill(4)
        let currentSum = sc.holesCompleted * 4
        const par3Positions = sc.holesCompleted === 18
          ? [2, 5, 8, 11, 14, 17] : [2, 5, 8]
        const par5Positions = sc.holesCompleted === 18
          ? [1, 6, 9, 12, 15, 17] : [1, 4, 7]

        if (currentSum > parTotal) {
          const deficit = currentSum - parTotal
          for (let d = 0; d < deficit && d < par3Positions.length; d++) {
            const pos = par3Positions[d]
            if (pos < sc.holesCompleted) { holePars[pos] = 3; currentSum-- }
          }
        } else if (currentSum < parTotal) {
          const surplus = parTotal - currentSum
          for (let s = 0; s < surplus && s < par5Positions.length; s++) {
            const pos = par5Positions[s]
            if (pos < sc.holesCompleted) { holePars[pos] = 5; currentSum++ }
          }
        }

        for (let i = 0; i < sc.holesCompleted; i++) {
          parPerHole[String(i + 1)] = holePars[i]
        }
        parSource = 'calculated'
      }

      // Fallback: all par 4
      if (Object.keys(parPerHole).length === 0) {
        for (let i = 1; i <= sc.holesCompleted; i++) {
          parPerHole[String(i)] = 4
        }
      }

      const garminId = String(sc.id)
      garminIds.push(garminId)

      const round: ImportRoundData = {
        tempId: crypto.randomUUID(),
        played_at: playedAt,
        course_name: courseName,
        total_gross: totalGross,
        holes_played: sc.holesCompleted as 9 | 18,
        scores,
        par_per_hole: parPerHole,
        course_rating: sc.teeBoxRating ?? null,
        slope_rating: sc.teeBoxSlope ?? null,
        metadata: {
          garmin_scorecard_id: garminId,
          putts: totalPutts > 0 ? totalPutts : undefined,
          putts_per_hole: Object.keys(puttsPerHole).length > 0 ? puttsPerHole : undefined,
          fairways: fairwaysHit > 0 ? fairwaysHit : undefined,
          penalties: totalPenalties > 0 ? totalPenalties : undefined,
          tee_box: sc.teeBox,
          course_rating: sc.teeBoxRating,
          slope_rating: sc.teeBoxSlope,
          distance_walked: sc.distanceWalked,
          import_source: 'garmin_zip' as const,
        },
        import_confidence: 1.0,
        validation: { valid: false, holesPlayed: 0, issues: [] },
      }

      // Run validation
      round.validation = validarRonda(round)
      rounds.push(round)
    }

    // 8. Check for duplicates by garmin_scorecard_id
    let existingGarminIds = new Set<string>()
    if (garminIds.length > 0) {
      const { data: existingRounds } = await supabase
        .from('historical_rounds')
        .select('garmin_scorecard_id')
        .eq('user_id', user.id)
        .in('garmin_scorecard_id', garminIds)

      if (existingRounds) {
        existingGarminIds = new Set(
          existingRounds
            .map(r => r.garmin_scorecard_id as string)
            .filter(Boolean)
        )
      }
    }

    // Mark duplicates
    let totalDuplicates = 0
    for (const round of rounds) {
      const gid = round.metadata?.garmin_scorecard_id
      if (gid && existingGarminIds.has(gid)) {
        round.metadata = {
          ...round.metadata,
          is_duplicate: true,
          existing_id: true,
        }
        totalDuplicates++
      }
    }

    const totalValid = rounds.filter(r => r.validation.valid).length

    // 9. Create import job
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .insert({
        user_id: user.id,
        source: 'garmin_zip',
        status: 'review_required',
        total_detected: scorecardData.data.length,
        total_valid: totalValid,
        total_excluded: skipped.length,
        mapped_data: rounds,
        raw_data: {
          format: 'garmin_zip',
          total_in_file: scorecardData.data.length,
          skipped,
          course_map: Object.fromEntries(courseMap),
        },
      })
      .select()
      .single()

    if (jobError || !job) {
      return NextResponse.json(
        { error: 'Error creando job de importación' },
        { status: 500 }
      )
    }

    // 10. Return result
    return NextResponse.json({
      job_id: job.id,
      total_detected: scorecardData.data.length,
      total_valid: totalValid,
      total_duplicates: totalDuplicates,
      total_skipped: skipped.length,
      rounds,
      skipped: skipped.length > 0 ? skipped : undefined,
      course_map: Object.fromEntries(courseMap),
    })
  } catch (err) {
    console.error('Garmin ZIP import error:', err)
    return NextResponse.json(
      { error: 'Error interno al procesar archivo Garmin' },
      { status: 500 }
    )
  }
}
