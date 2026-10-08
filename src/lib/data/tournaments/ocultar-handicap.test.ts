import { describe, it, expect } from 'vitest'
import { idsConHandicapOculto, ocultarHandicaps } from './ocultar-handicap'
import type { Player } from '@/lib/golf-data'

const jugadores = [
  { id: 'cuenta', handicap_de_perfil: true },
  { id: 'invitado', handicap_de_perfil: false },
  { id: 'plano' },
]
const p = (id: string): Player => ({
  pos: 1, id, name: id, country: 'CL', cat: 'General', hcp: 18, hcpDisplay: 20,
  today: 0, total: 0, holes: 18, status: 'F', scores: [],
})

describe('ocultar handicap en el board público', () => {
  it('sin sesión se ocultan sólo los jugadores con el índice del perfil', () => {
    expect([...idsConHandicapOculto(jugadores, false)]).toEqual(['cuenta'])
  })
  it('con sesión no se oculta nada', () => {
    expect(idsConHandicapOculto(jugadores, true).size).toBe(0)
  })
  it('anula hcp y hcpDisplay sólo de los ocultos y no muta la entrada', () => {
    const entrada = [p('cuenta'), p('invitado')]
    const out = ocultarHandicaps(entrada, new Set(['cuenta']))
    expect(out[0]).toMatchObject({ hcp: null, hcpDisplay: null })
    expect(out[1]).toMatchObject({ hcp: 18, hcpDisplay: 20 })
    expect(entrada[0].hcp).toBe(18)
  })
})
