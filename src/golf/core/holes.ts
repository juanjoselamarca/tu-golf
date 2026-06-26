/**
 * Inferencia de hole count para rondas históricas.
 *
 * `historical_rounds.holes_played` es null en ~68% de las rondas (datos viejos
 * sin la columna populated). Para no contaminar agregados (avg score, promedio
 * por cancha, tendencias) con la mezcla de 9h/18h, este helper infiere el
 * hole count desde el campo `scores` cuando `holes_played` está ausente.
 *
 * Returns:
 *   9 | 18 si se puede determinar con confianza
 *   null si no hay data suficiente (scores no es array reconocible)
 *
 * NUNCA promediar entre buckets — ese es el bug que este módulo previene.
 */
export type HoleCount = 9 | 18

export type HoleCountInput = {
  holes_played?: number | null
  scores?: number[] | Record<string, number> | null
}

export function inferHoles(r: HoleCountInput): HoleCount | null {
  if (r.holes_played === 9 || r.holes_played === 18) return r.holes_played
  if (Array.isArray(r.scores)) {
    if (r.scores.length === 9) return 9
    if (r.scores.length === 18) return 18
    return null
  }
  if (r.scores && typeof r.scores === 'object') {
    const n = Object.keys(r.scores).length
    if (n === 9) return 9
    if (n === 18) return 18
  }
  return null
}

/**
 * Input shape de `historical_rounds.par_per_hole` y `rondas_libres` pares.
 *
 * La columna se guarda como JSONB objeto `{"1":4,"2":3,...}` en BD pero el
 * codebase histórico la declaraba como `number[]`. El cast forzado funcionaba
 * sólo cuando el JSONB venía deserializado por el cliente Supabase como array
 * (que no pasa con objetos). Resultado: en par 71 reales (Los Leones, Sport
 * Francés, Prince of Wales) las métricas computadas con par caían a fallback
 * par 72 sin ningún error visible.
 *
 * Este helper normaliza ambos shapes a array ordenado por número de hoyo
 * (1..N). Cualquier código que necesite consumir `par_per_hole` debe usar
 * este helper — NO castear directo a `number[]`.
 */
export type ParPerHoleInput = number[] | Record<string, number> | null | undefined

/**
 * Normaliza `par_per_hole` a `number[]` ordenado por hoyo.
 *
 * Acepta:
 *  - `number[]` legacy (length 9 o 18, valores en rango par válido)
 *  - `Record<string, number>` JSONB BD (keys "1".."N", values 3-6)
 *  - `null` / `undefined` / shape inválido → devuelve `null`
 *
 * Validaciones:
 *  - Length debe ser 9 o 18 (no aceptamos 12, 15, etc.)
 *  - Cada par en rango 3..6 (golf real)
 *  - Keys consecutivas desde 1 (no aceptamos huecos)
 *
 * @example
 *   parPerHoleArray({"1":4,"2":3,"3":4,...,"18":5})  // → [4,3,4,...,5]
 *   parPerHoleArray([4,3,4,5,4,4,3,4,5])             // → [4,3,4,5,4,4,3,4,5]
 *   parPerHoleArray(null)                            // → null
 *   parPerHoleArray({"1":4,"3":4})                   // → null (huecos)
 */
export function parPerHoleArray(input: ParPerHoleInput): number[] | null {
  if (input == null) return null

  // Caso 1: array legacy
  if (Array.isArray(input)) {
    if (input.length !== 9 && input.length !== 18) return null
    if (!input.every((p) => typeof p === 'number' && p >= 3 && p <= 6)) return null
    return input
  }

  // Caso 2: JSONB object {"1":4, "2":3, ...}
  if (typeof input === 'object') {
    const entries = Object.entries(input)
    const len = entries.length
    if (len !== 9 && len !== 18) return null

    // Parsear keys numéricas, validar que sean consecutivas desde 1
    const sorted: Array<[number, unknown]> = []
    for (const [k, v] of entries) {
      const n = parseInt(k, 10)
      if (isNaN(n) || n < 1 || n > 18) return null
      sorted.push([n, v])
    }
    sorted.sort((a, b) => a[0] - b[0])

    // Verificar consecutividad
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i][0] !== i + 1) return null
    }

    // Extraer valores y validar par range
    const out: number[] = []
    for (const [, v] of sorted) {
      if (typeof v !== 'number' || v < 3 || v > 6) return null
      out.push(v)
    }
    return out
  }

  return null
}

/**
 * Suma del par REAL de los hoyos JUGADOS, a partir de `par_per_hole`.
 *
 * Fuente única para "par de esta ronda" cuando hay datos por hoyo. Devuelve
 * `null` si el shape es inválido/ausente — el caller decide el fallback
 * (típicamente el estimado `getParForHoles` 36/72).
 *
 * `par_per_hole` en BD trae SIEMPRE los 18 hoyos del campo, aunque la ronda
 * sea de 9. Por eso se recorta a `holesPlayed` (los primeros N). Sin
 * `holesPlayed` suma el campo completo.
 *
 * LIMITACIÓN conocida: en rondas de 9 hoyos asume el FRONT nine (primeros N).
 * `historical_rounds` no guarda qué 9 se jugaron, así que para un back-nine con
 * front≠back par el total puede quedar off por algunos golpes. Es limitación de
 * datos, no del helper; si en el futuro se suman los `scores` por número de hoyo
 * real, indexar por esas keys lo cierra del todo.
 *
 * Cierra el bug P0 de la tarjeta OG: usaba par fijo 36/72 en vez del par real,
 * mostrando vs-par incorrecto al compartir rondas en canchas par ≠ 72 (y −27
 * en rondas de 9 hoyos al restar el par de los 18).
 */
export function parForRound(
  input: ParPerHoleInput,
  holesPlayed?: number | null,
): number | null {
  const arr = parPerHoleArray(input)
  if (!arr) return null
  if (holesPlayed == null) return arr.reduce((sum, p) => sum + p, 0)
  if (holesPlayed <= 0) return null
  return arr.slice(0, Math.min(holesPlayed, arr.length)).reduce((sum, p) => sum + p, 0)
}
