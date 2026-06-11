/**
 * Capa de datos: handicap de juego (course handicap WHS) para el coach.
 *
 * Resuelve la causa E del P0 de campo (inbox 2026-06-09, captura #1): el coach
 * confundía el ÍNDICE (uno solo, ej 9.6) con el HANDICAP DE JUEGO (depende de la
 * cancha y el tee) e inventaba números ("índice 10, handicap de juego 14").
 * Acá se computa el handicap de juego REAL reusando el motor WHS existente
 * (resolveTeeRatingsForCourse + courseHandicap18h/9h) — el coach nunca lo inventa.
 *
 * El género del jugador (`profiles.genero`, ya capturado en onboarding/import)
 * desambigua tees del mismo color por género. Si falta un dato confiable
 * (sin índice, cancha no catalogada, tee ambiguo), degrada HONESTO sin inventar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { matchCourseInDB } from '@/golf/courses/matching'
import { resolveTeeRatingsForCourse } from '@/lib/data/course-tees'
import { courseHandicap18h, courseHandicap9h } from '@/golf/core/stroke-index'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PlayingHandicapInput = {
  /** Nombre de la cancha (se resuelve) o su UUID. */
  course: string
  /** Color del tee. Si no viene, usa el tee por defecto del jugador. */
  tee?: string | null
  /** 9 o 18 (default 18). */
  holes?: number | null
}

export type PlayingHandicapResult =
  | {
      ok: true
      cancha: string
      course_id: string
      tee: string
      genero: 'M' | 'F' | null
      indice: number
      holes: 9 | 18
      handicap_de_juego: number
      course_rating: number
      slope: number
      nota: string
    }
  | { ok: false; reason: string }

export async function computePlayingHandicapForCoach(
  supabase: SupabaseClient,
  userId: string,
  input: PlayingHandicapInput,
): Promise<PlayingHandicapResult> {
  const courseRef = (input.course || '').trim()
  if (!courseRef) return { ok: false, reason: 'No me dijiste la cancha.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('indice, genero, default_tee_color')
    .eq('id', userId)
    .maybeSingle()

  const indice = typeof profile?.indice === 'number' ? profile.indice : null
  if (indice == null) {
    return {
      ok: false,
      reason:
        'El jugador todavía no tiene índice registrado, así que no puedo calcular su handicap de juego (sí puedo analizar sus rondas).',
    }
  }

  // Resolver cancha: UUID directo (matchCourseInDB solo resuelve por nombre) o nombre.
  let match: { id: string; nombre: string } | null
  if (UUID_RE.test(courseRef)) {
    const { data: c } = await supabase.from('courses').select('id, nombre').eq('id', courseRef).maybeSingle()
    match = c ? { id: c.id as string, nombre: c.nombre as string } : null
  } else {
    match = await matchCourseInDB(courseRef, supabase)
  }
  if (!match) {
    return { ok: false, reason: `La cancha "${courseRef}" no está en el catálogo, no puedo calcular el handicap de juego ahí.` }
  }

  const genero = profile?.genero === 'M' || profile?.genero === 'F' ? profile.genero : null
  const teeColor = ((input.tee || profile?.default_tee_color) ?? '').toString().trim() || null
  if (!teeColor) {
    return {
      ok: false,
      reason: `Para el handicap de juego en ${match.nombre} necesito el color del tee desde el que juega. Puede configurar su tee por defecto en su perfil; preguntale el color.`,
    }
  }

  const holes: 9 | 18 = input.holes === 9 ? 9 : 18
  const ratings = await resolveTeeRatingsForCourse(supabase, match.id, teeColor, holes, genero)
  if (!ratings) {
    return {
      ok: false,
      reason: `No tengo el rating/slope confiable del tee ${teeColor} en ${match.nombre} (o es ambiguo entre recorridos/géneros). No calculo un handicap de juego que podría salir mal.`,
    }
  }

  const { data: courseRow } = await supabase.from('courses').select('par_total').eq('id', match.id).maybeSingle()
  const parTotal = typeof courseRow?.par_total === 'number' ? courseRow.par_total : 72

  let handicapDeJuego: number
  let cr: number
  let slope: number
  if (holes === 9) {
    if (!ratings.nineHoleRatings) {
      return {
        ok: false,
        reason: `Tengo el rating de 18 hoyos del tee ${teeColor} en ${match.nombre} pero no el de 9, así que solo puedo darte el handicap de juego a 18 hoyos.`,
      }
    }
    cr = ratings.nineHoleRatings.cr9h
    slope = ratings.nineHoleRatings.slope9h
    handicapDeJuego = courseHandicap9h(indice, slope, cr, Math.round(parTotal / 2))
  } else {
    cr = ratings.cr
    slope = ratings.slope
    handicapDeJuego = courseHandicap18h(indice, slope, cr, parTotal)
  }

  return {
    ok: true,
    cancha: match.nombre,
    course_id: match.id,
    tee: teeColor,
    genero,
    indice,
    holes,
    handicap_de_juego: handicapDeJuego,
    course_rating: cr,
    slope,
    nota: `El handicap de juego (${handicapDeJuego}) es DISTINTO del índice (${indice}): se calcula por cancha y tee${holes === 9 ? ', a 9 hoyos,' : ''} con la fórmula WHS redondeo(índice × slope/113 + (CR − par)), con el CR y el par de ${holes} hoyos.`,
  }
}
