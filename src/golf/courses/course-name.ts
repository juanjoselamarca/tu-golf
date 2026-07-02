// ============================================================
// Normalización canónica de nombres de cancha — FUENTE ÚNICA.
//
// Usada por el matcher TS (findBestCourseMatch) y espejada en el
// RPC `resolve_and_link_course` (SQL). Objetivo: que la MISMA cancha
// escrita de formas distintas (Garmin, FedeGolf, OCR, manual) colapse
// a una sola forma, y que canchas distintas NO colapsen.
//
// Reglas:
//  - minúsculas + sin acentos
//  - quita marcadores de género (VARONES/DAMAS/CABALLEROS)
//  - separadores/puntuación (. ~ - / , etc.) → espacio
//  - dropea palabras de relleno (club, golf, de, las, country, ...)
//    → así "C.G." y "Club de Golf" colapsan a lo mismo (c/g quedan
//      como tokens de 1 char y se filtran)
//  - ordena los tokens restantes → insensible al orden del loop
//    (Norte-Este == Este-Norte)
// ============================================================

/** Palabras genéricas que no distinguen una cancha de otra. */
export const COMMON_WORDS = new Set([
  'club', 'de', 'golf', 'las', 'los', 'la', 'el', 'del', 'y',
  'country', 'campo', 'and', 'the', 'links', 'course', 'cg',
  '18', '9', 'hole', 'holes', 'hoyos',
])

const GENDER_RE = /\(?\s*\b(varones|damas|caballeros)\b\s*\)?/gi

/** Quita acentos y baja a minúsculas. */
function deburr(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Tokens significativos de un nombre: sin género, sin puntuación,
 * sin palabras comunes, sin tokens de 1 char. NO ordenados.
 */
export function significantTokens(name: string): string[] {
  if (!name) return []
  const noGender = deburr(name).replace(GENDER_RE, ' ')
  return noGender
    .replace(/[^a-z0-9\s]/g, ' ') // puntuación/separadores → espacio
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !COMMON_WORDS.has(w))
}

/**
 * Forma canónica ORDENADA: tokens significativos en su orden original.
 * Distingue el orden del loop (Norte-Este ≠ Este-Norte) — importa porque
 * los pares hoyo-a-hoyo difieren aunque CR/slope sean iguales. Match primario.
 */
export function canonicalOrdered(name: string): string {
  return significantTokens(name).join(' ')
}

/**
 * Forma canónica ORDENADA-ALFABÉTICA (insensible al orden): tokens
 * significativos ordenados. Sólo como FALLBACK cuando no hay match exacto
 * ordenado (ej. convención de nombre distinta entre Garmin y FedeGolf).
 * Dos nombres que refieren a la misma cancha (salvo orden) colapsan aquí.
 */
export function normalizeCourseName(name: string): string {
  return significantTokens(name).slice().sort().join(' ')
}

/** Marcador de género embebido en el nombre de catálogo: 'V' | 'D' | null. */
export function courseGenderMarker(name: string): 'V' | 'D' | null {
  if (!name) return null
  const m = deburr(name).match(/\b(varones|damas|caballeros)\b/)
  if (!m) return null
  return m[1] === 'damas' ? 'D' : 'V'
}
