// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock del admin client: capturamos lo que se insertaría en error_logs.
const insertMock = vi.fn().mockResolvedValue({ error: null })
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: insertMock }) }),
}))

import { captureError } from './error-tracking'

describe('captureError — server-side (sin window)', () => {
  beforeEach(() => {
    insertMock.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('persiste el error en error_logs vía service role cuando corre en server', async () => {
    await captureError(new Error('boom'), {
      context: 'test.server',
      userId: 'u1',
      meta: { rondaId: 'r9' },
    })

    expect(insertMock).toHaveBeenCalledOnce()
    const row = insertMock.mock.calls[0][0]
    expect(row.message).toBe('boom')
    expect(row.source).toBe('test.server')
    expect(row.user_id).toBe('u1')
    expect(row.level).toBe('error')
    expect(row.metadata).toMatchObject({ rondaId: 'r9' })
    expect(row.metadata.stack).toBeTruthy()
  })

  it('un warning se persiste con level "warn"', async () => {
    await captureError('cuidado', { context: 'test.warn', level: 'warning' })
    expect(insertMock).toHaveBeenCalledOnce()
    expect(insertMock.mock.calls[0][0].level).toBe('warn')
  })

  it('nunca propaga si el insert falla', async () => {
    insertMock.mockRejectedValueOnce(new Error('db down'))
    await expect(
      captureError(new Error('x'), { context: 'test.resiliente' })
    ).resolves.toBeUndefined()
  })
})
