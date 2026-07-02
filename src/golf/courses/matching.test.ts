import { describe, it, expect } from 'vitest'
import { findBestCourseMatch, type CourseCandidate } from './matching'

// Candidatos reales del catálogo FedeGolf (Brisas Santo Domingo, VARONES),
// incluyendo los dos loops de orden invertido que colapsaban en v1.
const brisas: CourseCandidate[] = [
  { id: 'norte-este', nombre: 'C.G. Las Brisas De Santo Domingo - Norte - Este (VARONES)', fuente: 'fedegolf' },
  { id: 'este-norte', nombre: 'C.G. Las Brisas De Santo Domingo - Este - Norte (VARONES)', fuente: 'fedegolf' },
  { id: 'norte-sur',  nombre: 'C.G. Las Brisas De Santo Domingo - Norte - Sur (VARONES)',  fuente: 'fedegolf' },
  { id: 'otra',       nombre: 'C.G. Las Brisas De Chicureo - El Valle (VARONES)',           fuente: 'fedegolf' },
]

describe('findBestCourseMatch — orden de loop e identidad', () => {
  it('ronda "Norte-Este" prefiere la ficha Norte-Este (no Este-Norte)', () => {
    const m = findBestCourseMatch('Club de Golf Las Brisas de Santo Domingo ~ Norte-Este', brisas)
    expect(m?.id).toBe('norte-este')
  })

  it('ronda "Norte-Sur" resuelve a Norte-Sur', () => {
    const m = findBestCourseMatch('Club de Golf Las Brisas de Santo Domingo ~ Norte-Sur', brisas)
    expect(m?.id).toBe('norte-sur')
  })

  it('C.G. vs Club de Golf no impide el match', () => {
    const m = findBestCourseMatch('C.G. Las Brisas de Chicureo El Valle', brisas)
    expect(m?.id).toBe('otra')
  })

  it('nombre desconocido no matchea nada de Brisas', () => {
    const m = findBestCourseMatch('El Manzano', brisas)
    expect(m).toBeNull()
  })
})
