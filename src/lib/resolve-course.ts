import type { SupabaseClient } from '@supabase/supabase-js'

export interface ResolveCourseInput {
  supabase: SupabaseClient
  courseName: string
  parPerHole?: Record<string, number> | null
  similarityThreshold?: number
  /** Género del jugador (M/F/masculino/femenino/V/D) — desambigua fichas VARONES/DAMAS. */
  genero?: string | null
}

export interface ResolveCourseResult {
  courseId: string | null
  courseCreated: boolean
  holesPopulated: boolean
  matchScore: number | null
  warnings: string[]
}

export async function resolveCourse(
  input: ResolveCourseInput
): Promise<ResolveCourseResult> {
  const warnings: string[] = []

  if (!input.courseName || input.courseName.trim() === '') {
    return {
      courseId: null,
      courseCreated: false,
      holesPopulated: false,
      matchScore: null,
      warnings: ['courseName vacío — no se intentó resolver'],
    }
  }

  const { data, error } = await input.supabase.rpc('resolve_and_link_course', {
    p_course_name: input.courseName,
    p_par_per_hole: input.parPerHole ?? null,
    p_similarity_threshold: input.similarityThreshold ?? 0.6,
    p_genero: input.genero ?? null,
  })

  if (error) {
    return {
      courseId: null,
      courseCreated: false,
      holesPopulated: false,
      matchScore: null,
      warnings: [`RPC resolve_and_link_course falló: ${error.message}`],
    }
  }

  const result = data as {
    course_id: string | null
    course_created: boolean
    holes_populated: boolean
    match_score: number | null
  }

  if (result.course_created) {
    warnings.push(`Cancha creada en BD: ${input.courseName}`)
  }
  if (result.holes_populated) {
    warnings.push(`Pares por hoyo enriquecidos en BD para: ${input.courseName}`)
  }

  return {
    courseId: result.course_id,
    courseCreated: result.course_created,
    holesPopulated: result.holes_populated,
    matchScore: result.match_score,
    warnings,
  }
}
