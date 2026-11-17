/**
 * CANARIO — /coach tiene UNA definición de espiral y UNA ventana (PR3 Ola 1, 17-nov-2026).
 *
 * Antes había tres "espirales" distintas en la misma pantalla (el chip contaba hoyos
 * en tilt, el costo contaba pares bogey→doble y el detector otra cosa), el costo
 * psicológico mezclaba rondas de 9 y 18 hoyos ("promedio 66.0") y la vista inventaba
 * par 4 donde no había par real. Todo sale ahora de `resumenMentalDelCoach`
 * (src/golf/coach/mental-index.ts) sobre las rondas normalizadas de /perfil/stats.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { normalizarRondas, type RawStatsRound } from '@/golf/stats/rondas-normalizadas'
import { resumenMentalDelCoach } from '@/golf/coach/mental-index'

const SRC = path.resolve(__dirname, '..')
const ESTE_ARCHIVO = path.resolve(__filename)

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : archivos(p)
    return /\.(ts|tsx)$/.test(e.name) ? [p] : []
  })
}

const rel = (p: string) => path.relative(SRC, p).replace(/\\/g, '/')
const VISTA_COACH = [...archivos(path.join(SRC, 'app', 'coach')), ...archivos(path.join(SRC, 'components', 'coach'))]
  .filter(p => !/\.test\.tsx?$/.test(p))

const PROHIBIDO_EN_LA_VISTA: Array<[RegExp, string]> = [
  [/supabase\.from\(/, 'las lecturas viven en src/lib/data/coach-home.ts'],
  [/parPerHoleArray/, 'los pares llegan normalizados (RondaNormalizada.pares)'],
  [/STANDARD_PARS/, 'nunca par estándar inventado en la vista'],
  [/parForHoleWithFallback/, 'nunca par de respaldo en la vista'],
  [/rondasDelCoach/, 'la home lee fetchRondasNormalizadas, no su propia ventana'],
  [/tiltCount/, 'el conteo de espirales sale de espiralesDeRonda'],
  [/\?\?\s*4\b/, 'nunca "?? 4": un par desconocido no es par 4'],
]

describe('canario /coach: una espiral, una ventana', () => {
  it('app/coach y components/coach no leen la base ni inventan pares', () => {
    expect(VISTA_COACH.length).toBeGreaterThan(5)
    const violaciones: string[] = []
    for (const p of VISTA_COACH) {
      const src = fs.readFileSync(p, 'utf8')
      for (const [re, porque] of PROHIBIDO_EN_LA_VISTA) {
        if (re.test(src)) violaciones.push(`${rel(p)}: ${re.source} — ${porque}`)
      }
    }
    expect(violaciones).toEqual([])
  })

  it('las espirales viejas (strokesEvitables, clasificarHoyo) no existen en ningún archivo de src', () => {
    const conViejas = archivos(SRC)
      .filter(p => path.resolve(p) !== ESTE_ARCHIVO)
      .filter(p => /\b(strokesEvitables|clasificarHoyo)\b/.test(fs.readFileSync(p, 'utf8')))
      .map(rel)
    expect(conViejas).toEqual([])
  })

  it('espiralesDeRonda se define en un solo archivo', () => {
    const definiciones = archivos(SRC)
      .filter(p => /(function\s+espiralesDeRonda\b|espiralesDeRonda\s*=)/.test(fs.readFileSync(p, 'utf8')))
      .map(rel)
    expect(definiciones).toEqual(['golf/coach/mental-index.ts'])
  })

  it('conducta: 3 de 18 (88) + 3 de 9 (44) → bucket 18, ventana 3, promedio 88.0 (nunca 66.0)', () => {
    const fila = (i: number, sobrePar: number[]): RawStatsRound => ({
      id: `c${i}`,
      course_name: 'Club',
      course_id: null,
      played_at: `2026-11-${String(20 - i).padStart(2, '0')}`,
      scores: sobrePar.map(s => 4 + s),
      total_gross: null,
      holes_played: sobrePar.length,
      import_source: null,
      par_per_hole: Object.fromEntries(sobrePar.map((_, h) => [String(h + 1), 4])),
      metadata: null,
      formato_juego: null,
    })
    const dieciocho = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0] // 88
    const nueve = [1, 1, 1, 1, 1, 1, 1, 1, 0] // 44
    // Intercaladas: 9, 18, 9, 18, 9, 18 (más reciente primero).
    const filas = Array.from({ length: 6 }, (_, i) => fila(i, i % 2 === 0 ? nueve : dieciocho))
    const { ventana, indice, costo } = resumenMentalDelCoach(normalizarRondas(filas, [], []))
    expect(ventana.bucket).toBe(18)
    expect(ventana.rondas).toHaveLength(3)
    expect(ventana.rondas.every(r => r.total_gross === 88)).toBe(true)
    expect(costo.promedioReal.toFixed(1)).toBe('88.0')
    expect(costo.bucket).toBe(18)
    expect(indice.bucket).toBe(18)
    expect(indice.windowSize).toBe(3)
  })
})
