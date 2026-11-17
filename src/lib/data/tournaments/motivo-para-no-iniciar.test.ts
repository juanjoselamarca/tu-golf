import { describe, it, expect } from 'vitest'
import {
  avisoSinIndice,
  jugadoresSinIndice,
  motivoParaNoIniciar,
  sinIndiceNoVistos,
} from './motivo-para-no-iniciar'

const jugador = (
  id: string,
  handicap_at_registration: number | null,
  profiles: { name: string; indice: number | null } | null,
  player_name: string | null = null,
) => ({ id, handicap_at_registration, profiles, player_name })

describe('jugadoresSinIndice', () => {
  it('lista solo a los que no tienen índice en ninguna parte, con su nombre', () => {
    const aprobados = [
      jugador('p1', 12, { name: 'Ana', indice: 12 }),
      jugador('p2', null, { name: 'Beto', indice: 9.1 }), // perfil: lo completa el inicio
      jugador('p3', 0, null, 'Invitado Scratch'), // 0 tipeado: es un índice
      jugador('p4', null, null, 'Carla'), // invitado sin índice
      jugador('p5', null, { name: 'Diego', indice: null }), // cuenta sin índice
    ]
    expect(jugadoresSinIndice(aprobados, 'whs')).toEqual([
      { id: 'p4', nombre: 'Carla' },
      { id: 'p5', nombre: 'Diego' },
    ])
  })

  it('todos con índice → lista vacía', () => {
    expect(jugadoresSinIndice([jugador('p1', 5, null, 'Ana')], 'whs')).toEqual([])
  })

  it('raw: también avisa al que tiene índice en el perfil pero no hándicap inscrito', () => {
    const aprobados = [jugador('p2', null, { name: 'Beto', indice: 9.1 }), jugador('p3', 0, null, 'Scratch')]
    expect(jugadoresSinIndice(aprobados, 'raw')).toEqual([{ id: 'p2', nombre: 'Beto' }])
  })

  it('no cambia el motivo para no iniciar: sin índice NUNCA bloquea', () => {
    const aprobados = [jugador('p4', null, null, 'Carla')]
    const grupos = [{ name: 'G1', ronda_libre_id: null, players: [{ player_id: 'p4' }] }]
    expect(motivoParaNoIniciar('stroke_play', aprobados, grupos)).toBeNull()
  })
})

describe('avisoSinIndice', () => {
  const sin = [{ id: 'p4', nombre: 'Carla' }, { id: 'p5', nombre: 'Diego' }]

  it('WHS: dice "índice 0" (con índice 0 el hándicap de cancha puede no ser 0)', () => {
    expect(avisoSinIndice(sin, 'whs')).toBe(
      'Sin índice: Carla, Diego. Jugarán con índice 0. Corrígelos en Scoring → Resumen.',
    )
  })

  it('raw: no afirma un número (la tarjeta toma el perfil, el board lo inscrito)', () => {
    // raw: la tarjeta toma el perfil y el board lo inscrito → no se afirma un número.
    expect(avisoSinIndice(sin, 'raw')).toBe(
      'Sin hándicap inscrito: Carla, Diego. Su neto puede salir mal. Corrígelos en Scoring → Resumen.',
    )
  })

  it('uno solo: singular', () => {
    expect(avisoSinIndice([{ id: 'p4', nombre: 'Carla' }], 'whs')).toBe(
      'Sin índice: Carla. Jugará con índice 0. Corrígelo en Scoring → Resumen.',
    )
  })

  it('nadie sin índice → sin aviso', () => {
    expect(avisoSinIndice([], 'whs')).toBeNull()
  })

  it('más de 5: lista corta', () => {
    const muchos = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, nombre: `J${i}` }))
    expect(avisoSinIndice(muchos, 'whs')).toContain('J0, J1, J2, J3, J4 y 2 más.')
  })
})

describe('sinIndiceNoVistos', () => {
  const sin = [{ id: 'p4', nombre: 'Carla' }, { id: 'p5', nombre: 'Diego' }]
  it('devuelve los que faltan en lo visto', () => {
    expect(sinIndiceNoVistos(sin, ['p4'])).toEqual([{ id: 'p5', nombre: 'Diego' }])
  })
  it('todos vistos (o vistos de más) → vacío', () => {
    expect(sinIndiceNoVistos(sin, ['p5', 'p4', 'otro'])).toEqual([])
  })
})
