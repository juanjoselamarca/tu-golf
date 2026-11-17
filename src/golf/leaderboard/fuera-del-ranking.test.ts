import { describe, it, expect } from 'vitest'
import { separarFueraDelRanking, estadoFueraPorTarjeta, brutoDeLaTarjeta } from './fuera-del-ranking'

const HOYOS = Array.from({ length: 18 }, (_, i) => ({ numero: i + 1, par: 4, stroke_index: i + 1 }))
const golpes = (n: number, g = 4) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), g]))

const tarjeta = (id: string, nombre: string, scores: Record<string, number>, user_id: string | null = null) =>
  ({ id, ronda_id: 'rl1', user_id, nombre, scores })

describe('separarFueraDelRanking (#813)', () => {
  it('el WD sale del ranking y va al pie con sus golpes (hoyo 12 yendo -2)', () => {
    const wdScores = { ...golpes(12), '3': 3, '7': 3 } // 12 hoyos, -2
    const out = separarFueraDelRanking({
      tarjetas: [tarjeta('t-wd', 'Retirado', wdScores), tarjeta('t-ok', 'Termina', golpes(18, 5))],
      grupos: [{ ronda_libre_id: 'rl1', tournament_group_players: [
        { player_id: 'p-wd', jugador_ronda_id: 't-wd' }, { player_id: 'p-ok', jugador_ronda_id: 't-ok' },
      ] }],
      inscritos: [{ id: 'p-wd', status: 'withdrawn', status_reason: 'Lesión' }],
      courseHoles: HOYOS,
      totalHoyos: 18,
    })
    expect(out.enRanking.map((t) => t.id)).toEqual(['t-ok'])
    expect(out.fuera).toEqual([
      { tarjetaId: 't-wd', nombre: 'Retirado', status: 'withdrawn', reason: 'Lesión', grossTotal: 46, hoyos: 12, vsPar: -2 },
    ])
  })

  it('el DQ también sale; un inscrito aprobado no', () => {
    const out = separarFueraDelRanking({
      tarjetas: [tarjeta('t-dq', 'Descalificado', golpes(5)), tarjeta('t-ok', 'Ok', golpes(5))],
      grupos: [{ ronda_libre_id: 'rl1', tournament_group_players: [
        { player_id: 'p-dq', jugador_ronda_id: 't-dq' }, { player_id: 'p-ok', jugador_ronda_id: 't-ok' },
      ] }],
      inscritos: [{ id: 'p-dq', status: 'disqualified' }, { id: 'p-ok', status: 'approved' }],
      courseHoles: HOYOS,
      totalHoyos: 18,
    })
    expect(out.enRanking.map((t) => t.id)).toEqual(['t-ok'])
    expect(out.fuera[0]).toMatchObject({ tarjetaId: 't-dq', status: 'disqualified', reason: null })
  })

  it('sin enlace jugador_ronda_id, resuelve por user_id SOLO dentro de la ronda de su grupo', () => {
    const tarjetas = [
      { id: 't-a', ronda_id: 'rl1', user_id: 'u1', nombre: 'A', scores: {} },
      { id: 't-otra', ronda_id: 'rl2', user_id: 'u1', nombre: 'A en otra', scores: {} },
    ]
    const estados = estadoFueraPorTarjeta(
      [{ ronda_libre_id: 'rl1', tournament_group_players: [{ player_id: 'p1', jugador_ronda_id: null }] }],
      [{ id: 'p1', user_id: 'u1', status: 'withdrawn' }],
      tarjetas,
    )
    expect([...estados.keys()]).toEqual(['t-a'])
  })

  it('sin nadie fuera devuelve las mismas tarjetas', () => {
    const tarjetas = [tarjeta('t1', 'Uno', golpes(3))]
    const out = separarFueraDelRanking({ tarjetas, grupos: [], inscritos: [], courseHoles: HOYOS, totalHoyos: 18 })
    expect(out.enRanking).toBe(tarjetas)
    expect(out.fuera).toEqual([])
  })

  it('pie ordenado: más hoyos primero; a igualdad WD antes que DQ', () => {
    const out = separarFueraDelRanking({
      tarjetas: [tarjeta('a', 'Ana', golpes(4)), tarjeta('b', 'Beto', golpes(9)), tarjeta('c', 'Caro', golpes(4))],
      grupos: [{ ronda_libre_id: 'rl1', tournament_group_players: [
        { player_id: 'pa', jugador_ronda_id: 'a' }, { player_id: 'pb', jugador_ronda_id: 'b' }, { player_id: 'pc', jugador_ronda_id: 'c' },
      ] }],
      inscritos: [{ id: 'pa', status: 'disqualified' }, { id: 'pb', status: 'withdrawn' }, { id: 'pc', status: 'withdrawn' }],
      courseHoles: HOYOS,
      totalHoyos: 18,
    })
    expect(out.fuera.map((f) => f.nombre)).toEqual(['Beto', 'Caro', 'Ana'])
  })
})

describe('brutoDeLaTarjeta', () => {
  it('sin hoyos: 0 golpes y vsPar 0', () => {
    expect(brutoDeLaTarjeta(null, HOYOS, 18)).toEqual({ grossTotal: 0, hoyos: 0, vsPar: 0 })
  })
  it('ignora hoyos fuera de la vuelta', () => {
    expect(brutoDeLaTarjeta({ '1': 5, '10': 4 }, HOYOS, 9)).toEqual({ grossTotal: 5, hoyos: 1, vsPar: 1 })
  })
})
