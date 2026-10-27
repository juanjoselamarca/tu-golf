// El Hero "En vivo" de Mi Golf lee los scores del jugador por `ronda_id`. Antes filtraba por `ronda_libre_id`
// (columna que no existe): PostgREST devolvía error, se descartaba y el Hero decía siempre "Hoyo 1" (18-oct-2026).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { loadActiveRondaScores } from './dashboard'

type Res = { data: unknown; error: unknown }

function supabase(res: Res) {
  const filtros: Array<[string, unknown]> = []
  const b: Record<string, unknown> = {}
  b.select = () => b
  b.eq = (col: string, val: unknown) => { filtros.push([col, val]); return b }
  b.maybeSingle = () => Promise.resolve(res)
  return { client: { from: () => b } as never, filtros }
}

beforeEach(() => captureError.mockClear())

describe('loadActiveRondaScores', () => {
  it('filtra por ronda_id y el usuario, y devuelve sus scores', async () => {
    const s = supabase({ data: { scores: { 1: 4, 2: 5 } }, error: null })
    expect(await loadActiveRondaScores(s.client, 'r1', 'u1')).toEqual({ 1: 4, 2: 5 })
    expect(s.filtros).toEqual([['ronda_id', 'r1'], ['user_id', 'u1']])
  })

  it('está en la ronda pero no anota aún → {} (no "no se sabe")', async () => {
    expect(await loadActiveRondaScores(supabase({ data: { scores: null }, error: null }).client, 'r1', 'u1')).toEqual({})
  })

  it('no es jugador de la ronda (modo admin) → null: el Hero no inventa un hoyo', async () => {
    expect(await loadActiveRondaScores(supabase({ data: null, error: null }).client, 'r1', 'u1')).toBeNull()
  })

  it('si la base responde error, lo reporta en vez de tragárselo', async () => {
    const error = { code: '42703', message: 'column ronda_libre_jugadores.x does not exist' }
    expect(await loadActiveRondaScores(supabase({ data: null, error }).client, 'r1', 'u1')).toBeNull()
    expect(captureError).toHaveBeenCalledWith(error, expect.objectContaining({ context: 'mi-golf.ronda-en-curso' }))
  })
})
