import { describe, it, expect } from 'vitest'
import { summarizeBucket } from './tools'

type Row = Parameters<typeof summarizeBucket>[0][number]

function row(partial: Partial<Row>): Row {
  return {
    total_gross: 45,
    course_id: null,
    course_name: 'Cancha',
    played_at: '2026-01-01',
    holes_played: 9,
    scores: null,
    ...partial,
  }
}

describe('summarizeBucket — agrupación de top_canchas por identidad de cancha', () => {
  it('junta variantes de nombre que comparten course_id en UNA sola cancha', () => {
    // Bug reportado: la misma cancha física (mismo course_id) aparecía partida
    // en el coach porque las rondas tenían el nombre escrito distinto.
    const cid = 'c0000000-0000-0000-0000-000000000001'
    const rounds = [
      row({ course_id: cid, course_name: 'Club De Golf Los Leones', total_gross: 46 }),
      row({ course_id: cid, course_name: 'Club de Golf Los Leones', total_gross: 44 }),
      row({ course_id: cid, course_name: 'Los Leones', total_gross: 48 }),
    ]
    const out = summarizeBucket(rounds)!
    expect(out.top_canchas).toHaveLength(1)
    expect(out.top_canchas[0].rondas).toBe(3)
    // Promedio combinado real, no el de un subgrupo arbitrario.
    expect(out.top_canchas[0].avg_score).toBe(46)
    // El agrupamiento por cancha NO debe alterar las stats globales del bucket.
    expect(out.avg_score).toBe(46)
    expect(out.best_score).toBe(44)
    expect(out.worst_score).toBe(48)
    // Nombre representativo = variante más frecuente (acá hay empate 1-1-1 →
    // toma la primera vista, pero debe ser una de las variantes reales).
    expect(['Club De Golf Los Leones', 'Club de Golf Los Leones', 'Los Leones'])
      .toContain(out.top_canchas[0].cancha)
  })

  it('usa la variante de nombre MÁS frecuente como etiqueta', () => {
    const cid = 'c0000000-0000-0000-0000-000000000002'
    const rounds = [
      row({ course_id: cid, course_name: 'Club de Golf Los Leones' }),
      row({ course_id: cid, course_name: 'Club de Golf Los Leones' }),
      row({ course_id: cid, course_name: 'Los Leones' }),
    ]
    const out = summarizeBucket(rounds)!
    expect(out.top_canchas).toHaveLength(1)
    expect(out.top_canchas[0].cancha).toBe('Club de Golf Los Leones')
  })

  it('mantiene separadas canchas con course_id distinto aunque el nombre coincida', () => {
    const rounds = [
      row({ course_id: 'c0000000-0000-0000-0000-0000000000aa', course_name: 'Los Leones' }),
      row({ course_id: 'c0000000-0000-0000-0000-0000000000bb', course_name: 'Los Leones' }),
    ]
    const out = summarizeBucket(rounds)!
    // Son dos course_id distintos → el coach debe verlas como dos entradas.
    // (La unificación de esos course_id duplicados es trabajo de la capa de datos.)
    expect(out.top_canchas).toHaveLength(2)
  })

  it('cae al nombre normalizado cuando no hay course_id (rondas viejas)', () => {
    const rounds = [
      row({ course_id: null, course_name: 'Los Leones' }),
      row({ course_id: null, course_name: 'los leones' }),
      row({ course_id: null, course_name: '  Los Leones  ' }),
    ]
    const out = summarizeBucket(rounds)!
    expect(out.top_canchas).toHaveLength(1)
    expect(out.top_canchas[0].rondas).toBe(3)
  })

  it('devuelve null para bucket vacío', () => {
    expect(summarizeBucket([])).toBeNull()
  })

  it('expone el course_id de cada cancha (el coach lo necesita para el scorecard)', () => {
    const cid = 'dff847e1-34d9-4805-85a7-01ec3e554f65'
    const rounds = [
      row({ course_id: cid, course_name: 'Club de Golf Lomas de La Dehesa', total_gross: 86 }),
      row({ course_id: cid, course_name: 'Club Golf Lomas De La Dehesa', total_gross: 92 }),
    ]
    const out = summarizeBucket(rounds)!
    expect(out.top_canchas).toHaveLength(1)
    // Antes el id se calculaba y se descartaba → el coach solo veía el nombre y
    // no podía pedir los pares. Ahora viaja el course_id canónico.
    expect(out.top_canchas[0].course_id).toBe(cid)
  })

  it('expone course_id null en rondas viejas agrupadas por nombre', () => {
    const out = summarizeBucket([
      row({ course_id: null, course_name: 'Los Leones' }),
      row({ course_id: null, course_name: 'los leones' }),
    ])!
    expect(out.top_canchas[0].course_id).toBeNull()
  })
})
