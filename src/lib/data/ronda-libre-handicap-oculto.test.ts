/**
 * `courseHandicapsDeRonda` separa FUENTE (de dónde sale el índice) de PRIVACIDAD (qué
 * viaja a una respuesta pública, `leerIndices === null`). Plan 2026-11-16, pieza B.
 */
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { courseHandicapsDeRonda } from './ronda-libre'

// Sin cancha vinculada: no se consulta nada (course handicap = índice redondeado).
const sb = {} as SupabaseClient
const ronda = (jugadores: Array<{ id: string; user_id: string | null; handicap: number | null; handicap_de_inscripcion: boolean | null }>) => ({
  course_id: null, tees: 'azul', holes: 18, recorridos: null, hcp_pct: 100,
  ronda_libre_jugadores: jugadores,
})

const jugadores = [
  { id: 'creador', user_id: 'u1', handicap: 8.4, handicap_de_inscripcion: false }, // ronda libre: tipeó su índice
  { id: 'perfil', user_id: 'u2', handicap: null, handicap_de_inscripcion: false }, // torneo raw individual: perfil
  { id: 'inscrito', user_id: 'u3', handicap: 14.2, handicap_de_inscripcion: true }, // torneo WHS con cuenta
  { id: 'sinIndice', user_id: 'u4', handicap: null, handicap_de_inscripcion: true }, // torneo WHS sin índice
  { id: 'invitado', user_id: null, handicap: 20, handicap_de_inscripcion: true }, // invitado de torneo
]

describe('courseHandicapsDeRonda — respuesta pública (leerIndices = null)', () => {
  it('el inscrito con cuenta queda en sinIndice con 0 (su CH no viaja); el creador y el invitado se ven, como hoy', async () => {
    const r = await courseHandicapsDeRonda(sb, ronda(jugadores), 72, null)
    expect([...r.sinIndice].sort()).toEqual(['inscrito', 'perfil', 'sinIndice'])
    expect(r.indexByJugador).toMatchObject({ creador: 8.4, perfil: 0, inscrito: 0, sinIndice: 0, invitado: 20 })
    expect(JSON.stringify(r.courseHcpMap)).not.toMatch(/:14\b/)
  })
})

describe('courseHandicapsDeRonda — con lector de índices (con sesión o servicio)', () => {
  it('la tarjeta manda; sólo el de FUENTE perfil lee el perfil; el WHS sin índice no cae al perfil', async () => {
    const leer = vi.fn(async (ids: readonly string[]) => new Map(ids.map((id) => [id, 11] as [string, number])))
    const r = await courseHandicapsDeRonda(sb, ronda(jugadores), 72, leer)
    expect(leer).toHaveBeenCalledWith(['u2'])
    expect(r.indexByJugador).toMatchObject({ creador: 8.4, perfil: 11, inscrito: 14.2, sinIndice: 0, invitado: 20 })
    expect([...r.sinIndice]).toEqual(['sinIndice'])
  })
})
