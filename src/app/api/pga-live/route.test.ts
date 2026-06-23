/**
 * Ruta /api/pga-live: handler DELGADO. Solo testeamos su responsabilidad propia —
 * la orquestación de I/O: delega el mapeo a parseScoreboard, pide el corte
 * proyectado SOLO en vivo, y degrada a active:false si el fetch falla.
 * El mapeo ESPN→DTO se testea en src/lib/pga/scoreboard.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { getProjectedCut } = vi.hoisted(() => ({
  getProjectedCut: vi.fn(async (_name?: string, _year?: string) => '+1'),
}))
vi.mock('@/lib/pga/projectedCut', () => ({ getProjectedCut }))

function comp(name: string, score: string) {
  return { score, athlete: { displayName: name, flag: { alt: 'United States' } }, linescores: [], status: {} }
}
function stubEspn(state: string, shortDetail: string, name = 'Some Open') {
  const payload = {
    events: [{
      name, shortName: name,
      competitions: [{ competitors: [comp('A', '-5')], status: { type: { state, shortDetail, detail: shortDetail } }, venue: { fullName: 'GC' } }],
    }],
  }
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(payload) } as Response)))
}

describe('/api/pga-live — orquestación del handler', () => {
  beforeEach(() => { vi.resetModules(); getProjectedCut.mockClear() })
  afterEach(() => vi.restoreAllMocks())

  it('en vivo → pide corte proyectado y lo incluye en la respuesta', async () => {
    stubEspn('in', 'Round 2 - In Progress')
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(getProjectedCut).toHaveBeenCalledTimes(1)
    expect(json.projectedCut).toBe('+1')
    expect(json.live).toBe(true)
  })

  it('finalizado → NO pide corte proyectado (projectedCut null)', async () => {
    stubEspn('post', 'Final')
    const { GET } = await import('./route')
    const json = await (await GET()).json()
    expect(getProjectedCut).not.toHaveBeenCalled()
    expect(json.projectedCut).toBeNull()
    expect(json.complete).toBe(true)
  })

  it('si el fetch a ESPN falla → degrada a active:false (CERO FALLOS, no 500)', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))))
    const { GET } = await import('./route')
    const res = await GET()
    const json = await res.json()
    expect(json.active).toBe(false)
    expect(json.players).toEqual([])
  })
})
