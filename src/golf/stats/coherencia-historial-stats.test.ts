/**
 * Coherencia /perfil/historial == /perfil/stats.
 *
 * Bug de origen (auditoría 16-nov-2026): las dos pantallas calculaban los mismos
 * números por caminos distintos. Stats no traía formato_juego (un scramble de 62
 * salía como "mejor ronda"), asumía par 4 en rondas sin par por hoyo (eagles y
 * birdies fantasma) y contaba el albatros fuera de los eagles. Este test arma un
 * historial con cada caso borde y exige que ambas pantallas digan lo mismo.
 */
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { computeHistorialStats } from './historial'
import { contarHoyoAHoyo, normalizarRondas, rondasQueCuentan, type CourseHoleRow, type RawStatsRound } from './rondas-normalizadas'
import { useStatsDerived } from '@/app/perfil/stats/hooks/useStatsDerived'

// Cancha A: par 72 (pares 4,4,3,5 repetidos de forma irregular), por course_id.
const paresA = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4]
const holesA: CourseHoleRow[] = paresA.map((par, i) => ({ course_id: 'cA', numero: i + 1, par }))
const courses = [{ id: 'cA', nombre: 'Club de Polo San Cristóbal' }]

const par = (arr: number[]) => Object.fromEntries(arr.map((p, i) => [String(i + 1), p]))

const raw: RawStatsRound[] = [
  // 18h normal con catálogo, sin par_per_hole: un birdie y un bogey → 72 (E).
  {
    id: 'normal18', course_name: 'Club de Polo San Cristóbal', course_id: 'cA', played_at: '2026-06-10',
    scores: paresA.map((p, i) => (i === 0 ? p - 1 : i === 1 ? p + 1 : p)),
    total_gross: 72, holes_played: 18, import_source: null, formato_juego: 'stroke_play',
  },
  // 18h con albatros: par 5 en 2 (par_per_hole de la tarjeta) → 69 (-3).
  {
    id: 'albatros', course_name: 'Cancha Sin Catálogo', course_id: null, played_at: '2026-06-01',
    scores: paresA.map((p, i) => (i === 3 ? 2 : p)), par_per_hole: par(paresA),
    total_gross: 69, holes_played: 18, import_source: 'garmin', formato_juego: 'stroke_play',
  },
  // 9h back (metadata.hoyos 10..18) contra el catálogo de A: todos par → 37 (E).
  {
    id: 'back9', course_name: 'Club de Polo San Cristóbal', course_id: 'cA', played_at: '2026-05-20',
    scores: paresA.slice(9), metadata: { hoyos: [10, 11, 12, 13, 14, 15, 16, 17, 18] },
    total_gross: paresA.slice(9).reduce((a, b) => a + b, 0), holes_played: 9, import_source: null,
    formato_juego: 'stroke_play',
  },
  // 9h front con +5.
  {
    id: 'front9', course_name: 'Club de Polo San Cristóbal', course_id: 'cA', played_at: '2026-05-10',
    scores: paresA.slice(0, 9).map((p, i) => (i < 5 ? p + 1 : p)),
    total_gross: paresA.slice(0, 9).reduce((a, b) => a + b, 0) + 5, holes_played: 9, import_source: null,
    formato_juego: 'stroke_play',
  },
  // Parcial: 12 hoyos marcados de 18. Cuenta hoyo a hoyo, no entra a promedios.
  {
    id: 'parcial', course_name: 'Club de Polo San Cristóbal', course_id: 'cA', played_at: '2026-05-01',
    scores: [...paresA.slice(0, 12).map((p, i) => (i < 6 ? p - 1 : p)), ...Array(6).fill(null)],
    total_gross: null, holes_played: 18, import_source: null, formato_juego: 'stroke_play',
  },
  // Match play con hoyos estimados (concedidos): no entra a promedios, los estimados no cuentan.
  {
    id: 'match', course_name: 'Club de Polo San Cristóbal', course_id: 'cA', played_at: '2026-04-20',
    scores: paresA.map((p, i) => (i < 2 ? p - 1 : p)),
    metadata: { estimados: [{ hoyo: 1 }] },
    total_gross: 70, holes_played: 18, import_source: null, formato_juego: 'match_play',
  },
  // Scramble explícito: 62 (-10). Nunca mejor ronda ni birdies del jugador.
  {
    id: 'scramble', course_name: 'Las Brisas N-S', course_id: null, played_at: '2025-02-22',
    scores: paresA.map((p, i) => (i < 10 ? p - 1 : p)), par_per_hole: par(paresA),
    total_gross: 62, holes_played: 18, import_source: 'garmin_zip', formato_juego: 'scramble',
  },
  // Sin par_per_hole y sin catálogo: vsPar a par estándar, ningún hoyo cuenta (nada de par 4 inventado).
  {
    id: 'sinpar', course_name: 'Cancha Desconocida', course_id: null, played_at: '2026-03-01',
    scores: Array(18).fill(4).map((s, i) => (i === 0 ? 2 : s)),
    total_gross: 70, holes_played: 18, import_source: 'garmin', formato_juego: 'stroke_play',
  },
]

describe('coherencia historial == stats', () => {
  const historial = computeHistorialStats(raw, courses, holesA)
  const { result } = renderHook(() => useStatsDerived(normalizarRondas(raw, courses, holesA), 'all'))
  const stats = result.current

  it('mismo conteo hoyo a hoyo sobre el mismo set; la pantalla de stats cuenta solo su bucket', () => {
    expect(stats.scoringCounts).toEqual(contarHoyoAHoyo(rondasQueCuentan(normalizarRondas(raw, courses, holesA), 18)))
    expect({
      eagles: stats.agregados.totalEagles,
      birdies: stats.agregados.totalBirdies,
      pars: stats.agregados.totalPars,
      bogeys: stats.agregados.totalBogeys,
      doubles: stats.agregados.totalDoubles,
    }).toEqual({
      eagles: historial.totalEagles,
      birdies: historial.totalBirdies,
      pars: historial.totalPars,
      bogeys: historial.totalBogeys,
      doubles: historial.totalDoubles,
    })
  })

  it('mismas mejores rondas y mismo promedio', () => {
    expect(stats.agregados.bestRound18).toEqual(historial.bestRound18)
    expect(stats.agregados.bestRound9).toEqual(historial.bestRound9)
    expect(stats.agregados.avgOverPar18).toBe(historial.avgOverPar18)
    expect(stats.agregados.avgOverPar9).toBe(historial.avgOverPar9)
    expect(stats.cifras?.bucket).toBe(18)
    expect(stats.cifras?.promedioVsPar).toBe(historial.avgOverPar18)
    expect(stats.cifras?.mejorRonda).toEqual(historial.bestRound18)
  })

  it('los valores son los correctos, no solo iguales entre sí', () => {
    // albatros cuenta como eagle; el 2 sin par real no; el scramble no suma nada
    expect(historial.totalEagles).toBe(1)
    // normal18: 1 · parcial: 6 · match: 1 (el hoyo 1 estimado no cuenta)
    expect(historial.totalBirdies).toBe(8)
    expect(historial.bestRound18?.roundId).toBe('albatros')
    expect(historial.bestRound18?.vsPar).toBe(-3)
    expect(historial.bestRound9?.roundId).toBe('back9')
    expect(historial.bestRound9?.vsPar).toBe(0)
    // 18h que cuentan: normal18 (0), albatros (-3), sinpar (-2) → -1.7
    expect(historial.avgOverPar18).toBe(-1.7)
  })
})
