import { describe, expect, it } from 'vitest'
import {
  estadoDelEquipoFoursome,
  estadoFueraPorTarjeta,
  ordenDelPie,
  scoresQueCuentanEnMejorBola,
  separarFueraDelRanking,
  type GrupoConTarjetas,
  type InscritoConEstado,
  type TarjetaDelTorneo,
} from './fuera-del-ranking'

const T = (id: string, ronda_id: string, user_id: string | null): TarjetaDelTorneo => ({ id, ronda_id, user_id })
const G = (ronda_libre_id: string | null, gps: Array<[string, string | null]>): GrupoConTarjetas => ({
  ronda_libre_id,
  tournament_group_players: gps.map(([player_id, jugador_ronda_id]) => ({ player_id, jugador_ronda_id })),
})
const P = (id: string, status: string, user_id: string | null = null, status_reason: string | null = null): InscritoConEstado =>
  ({ id, status, user_id, status_reason })

describe('estadoFueraPorTarjeta (#813)', () => {
  it('resuelve por el enlace jugador_ronda_id; el aprobado no sale', () => {
    const r = estadoFueraPorTarjeta(
      [G('r1', [['p-ana', 'j-ana'], ['p-beto', 'j-beto'], ['p-caro', 'j-caro']])],
      [P('p-ana', 'withdrawn'), P('p-beto', 'disqualified'), P('p-caro', 'approved')],
      [T('j-ana', 'r1', null), T('j-beto', 'r1', null), T('j-caro', 'r1', null)],
    )
    expect([...r.porTarjeta.keys()].sort()).toEqual(['j-ana', 'j-beto'])
    expect(r.porTarjeta.get('j-beto')?.status).toBe('disqualified')
    expect(r.sinResolver).toEqual([])
  })

  it('sin enlace, por user_id SÓLO en la ronda de su grupo', () => {
    const r = estadoFueraPorTarjeta(
      [G('r1', [['p-ana', null]]), G('r2', [])],
      [P('p-ana', 'withdrawn', 'u-ana')],
      // La misma cuenta tiene otra tarjeta en otra ronda (otro torneo / otra salida): no se toca.
      [T('j-r1', 'r1', 'u-ana'), T('j-r2', 'r2', 'u-ana')],
    )
    expect([...r.porTarjeta.keys()]).toEqual(['j-r1'])
  })

  it('INVITADO sin enlace (sin cuenta): no se adivina por nombre, se REPORTA como sin resolver', () => {
    const r = estadoFueraPorTarjeta(
      [G('r1', [['p-inv', null]])],
      [P('p-inv', 'withdrawn', null)],
      [T('j-inv', 'r1', null)],
    )
    expect(r.porTarjeta.size).toBe(0)
    expect(r.sinResolver.map((p) => p.id)).toEqual(['p-inv'])
  })

  it('dos tarjetas de la misma cuenta en la ronda: ambiguo, se reporta y no se elige una', () => {
    const r = estadoFueraPorTarjeta(
      [G('r1', [['p-ana', null]])],
      [P('p-ana', 'withdrawn', 'u-ana')],
      [T('j-1', 'r1', 'u-ana'), T('j-2', 'r1', 'u-ana')],
    )
    expect(r.porTarjeta.size).toBe(0)
    expect(r.sinResolver.map((p) => p.id)).toEqual(['p-ana'])
  })

  it('WD sin fila de grupo pero con UNA tarjeta suya en el torneo: sale igual', () => {
    const r = estadoFueraPorTarjeta([G('r1', [])], [P('p-ana', 'withdrawn', 'u-ana')], [T('j-ana', 'r1', 'u-ana')])
    expect([...r.porTarjeta.keys()]).toEqual(['j-ana'])
  })

  it('WD sin fila de grupo y sin tarjeta (se retiró antes de jugar): nada que sacar ni reportar', () => {
    const r = estadoFueraPorTarjeta([G('r1', [])], [P('p-ana', 'withdrawn', 'u-ana')], [T('j-otro', 'r1', 'u-otro')])
    expect(r.porTarjeta.size).toBe(0)
    expect(r.sinResolver).toEqual([])
  })

  it('grupo sin ronda (legacy) sin enlace: no es un pendiente del camino de ronda libre', () => {
    const r = estadoFueraPorTarjeta([G(null, [['p-ana', null]])], [P('p-ana', 'withdrawn')], [T('j-x', 'r1', null)])
    expect(r.sinResolver).toEqual([])
  })
})

describe('separarFueraDelRanking', () => {
  it('sin nadie fuera devuelve el MISMO arreglo', () => {
    const tarjetas = [T('a', 'r1', null)]
    expect(separarFueraDelRanking(tarjetas, new Map()).enRanking).toBe(tarjetas)
  })

  it('el WD va al pie con su inscripción; el resto queda en el ranking en orden', () => {
    const { porTarjeta } = estadoFueraPorTarjeta(
      [G('r1', [['p-b', 'b']])], [P('p-b', 'withdrawn', null, 'Lesión')], [T('a', 'r1', null), T('b', 'r1', null), T('c', 'r1', null)],
    )
    const r = separarFueraDelRanking([T('a', 'r1', null), T('b', 'r1', null), T('c', 'r1', null)], porTarjeta)
    expect(r.enRanking.map((t) => t.id)).toEqual(['a', 'c'])
    expect(r.fuera.map((f) => [f.tarjeta.id, f.inscrito.status_reason])).toEqual([['b', 'Lesión']])
  })
})

describe('ordenDelPie', () => {
  it('más hoyos primero; a igualdad WD antes que DQ y luego por nombre', () => {
    const filas = [
      { name: 'Zoe', status: 'withdrawn' as const, hoyos: 5 },
      { name: 'Ana', status: 'disqualified' as const, hoyos: 12 },
      { name: 'Beto', status: 'disqualified' as const, hoyos: 5 },
      { name: 'Ana', status: 'withdrawn' as const, hoyos: 5 },
    ]
    expect(filas.sort(ordenDelPie).map((f) => `${f.name}-${f.status}`)).toEqual([
      'Ana-disqualified', 'Ana-withdrawn', 'Zoe-withdrawn', 'Beto-disqualified',
    ])
  })
})

describe('equipos (decisiones de Juanjo, 17-nov)', () => {
  const { porTarjeta } = estadoFueraPorTarjeta(
    [G('r1', [['p-a', 'j-a'], ['p-b', 'j-b'], ['p-c', 'j-c']])],
    [P('p-a', 'withdrawn'), P('p-b', 'disqualified'), P('p-c', 'approved')],
    [T('j-a', 'r1', null), T('j-b', 'r1', null), T('j-c', 'r1', null)],
  )

  it('foursome: un miembro WD deja al equipo WD; con un DQ, DQ; sin nadie fuera, compite', () => {
    expect(estadoDelEquipoFoursome(['j-a', 'j-c'], porTarjeta)).toBe('withdrawn')
    expect(estadoDelEquipoFoursome(['j-a', 'j-b'], porTarjeta)).toBe('disqualified')
    expect(estadoDelEquipoFoursome(['j-c', 'j-z'], porTarjeta)).toBeNull()
  })

  it('mejor bola: los golpes del DQ no cuentan en NINGÚN hoyo; los del WD (R23.4) y del resto, sí', () => {
    const scores = { '1': 4, '2': 3, '3': 5 }
    expect(scoresQueCuentanEnMejorBola(scores, 'disqualified')).toEqual({})
    expect(scoresQueCuentanEnMejorBola(scores, 'withdrawn')).toBe(scores)
    expect(scoresQueCuentanEnMejorBola(scores, undefined)).toBe(scores)
  })
})
