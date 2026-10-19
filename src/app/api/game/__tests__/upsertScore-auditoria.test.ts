// La auditoría de scores apunta a la fila real de hole_scores (uuid). Antes armaba `round_id_hoyo`, que no es
// uuid: el insert fallaba siempre en silencio y score_audit_log quedó con 0 filas en prod (19-oct-2026).
import { describe, it, expect, vi, beforeEach } from 'vitest'

const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { upsertScore } from '../actions'

const ROUND = '6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b'
const HOLE_SCORE = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d'
const USER = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'

type Res = { data: unknown; error: unknown }
let auditInsert: ReturnType<typeof vi.fn<(row: unknown) => void>>
let auditResult: Res | Error

function builder(result: Res, lista: Res = result) {
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'update', 'upsert']) b[m] = () => b
  b.single = () => Promise.resolve(result)
  b.then = (ok: (r: Res) => unknown) => Promise.resolve(lista).then(ok)
  return b
}

function svc() {
  return {
    from: (table: string) => {
      if (table === 'rounds') return builder({ data: { status: 'in_progress' }, error: null })
      if (table === 'hole_scores') return builder({ data: { id: HOLE_SCORE }, error: null }, { data: [{ gross_score: 5, net_score: 4, points: 3 }], error: null })
      if (table === 'score_audit_log') {
        return {
          insert: (row: unknown) => {
            auditInsert(row)
            return auditResult instanceof Error ? Promise.reject(auditResult) : Promise.resolve(auditResult)
          },
        }
      }
      throw new Error(`tabla inesperada: ${table}`)
    },
  }
}

const body = { round_id: ROUND, hole_number: 7, par: 4, gross_score: 5, net_score: 4, points: 3 }

beforeEach(() => {
  vi.clearAllMocks()
  auditInsert = vi.fn<(row: unknown) => void>()
  auditResult = { data: null, error: null }
})

describe('upsertScore · auditoría', () => {
  it('registra el golpe contra el uuid de la fila de hole_scores, no contra un texto armado', async () => {
    const res = await upsertScore(svc() as never, USER, body)
    expect(res.status).toBe(200)
    expect(auditInsert).toHaveBeenCalledWith({
      hole_score_id: HOLE_SCORE, changed_by: USER, new_value: 5, reason: 'manual_organizer',
    })
    expect(captureError).not.toHaveBeenCalled()
  })

  it('si la base rechaza la auditoría, el score igual queda guardado y el error se reporta', async () => {
    auditResult = { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } }
    const res = await upsertScore(svc() as never, USER, body)
    expect(res.status).toBe(200)
    expect(captureError).toHaveBeenCalledWith(
      auditResult.error,
      expect.objectContaining({ context: 'game-engine.upsert_score.auditoria' }),
    )
  })

  it('si la llamada revienta, también se reporta sin bloquear el guardado', async () => {
    auditResult = new TypeError('fetch failed')
    expect((await upsertScore(svc() as never, USER, body)).status).toBe(200)
    expect(captureError).toHaveBeenCalledWith(auditResult, expect.objectContaining({ context: 'game-engine.upsert_score.auditoria' }))
  })

  it('borrar el golpe (gross null) no deja entrada de auditoría', async () => {
    await upsertScore(svc() as never, USER, { ...body, gross_score: null })
    expect(auditInsert).not.toHaveBeenCalled()
  })
})
