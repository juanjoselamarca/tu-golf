/**
 * Board público `/torneo/[slug]` y `/en-vivo`, visor ANÓNIMO: los nombres.
 *
 * La única policy SELECT de `profiles` es `TO authenticated`. Con el cliente del
 * request, un visor sin sesión recibe 0 filas SIN error, el embed `profiles(name)`
 * llega null y `resolveLegacyPlayerName` cae a su último recurso: TODA la tabla
 * queda en "Jugador". Es lo que veía cualquiera que abría el link que comparte el
 * organizador ("Invitar amigos por WhatsApp") sin tener cuenta — leaderboard,
 * lista de inscritos y footer de retirados (Dead-End Hunter, 31-oct-2026).
 *
 * Contrato: con el lector de servicio inyectado (`nombresDePerfil`), el visor
 * anónimo ve los nombres reales; el invitado sin cuenta sigue saliendo por
 * `player_name`; y un jugador sin nombre en ninguna parte sigue cayendo a "Jugador".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Cliente de servicio: el único que ve `profiles`.
const idsPedidos: string[][] = []
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.in = async (_col: string, ids: string[]) => {
        idsPedidos.push(ids)
        return {
          data: t === 'profiles'
            ? [{ id: 'u1', name: 'Juan José Lamarca' }, { id: 'u2', name: 'Andrés Torres' }]
            : [],
          error: null,
        }
      }
      return q
    },
  }),
}))

import { fetchEnrolledPlayerNames, fetchLegacyPlayers, fetchWithdrawnPlayers, type Client } from './leaderboard'
import { nombresDePerfil } from '@/lib/data/nombres-de-perfil'
import { resolveLegacyPlayerName } from '@/golf/leaderboard/board-rules'

/** Cliente ANÓNIMO del request: el embed `profiles(name)` llega null, sin error. */
function anon(filas: Array<Record<string, unknown>>): Client {
  const q: Record<string, unknown> = {}
  const res = { data: filas, error: null }
  for (const m of ['select', 'eq', 'not', 'limit', 'in', 'order']) {
    q[m] = () => q
  }
  q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(res).then(resolve)
  return { from: () => q } as unknown as Client
}

const inscritos = [
  { id: 'p1', user_id: 'u1', player_name: null, profiles: null, handicap_at_registration: 10, categories: null, rounds: [] },
  { id: 'p2', user_id: 'u2', player_name: null, profiles: null, handicap_at_registration: 1, categories: null, rounds: [] },
  // Invitado sin cuenta: su nombre vive en `players.player_name`.
  { id: 'p3', user_id: null, player_name: 'Invitado Pedro', profiles: null, handicap_at_registration: 20, categories: null, rounds: [] },
  // Con cuenta pero sin nombre de perfil: no hay nada honesto que mostrar.
  { id: 'p4', user_id: 'u9', player_name: null, profiles: null, handicap_at_registration: 15, categories: null, rounds: [] },
]

beforeEach(() => { idsPedidos.length = 0 })

describe('board público con visor anónimo — nombres', () => {
  it('fetchLegacyPlayers rellena profiles.name con el lector de servicio', async () => {
    const players = await fetchLegacyPlayers(anon(inscritos), 't1', nombresDePerfil)
    expect(players.map((p) => resolveLegacyPlayerName(p))).toEqual([
      'Juan José Lamarca',
      'Andrés Torres',
      'Invitado Pedro',
      'Jugador',
    ])
    // Sólo pide los user_id que faltaban: el invitado no tiene perfil que leer.
    expect(idsPedidos).toEqual([['u1', 'u2', 'u9']])
  })

  it('no consulta perfiles cuando el embed ya trajo los nombres (visor con sesión)', async () => {
    const conSesion = inscritos.map((p) => ({ ...p, profiles: { name: 'Nombre del embed', indice: null } }))
    const players = await fetchLegacyPlayers(anon(conSesion), 't1', nombresDePerfil)
    expect(players.every((p) => p.profiles?.name === 'Nombre del embed')).toBe(true)
    expect(idsPedidos).toEqual([])
  })

  it('la lista de inscritos de la ficha pública sale con nombres, no con "Jugador"', async () => {
    const nombres = await fetchEnrolledPlayerNames(anon(inscritos), 't1', nombresDePerfil)
    expect(nombres).toEqual(['Juan José Lamarca', 'Andrés Torres', 'Invitado Pedro', 'Jugador'])
  })

  it('el footer de retirados no pierde al WD con cuenta', async () => {
    const wd = [
      { user_id: 'u1', status: 'withdrawn', status_reason: 'Lesión', player_name: null, profiles: null },
      { user_id: null, status: 'disqualified', status_reason: null, player_name: 'Invitado Pedro', profiles: null },
    ]
    const out = await fetchWithdrawnPlayers(anon(wd), 't1', nombresDePerfil)
    // Sin el relleno, la primera fila se filtraba en silencio (name null) y el
    // retirado desaparecía del board para quien lo mira sin cuenta.
    expect(out.map((e) => e.name)).toEqual(['Juan José Lamarca', 'Invitado Pedro'])
  })
})
