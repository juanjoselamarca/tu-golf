import { describe, it, expect } from 'vitest'
import { findBestCourseMatch } from '../golf/courses/matching'

// Real Chilean golf course candidates (subset)
const candidates = [
  { id: '1', nombre: 'Club de Golf Las Brisas de Santo Domingo' },
  { id: '2', nombre: 'Club de Golf Rocas de Santo Domingo' },
  { id: '3', nombre: 'Marbella Country Club' },
  { id: '4', nombre: 'Club de Golf Sport Francés' },
  { id: '5', nombre: 'Club de Polo y Equitación San Cristóbal' },
  { id: '6', nombre: 'Club de Golf Los Leones' },
  { id: '7', nombre: 'Lomas de La Dehesa' },
  { id: '8', nombre: 'Mapocho Golf Club' },
  { id: '9', nombre: 'Prince of Wales Country Club' },
  { id: '10', nombre: 'Club de Golf Hacienda Chicureo' },
]

describe('findBestCourseMatch — exact matches', () => {
  it('finds exact name match', () => {
    const result = findBestCourseMatch('Club de Golf Las Brisas de Santo Domingo', candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('1')
  })

  it('matches case-insensitive', () => {
    const result = findBestCourseMatch('CLUB DE GOLF LAS BRISAS DE SANTO DOMINGO', candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('1')
  })

  it('matches with accents removed', () => {
    const result = findBestCourseMatch('Sport Frances', candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('4')
  })

  it('matches with accents added', () => {
    const result = findBestCourseMatch('Sport Francés', candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('4')
  })
})

describe('findBestCourseMatch — disambiguation', () => {
  it('disambiguates Brisas vs Rocas (both Santo Domingo)', () => {
    const brisas = findBestCourseMatch('Brisas Santo Domingo', candidates)
    const rocas = findBestCourseMatch('Rocas Santo Domingo', candidates)
    expect(brisas!.id).toBe('1')
    expect(rocas!.id).toBe('2')
  })

  it('matches Garmin combo names (with ~)', () => {
    // Garmin format: "Course Name~Loop Name"
    const result = findBestCourseMatch('Las Brisas Santo Domingo~Front 9', candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('1')
  })
})

describe('findBestCourseMatch — partial matches', () => {
  it('matches by single significant word', () => {
    const result = findBestCourseMatch('Marbella', candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('3')
  })

  it('matches Lomas de La Dehesa with abbreviation', () => {
    const result = findBestCourseMatch('Lomas Dehesa', candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('7')
  })

  it('matches Hacienda Chicureo by city only', () => {
    const result = findBestCourseMatch('Chicureo', candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('10')
  })

  it('matches partial word stems (e.g., "brisa" → "brisas")', () => {
    const result = findBestCourseMatch('Brisa Santo Domingo', candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('1')
  })
})

describe('findBestCourseMatch — no match cases', () => {
  it('returns null for empty external name', () => {
    expect(findBestCourseMatch('', candidates)).toBeNull()
  })

  it('returns null for empty candidates', () => {
    expect(findBestCourseMatch('Las Brisas', [])).toBeNull()
  })

  it('returns null for completely unrelated name', () => {
    expect(findBestCourseMatch('Augusta National', candidates)).toBeNull()
  })

  it('returns null when only common words match', () => {
    // "Club de Golf" alone shouldn't match anything (all common words)
    expect(findBestCourseMatch('Club de Golf', candidates)).toBeNull()
  })

  it('respects minScore parameter', () => {
    // Marbella → score 2 (1 significant word matched). With minScore=3, no match.
    const matchLow = findBestCourseMatch('Marbella', candidates, 2)
    const matchHigh = findBestCourseMatch('Marbella', candidates, 10)
    expect(matchLow).not.toBeNull()
    expect(matchHigh).toBeNull()
  })
})

describe('findBestCourseMatch — score returned', () => {
  it('exact substring match gets bonus +5', () => {
    const result = findBestCourseMatch('Marbella Country Club', candidates)
    expect(result).not.toBeNull()
    // marbella + country (2 words = 4) + substring bonus (5) = 9
    expect(result!.score).toBeGreaterThanOrEqual(7)
  })

  it('best score wins among multiple candidates', () => {
    const dual = [
      { id: 'a', nombre: 'Las Brisas de Santo Domingo' },
      { id: 'b', nombre: 'Brisas del Mar' },
    ]
    const result = findBestCourseMatch('Las Brisas Santo Domingo', dual)
    expect(result).not.toBeNull()
    // 'a' shares brisas + santo + domingo = 6, 'b' shares only brisas = 2
    expect(result!.id).toBe('a')
  })
})

describe('findBestCourseMatch — special characters', () => {
  it('handles names with punctuation', () => {
    const result = findBestCourseMatch("Prince of Wales", candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('9')
  })

  it('strips numbers and only matches significant words', () => {
    const result = findBestCourseMatch('Marbella 18', candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('3')
  })

  it('handles extra whitespace', () => {
    const result = findBestCourseMatch('  Marbella    Country  ', candidates)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('3')
  })
})

describe('findBestCourseMatch — fuente fedegolf + canónico', () => {
  it('prefiere la fila fedegolf ante empate de score', () => {
    const db = [
      { id: 'man', nombre: 'Club de Golf Los Leones', fuente: 'manual' },
      { id: 'fede', nombre: 'C.G. Los Leones (VARONES)', fuente: 'fedegolf' },
    ]
    expect(findBestCourseMatch('Los Leones', db)!.id).toBe('fede')
  })

  it('resuelve a través de canonical_course_id (devuelve la canónica, no la duplicada)', () => {
    const db = [
      { id: 'dup', nombre: 'Club de Golf Marbella', fuente: 'manual', canonical_course_id: 'good', activa: false },
      { id: 'good', nombre: 'Club de Golf Marbella', fuente: 'fedegolf', canonical_course_id: null, activa: true },
    ]
    expect(findBestCourseMatch('Marbella', db)!.id).toBe('good')
  })

  it('si la fila ganadora apunta a una canónica, devuelve la canónica aunque gane la duplicada', () => {
    // Solo la duplicada matchea por nombre, pero su canonical apunta a otra ficha.
    const db = [
      { id: 'dup', nombre: 'Club de Golf Sotogrande', fuente: 'manual', canonical_course_id: 'canon' },
      { id: 'canon', nombre: 'La Otra Cancha', fuente: 'fedegolf', canonical_course_id: null },
    ]
    expect(findBestCourseMatch('Sotogrande', db)!.id).toBe('canon')
  })

  it('fallback fuzzy: matchea un typo que el overlap de palabras no agarra', () => {
    const db = [{ id: 'x', nombre: 'Marbella' }]
    // "Marbela" (typo, una L) no es igualdad de palabra exacta pero ratio alto.
    const r = findBestCourseMatch('Marbela', db)
    expect(r).not.toBeNull()
    expect(r!.id).toBe('x')
  })

  it('C3: devuelve la canónica aunque NO esté en el candidate-set', () => {
    // El ilike trajo solo la fedegolf desactivada; la manual canónica no quedó en
    // el set. Aun así el matcher conoce su id por canonical_course_id → la devuelve.
    const db = [
      { id: 'fede', nombre: 'C.G. Los Leones - Los Leones (VARONES)', fuente: 'fedegolf', canonical_course_id: 'manual-leones', activa: false },
    ]
    const m = findBestCourseMatch('Los Leones', db)
    expect(m!.id).toBe('manual-leones')
  })

  it('canario dedup: con la ficha manual canónica y la fedegolf redirigida, gana la manual', () => {
    // Estado post-dedup: manual = canónica (canonical null, activa), fedegolf
    // apunta a la manual y está desactivada. El matcher devuelve la manual.
    const db = [
      { id: 'manual-leones', nombre: 'Club de Golf Los Leones', fuente: 'manual', canonical_course_id: null, activa: true },
      { id: 'fedegolf-leones', nombre: 'C.G. Los Leones - Los Leones (VARONES)', fuente: 'fedegolf', canonical_course_id: 'manual-leones', activa: false },
    ]
    expect(findBestCourseMatch('Los Leones', db)!.id).toBe('manual-leones')
  })
})
