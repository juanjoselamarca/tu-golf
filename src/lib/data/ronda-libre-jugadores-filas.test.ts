import { describe, expect, it, vi } from 'vitest'

const perfilesQueExisten = vi.fn(async (ids: readonly string[]) => new Set(ids.filter(id => id !== FANTASMA)))
vi.mock('./perfiles-existentes', () => ({ perfilesQueExisten: (ids: readonly string[]) => perfilesQueExisten(ids) }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { filasDeJugadores, perfilSugerido, verificarPerfilesSugeridos, type JugadorDeRonda } from './ronda-libre-jugadores-filas'

const CREADOR = '11111111-1111-4111-8111-111111111111'
const PERFIL = '22222222-2222-4222-8222-222222222222'
const FANTASMA = '33333333-3333-4333-8333-333333333333'
const OTRO = '44444444-4444-4444-8444-444444444444'

const creador: JugadorDeRonda = { nombre: ' Juanjo ', user_id: OTRO, perfil_sugerido_id: PERFIL, handicap: 12.4, tees: 'Azul' }
const rival: JugadorDeRonda = { nombre: 'Cristián', user_id: OTRO, perfil_sugerido_id: PERFIL, handicap: 8, tees: null }
const invitado: JugadorDeRonda = {
  nombre: 'Pedro', user_id: null, perfil_sugerido_id: PERFIL, handicap: null, tees: 'Rojo',
  is_guest: true, telefono_invitado: '+56911112222', nombre_invitado: 'Pedro P',
}

describe('filasDeJugadores', () => {
  it('creador con su sesión, rival con su cuenta sugerida, invitado sin cuenta; con jugadorIds', () => {
    const filas = filasDeJugadores({
      jugadores: [creador, rival, invitado], rondaId: 'R', creadorId: CREADOR,
      jugadorIds: ['a', 'b', 'c'], perfilesValidos: new Set([PERFIL]), teesDeLaRonda: 'Blanco',
    })
    expect(filas).toEqual([
      { id: 'a', ronda_id: 'R', nombre: 'Juanjo', user_id: CREADOR, scores: {}, handicap: 12.4, tees: 'Azul', is_guest: false, telefono_invitado: null, nombre_invitado: null },
      { id: 'b', ronda_id: 'R', nombre: 'Cristián', user_id: null, perfil_sugerido_id: PERFIL, scores: {}, handicap: 8, tees: 'Blanco', is_guest: false, telefono_invitado: null, nombre_invitado: null },
      { id: 'c', ronda_id: 'R', nombre: 'Pedro', user_id: null, scores: {}, handicap: null, tees: 'Rojo', is_guest: true, telefono_invitado: '+56911112222', nombre_invitado: 'Pedro P' },
    ])
  })

  it('sin jugadorIds no manda id; sin perfiles verificados no manda la sugerencia', () => {
    const filas = filasDeJugadores({
      jugadores: [creador, rival], rondaId: 'R', creadorId: CREADOR, perfilesValidos: null, teesDeLaRonda: 'Blanco',
    })
    expect(filas.every(f => !('id' in f))).toBe(true)
    expect(filas.every(f => !('perfil_sugerido_id' in f))).toBe(true)
  })
})

describe('perfilSugerido', () => {
  it('nunca para el creador ni para un invitado', () => {
    expect(perfilSugerido(creador, 0)).toBeNull()
    expect(perfilSugerido(rival, 1)).toBe(PERFIL)
    expect(perfilSugerido({ ...rival, telefono_invitado: '+569' }, 1)).toBeNull()
  })
})

describe('verificarPerfilesSugeridos', () => {
  it('una cuenta que no existe es un 400 con el nombre', async () => {
    const r = await verificarPerfilesSugeridos([creador, { ...rival, perfil_sugerido_id: FANTASMA }], { userId: CREADOR, context: 'x' })
    expect(r).toEqual({ ok: false, error: 'No encontramos la cuenta de Cristián. Vuelve a buscar su cuenta o elige «Invitado».' })
  })

  it('si la base no contesta, sigue sin la sugerencia y lo reporta', async () => {
    perfilesQueExisten.mockRejectedValueOnce(new Error('caída'))
    const r = await verificarPerfilesSugeridos([creador, rival], { userId: CREADOR, context: 'x' })
    expect(r).toEqual({ ok: true, validos: null })
    expect(captureError).toHaveBeenCalled()
  })

  it('sin rivales con cuenta no consulta la base', async () => {
    perfilesQueExisten.mockClear()
    const r = await verificarPerfilesSugeridos([creador], { userId: CREADOR, context: 'x' })
    expect(r.ok).toBe(true)
    expect(perfilesQueExisten).not.toHaveBeenCalled()
  })
})
