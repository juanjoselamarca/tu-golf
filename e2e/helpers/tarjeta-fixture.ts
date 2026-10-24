/**
 * Fixture de `/tarjeta/[id]`: una ronda histórica del usuario E2E en la base de pruebas.
 *
 * La usan `tarjeta-compartir.spec.ts` (el dueño con sesión) y `tarjeta-publica-anonimo.spec.ts`
 * (el que abre el link sin cuenta). Cada spec borra lo que crea en su `afterAll`.
 */
import { adminClient } from './ronda-fixture'

export const TARJETA_COURSE_NAME = 'Los Leones'
export const TARJETA_COURSE_ID = 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26'

/** Golpes realistas de 18 hoyos (total = 82). */
export const TARJETA_SCORES = [4, 3, 5, 4, 3, 5, 5, 3, 4, 4, 3, 5, 4, 4, 4, 5, 3, 4]
export const TARJETA_TOTAL = TARJETA_SCORES.reduce((a, b) => a + b, 0) // 82

/** Par de la RONDA (es el que manda en la tarjeta y en el preview): 35 + 35 = 70. */
export const TARJETA_PAR_PER_HOLE: Record<string, number> = {
  '1': 4, '2': 3, '3': 5, '4': 4, '5': 3,
  '6': 4, '7': 5, '8': 3, '9': 4, '10': 4,
  '11': 3, '12': 5, '13': 4, '14': 3, '15': 4,
  '16': 5, '17': 3, '18': 4,
}
export const TARJETA_PAR_TOTAL = Object.values(TARJETA_PAR_PER_HOLE).reduce((a, b) => a + b, 0) // 70

export const TARJETA_NOTAS = 'Notas privadas E2E — tarjeta compartir'

/**
 * Crea una ronda histórica del usuario E2E y devuelve su id.
 *
 * `diasAtras` define la fecha: `historical_rounds` tiene un índice único (usuario, fecha, cancha, golpes), así que
 * dos fixtures vivas a la vez (dos rondas del mismo spec, o dos specs en paralelo) necesitan fechas distintas.
 */
export async function createTarjetaFixture(
  userId: string,
  opts: { privacy?: 'public' | 'private'; notes?: string; diasAtras?: number } = {},
): Promise<string> {
  const sb = adminClient()

  const playedAt = new Date(Date.now() - (opts.diasAtras ?? 3) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const courseRating = 71.2
  const slopeRating = 127
  const diferencial = Math.round(((TARJETA_TOTAL - courseRating) * 113) / slopeRating * 10) / 10

  const { data, error } = await sb.from('historical_rounds').insert({
    user_id: userId,
    course_name: TARJETA_COURSE_NAME,
    course_id: TARJETA_COURSE_ID,
    played_at: playedAt,
    total_gross: TARJETA_TOTAL,
    scores: TARJETA_SCORES,
    holes_played: 18,
    tee_color: 'blanco',
    privacy: opts.privacy ?? 'public',
    slope_rating: slopeRating,
    course_rating: courseRating,
    diferencial,
    formato_juego: 'stroke_play',
    modo_juego: 'gross',
    par_per_hole: TARJETA_PAR_PER_HOLE,
    notes: opts.notes ?? TARJETA_NOTAS,
  }).select('id').single()

  if (error || !data) throw new Error(`createTarjetaFixture falló: ${error?.message}`)
  return data.id
}

/** Borra la ronda; un error se lanza (una ronda huérfana aparecería en el historial del usuario E2E). */
export async function cleanupTarjetaFixture(roundId: string): Promise<void> {
  const { error } = await adminClient().from('historical_rounds').delete().eq('id', roundId)
  if (error) throw new Error(`cleanupTarjetaFixture(${roundId}) falló: ${error.message}`)
}
