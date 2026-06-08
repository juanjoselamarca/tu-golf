/**
 * Resolución de CR/slope desde el catálogo oficial (`course_tees`).
 *
 * Raíz del índice corrupto: el import tomaba CR/slope del ARCHIVO importado
 * (Garmin/foto), no del tee real del catálogo. Acá se resuelve el rating contra
 * `course_tees` por color de tee + género del jugador + hoyos jugados.
 *
 * Columnas reales de `course_tees` (verificadas contra prod 2026-06-06):
 *   nombre   → color del tee (lowercase: "blanco", "azul", ...). Multi-loop:
 *              "azul_andes pro_pacifico sur" (el color es el 1er token).
 *   genero   → 'M' | 'F' (DAMAS/VARONES comparten recorrido, distinto rating).
 *   rating / slope                → CR/slope de 18 hoyos.
 *   front_course_rating / front_slope_rating → 9h front (preferido para 9h).
 *   back_course_rating  / back_slope_rating  → 9h back (fallback / derivación).
 *
 * Devuelve `null` cuando no hay match confiable: el caller NO debe inventar
 * CR/slope (ver spec import-hardening, Pieza 2).
 */

export interface TeeRow {
  nombre: string
  genero?: string | null
  rating: number | null
  slope: number | null
  front_course_rating?: number | null
  front_slope_rating?: number | null
  back_course_rating?: number | null
  back_slope_rating?: number | null
}

export interface ResolvedRatings {
  /** CR de 18 hoyos. */
  cr: number
  /** Slope de 18 hoyos. */
  slope: number
  /**
   * Ratings reales de 9 hoyos para alimentar `calcularDiferencial` (que espera
   * `{ cr9h, slope9h }`). `null` si el catálogo no tiene 9h → la canónica cae a
   * su fallback documentado (cr/2, slope 18h).
   */
  nineHoleRatings: { cr9h: number; slope9h: number } | null
}

function norm(s: string): string {
  // ̀-ͯ = marcas diacríticas combinantes (acentos) tras NFD.
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/** El color real es el primer token antes de '_' (multi-loop combina recorridos). */
function teeColorToken(nombre: string): string {
  return norm(nombre).split('_')[0].trim()
}

/**
 * Resuelve CR/slope para un color de tee. Devuelve `null` si no hay match
 * confiable (color desconocido o tee sin rating de 18h).
 *
 * @param genero opcional ('M'|'F'/'masculino'/'femenino'…): cuando hay tees del
 *   mismo color para ambos géneros, elige el del jugador.
 */
export function resolveRatings(
  tees: TeeRow[],
  teeColor: string | null | undefined,
  holesPlayed: number | null | undefined,
  genero?: string | null,
): ResolvedRatings | null {
  if (!teeColor || !Array.isArray(tees) || tees.length === 0) return null

  const target = norm(teeColor)
  let candidates = tees.filter(t => {
    const n = norm(t.nombre ?? '')
    return n === target || teeColorToken(t.nombre ?? '') === target
  })
  if (candidates.length === 0) return null

  // Desambiguar por género si se conoce y hay tees de ambos.
  if (genero) {
    const g = norm(genero)[0] // 'm' | 'f'
    const byGender = candidates.filter(t => t.genero && norm(t.genero)[0] === g)
    if (byGender.length > 0) candidates = byGender
  }

  const tee = candidates[0]
  if (!tee || tee.rating == null || tee.slope == null) return null

  const cr = Number(tee.rating)
  const slope = Number(tee.slope)

  let nineHoleRatings: ResolvedRatings['nineHoleRatings'] = null
  const is9h = holesPlayed != null && holesPlayed <= 9
  if (is9h) {
    if (tee.front_course_rating != null && tee.front_slope_rating != null) {
      // Front-9 real (preferido).
      nineHoleRatings = { cr9h: Number(tee.front_course_rating), slope9h: Number(tee.front_slope_rating) }
    } else if (tee.back_course_rating != null && tee.back_slope_rating != null) {
      // Sin front explícito: aproximación documentada. El CR se deriva (18h − back),
      // pero el slope es el del BACK (no hay slope front). Mezcla deliberada y
      // acotada; suficiente para el diferencial 9h cuando no hay front rating.
      nineHoleRatings = {
        cr9h: Number((cr - Number(tee.back_course_rating)).toFixed(1)),
        slope9h: Number(tee.back_slope_rating),
      }
    }
    // Si no hay ni front ni back → null: la canónica usa cr/2 documentado.
  }

  return { cr, slope, nineHoleRatings }
}
