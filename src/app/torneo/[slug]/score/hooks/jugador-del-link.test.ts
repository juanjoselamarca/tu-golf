import { describe, it, expect, vi } from 'vitest'
import { elegirJugadorInicial, jugadorDelLink, urlSinJugador } from './jugador-del-link'
import { avisoSinAcceso } from './acceso-guardado'

const roster = [{ id: 'p1' }, { id: 'p2' }]

describe('jugadorDelLink', () => {
  it('devuelve el jugador del link si está en el roster', () => {
    expect(jugadorDelLink('?jugador=p2', roster)).toBe('p2')
  })
  it('ignora un id que no está en el roster o un link sin parámetro', () => {
    expect(jugadorDelLink('?jugador=zz', roster)).toBeNull()
    expect(jugadorDelLink('', roster)).toBeNull()
  })
  it('ida y vuelta: el link del aviso de login, una vez de regreso, reabre esa tarjeta', () => {
    const href = avisoSinAcceso({ slug: 'copa', motivo: 'sin_sesion', jugadorId: 'p2' }).href
    const next = new URL(href, 'https://x.cl').searchParams.get('next')!
    expect(jugadorDelLink(new URL(next, 'https://x.cl').search, roster)).toBe('p2')
  })
})

describe('urlSinJugador', () => {
  it('saca sólo ?jugador y conserva lo demás', () => {
    expect(urlSinJugador('https://x.cl/torneo/copa/score?jugador=p1&a=1#h')).toBe('/torneo/copa/score?a=1#h')
    expect(urlSinJugador('https://x.cl/torneo/copa/score?jugador=p1')).toBe('/torneo/copa/score')
  })
})

describe('elegirJugadorInicial', () => {
  it('el ?jugador del link gana sobre la auto-selección del invitado (ni la consulta)', async () => {
    const buscarInvitado = vi.fn(async () => 'p1')
    expect(await elegirJugadorInicial({ search: '?jugador=p2', roster, buscarInvitado })).toEqual({ id: 'p2', desdeLink: true })
    expect(buscarInvitado).not.toHaveBeenCalled()
  })
  it('sin link, abre la tarjeta del invitado si está en el roster', async () => {
    expect(await elegirJugadorInicial({ search: '', roster, buscarInvitado: async () => 'p1' })).toEqual({ id: 'p1', desdeLink: false })
    expect(await elegirJugadorInicial({ search: '', roster, buscarInvitado: async () => 'zz' })).toBeNull()
    expect(await elegirJugadorInicial({ search: '?jugador=zz', roster, buscarInvitado: null })).toBeNull()
  })
})
