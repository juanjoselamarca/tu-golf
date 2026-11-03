import { describe, it, expect, vi, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { avisarAlCoachRondaNueva } from '@/lib/data/ronda-libre-finalizar'

// /api/coach/post-round-trigger insertaba `event_type` en coach_events (la columna es
// `type`) con el cliente de sesión, que no tiene policy de INSERT: fallaba siempre y
// respondía ok. 0 eventos en prod y nadie los leía. Se eliminó; al finalizar una ronda
// el coach se entera solo por plan-outcome.

afterEach(() => vi.unstubAllGlobals())

describe('avisarAlCoachRondaNueva', () => {
  it('avisa solo a plan-outcome con el id de la ronda del historial', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)

    avisarAlCoachRondaNueva('h-1')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/coach/plan-outcome')
    expect(JSON.parse(init.body as string)).toEqual({ historical_round_id: 'h-1' })
  })

  it('la ruta muerta post-round-trigger no existe', () => {
    expect(existsSync(path.resolve(process.cwd(), 'src/app/api/coach/post-round-trigger'))).toBe(false)
  })
})
