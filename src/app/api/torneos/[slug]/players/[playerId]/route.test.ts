import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()

vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

vi.mock('@/lib/error-tracking', () => ({
  captureError: vi.fn().mockResolvedValue(undefined),
}))

import { PATCH } from './route'

beforeEach(() => { mockFrom.mockReset() })

function makeReq(body: unknown) {
  return new Request('http://test/api/torneos/abc/players/p1', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  })
}

describe('PATCH /api/torneos/[slug]/players/[playerId]', () => {
  it('400 si body no es JSON válido', async () => {
    const req = new Request('http://test/x', {
      method: 'PATCH',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await PATCH(req, { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.error).toBe('invalid_json')
  })

  it('400 si body no tiene tee_id', async () => {
    const res = await PATCH(makeReq({}), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(400)
  })

  it('400 si tee_id no es UUID', async () => {
    const res = await PATCH(makeReq({ tee_id: 'not-a-uuid' }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(400)
  })

  it('200 con tee_id null (limpia asignación, sin lookup de cancha)', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: null })
    const update = vi.fn().mockReturnValue({ eq })
    mockFrom.mockReturnValue({ update })
    const res = await PATCH(makeReq({ tee_id: null }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ tee_id: null })
  })

  it('200 con tee_id válido (mismo course que el torneo)', async () => {
    let call = 0
    mockFrom.mockImplementation(() => {
      call++
      if (call === 1) {
        // tournaments lookup
        const single = vi.fn().mockResolvedValue({ data: { course_id: 'course-abc' }, error: null })
        const eq = vi.fn().mockReturnValue({ single })
        const select = vi.fn().mockReturnValue({ eq })
        return { select }
      }
      if (call === 2) {
        // course_tees lookup
        const single = vi.fn().mockResolvedValue({ data: { course_id: 'course-abc' }, error: null })
        const eq = vi.fn().mockReturnValue({ single })
        const select = vi.fn().mockReturnValue({ eq })
        return { select }
      }
      // players update
      const eq = vi.fn().mockResolvedValue({ data: null, error: null })
      const update = vi.fn().mockReturnValue({ eq })
      return { update }
    })
    const res = await PATCH(
      makeReq({ tee_id: '12345678-1234-4234-9234-123456789abc' }),
      { params: { slug: 'abc', playerId: 'p1' } }
    )
    expect(res.status).toBe(200)
  })

  it('409 si tee_id pertenece a otra cancha', async () => {
    let call = 0
    mockFrom.mockImplementation(() => {
      call++
      if (call === 1) {
        const single = vi.fn().mockResolvedValue({ data: { course_id: 'course-abc' }, error: null })
        const eq = vi.fn().mockReturnValue({ single })
        const select = vi.fn().mockReturnValue({ eq })
        return { select }
      }
      // course_tees lookup → otra cancha
      const single = vi.fn().mockResolvedValue({ data: { course_id: 'course-OTRA' }, error: null })
      const eq = vi.fn().mockReturnValue({ single })
      const select = vi.fn().mockReturnValue({ eq })
      return { select }
    })
    const res = await PATCH(
      makeReq({ tee_id: '12345678-1234-4234-9234-123456789abc' }),
      { params: { slug: 'abc', playerId: 'p1' } }
    )
    expect(res.status).toBe(409)
    const j = await res.json()
    expect(j.error).toBe('tee_belongs_to_other_course')
  })

  it('404 si tournament no existe', async () => {
    mockFrom.mockImplementation(() => {
      const single = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
      const eq = vi.fn().mockReturnValue({ single })
      const select = vi.fn().mockReturnValue({ eq })
      return { select }
    })
    const res = await PATCH(
      makeReq({ tee_id: '12345678-1234-4234-9234-123456789abc' }),
      { params: { slug: 'abc', playerId: 'p1' } }
    )
    expect(res.status).toBe(404)
  })

  it('500 si update falla', async () => {
    const eq = vi.fn().mockResolvedValue({ data: null, error: { message: 'rls denied' } })
    const update = vi.fn().mockReturnValue({ eq })
    mockFrom.mockReturnValue({ update })
    const res = await PATCH(makeReq({ tee_id: null }), { params: { slug: 'abc', playerId: 'p1' } })
    expect(res.status).toBe(500)
  })
})
