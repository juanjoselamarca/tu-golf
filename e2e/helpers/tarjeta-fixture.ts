/**
 * Fixture de `/tarjeta/[id]`: una ronda histórica del usuario E2E en la base de pruebas.
 *
 * La usan `tarjeta-compartir.spec.ts` (el dueño con sesión) y `tarjeta-publica-anonimo.spec.ts`
 * (el que abre el link sin cuenta). Cada spec borra lo que crea en su `afterAll`.
 */
import { adminClient, DEFAULT_COURSE_ID } from './ronda-fixture'

export const TARJETA_COURSE_NAME = 'Los Leones'
export const TARJETA_COURSE_ID = DEFAULT_COURSE_ID

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
 *
 * Antes de insertar borra la fila con esa misma clave y estas mismas notas: si una corrida anterior se cortó antes
 * de su `afterAll`, la fila quedó y el insert chocaría con el índice todo el día.
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
  const notes = opts.notes ?? TARJETA_NOTAS

  const { error: errSobra } = await sb.from('historical_rounds').delete()
    .eq('user_id', userId).eq('course_id', TARJETA_COURSE_ID).eq('played_at', playedAt)
    .eq('total_gross', TARJETA_TOTAL).eq('notes', notes)
  if (errSobra) throw new Error(`createTarjetaFixture: no se pudo limpiar la sobra de una corrida anterior: ${errSobra.message}`)

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
    notes,
  }).select('id').single()

  if (error || !data) throw new Error(`createTarjetaFixture falló: ${error?.message}`)
  return data.id
}

/** Borra la ronda; un error se lanza (una ronda huérfana aparecería en el historial del usuario E2E). */
export async function cleanupTarjetaFixture(roundId: string): Promise<void> {
  const { error } = await adminClient().from('historical_rounds').delete().eq('id', roundId)
  if (error) throw new Error(`cleanupTarjetaFixture(${roundId}) falló: ${error.message}`)
}

/** `profiles.name` del usuario E2E, sin espacios. Lanza si no tiene: sin nombre real, un test del nombre no discrimina. */
export async function nombreDelUsuarioE2E(userId: string): Promise<string> {
  const { data, error } = await adminClient().from('profiles').select('name').eq('id', userId).single()
  if (error) throw new Error(`no se pudo leer el perfil del usuario E2E: ${error.message}`)
  const nombre = ((data as { name: string | null } | null)?.name ?? '').trim()
  // "Jugador" es el texto que pinta la tarjeta cuando no tiene el nombre: con ese nombre el test pasaría con el bug.
  if (!nombre || nombre === 'Jugador') throw new Error(`el usuario E2E necesita un nombre real en profiles.name (tiene: "${data?.name}")`)
  return nombre
}
