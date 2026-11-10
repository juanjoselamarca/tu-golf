import { describe, it, expect } from 'vitest'
import { applyFilters, posicionesDeLaCompetencia, posicionesDeEquiposEnLaCompetencia, type ExtendedPlayer, type ExtendedTeam } from './filtros-en-vivo'

const jugador = (id: string, vs_par: number, clave: string | null, group_id: string, category_id = 'cat-a'): ExtendedPlayer => ({
  id, name: id, scores_per_hole: [], gross_total: 0, vs_par, thru: clave ? 18 : 0, clave_empate: clave, group_id, category_id,
})

// Orden del motor: Ana 1, Beto y Cata T2, Dani 4 (categoría B: Eli).
const field = [
  jugador('ana', -3, '0#0', 'g1'),
  jugador('beto', 0, '1#0', 'g2'),
  jugador('cata', 0, '1#0', 'g1'),
  jugador('dani', 2, '2#0', 'g2'),
  jugador('eli', 5, '3#0', 'g1', 'cat-b'),
]

describe('posiciones del torneo en vivo con filtros', () => {
  it('"Solo mi grupo" / grupo de salida no cambia la posición: Cata sigue T2, no 2', () => {
    const vista = applyFilters(field, { categoryFilter: null, groupFilter: 'g1', myViewEnabled: false })
    const pos = posicionesDeLaCompetencia(field, null, false)
    expect(vista.map((p) => `${pos.get(p.id)} ${p.id}`)).toEqual(['1 ana', 'T2 cata', '5 eli'])
  })

  it('la categoría sí es otra competencia: Eli es 1 en la B', () => {
    expect(posicionesDeLaCompetencia(field, 'cat-b', false).get('eli')).toBe('1')
  })

  it('respuesta cacheada sin clave_empate: cae al vs par, no "—" para todos', () => {
    const viejos = field.map(({ clave_empate: _c, ...p }) => ({ ...p, thru: 18 }))
    const pos = posicionesDeLaCompetencia(viejos, 'cat-a', false)
    expect(['ana', 'beto', 'cata', 'dani'].map((id) => pos.get(id))).toEqual(['1', 'T2', 'T2', '4'])
  })

  it('equipos: el filtro de grupo tampoco cambia la posición', () => {
    const team = (id: string, vs_par: number, clave: string, group_id: string): ExtendedTeam => ({
      id, name: id, players: [], team_scores_per_hole: [], team_total: 0, vs_par, thru: 9, clave_empate: clave, group_id,
    })
    const pos = posicionesDeEquiposEnLaCompetencia([team('A', -3, '0#0', 'g1'), team('B', -3, '0#1', 'g2'), team('C', 1, '1#0', 'g2')], null)
    expect([pos.get('A'), pos.get('B'), pos.get('C')]).toEqual(['1', '2', '3'])
  })
})
