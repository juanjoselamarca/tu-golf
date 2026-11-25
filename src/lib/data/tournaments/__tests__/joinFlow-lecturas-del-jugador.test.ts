// Inscripción con cuenta: si falla la lectura del perfil o de la inscripción, fetchJoinInfo no puede responder
// como si el jugador no tuviera perfil o no estuviera inscrito. Antes (25-nov-2026) un error de la base dejaba
// `profile: null` → «Inscribirme» deshabilitado sin explicación en la pantalla, y el POST respondía
// «Necesitas tu índice de handicap» a quien sí lo tiene. Ahora el error sube (500) y la pantalla ofrece reintentar.
import { describe, it, expect } from 'vitest'
import { fetchJoinInfo } from '../joinFlow'

type Resp = { data: unknown; error: unknown }
const torneo = { id: 't1', status: 'open', organizer_id: 'o', format: 'stroke_play' }
const ok = (data: unknown): Resp => ({ data, error: null })

function admin(porTabla: { profiles: Resp; players: Resp }) {
  return {
    from(tabla: string) {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.single = () => Promise.resolve(ok({ max_players: null }))
      b.maybeSingle = () => Promise.resolve(
        tabla === 'tournaments' ? ok(torneo) : tabla === 'profiles' ? porTabla.profiles : porTabla.players,
      )
      // count del cupo (`await` directo sobre el builder)
      b.then = (res: (v: unknown) => unknown) => Promise.resolve({ count: 0, error: null }).then(res)
      return b
    },
  } as never
}

const caida = { code: '57014', message: 'canceling statement due to statement timeout' }

describe('fetchJoinInfo · lecturas del jugador', () => {
  it('con todo bien trae perfil e inscripción', async () => {
    const r = await fetchJoinInfo(admin({ profiles: ok({ name: 'A', indice: 12.3, genero: 'M' }), players: ok({ id: 'p1' }) }), 's', 'u1')
    expect(r?.profile?.indice).toBe(12.3)
    expect(r?.alreadyRegistered).toBe(true)
  })

  it('un error al leer el perfil no se disfraza de "sin perfil" (ni de "sin índice")', async () => {
    await expect(
      fetchJoinInfo(admin({ profiles: { data: null, error: caida }, players: ok(null) }), 's', 'u1'),
    ).rejects.toBe(caida)
  })

  it('un error al leer la inscripción no se disfraza de "no inscrito"', async () => {
    await expect(
      fetchJoinInfo(admin({ profiles: ok({ name: 'A', indice: 12.3, genero: 'M' }), players: { data: null, error: caida } }), 's', 'u1'),
    ).rejects.toBe(caida)
  })
})
