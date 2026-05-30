import { describe, it, expect, vi, beforeEach } from 'vitest'

const isCerebroAdmin = vi.fn()
const updateKnowledgeSource = vi.fn()
const markSourceForReindex = vi.fn()
const getSourceChunksPreview = vi.fn()

vi.mock('@/lib/cerebro/admin-auth', () => ({
  isCerebroAdmin: () => isCerebroAdmin(),
}))
vi.mock('@/lib/cerebro/knowledge-sources', () => ({
  updateKnowledgeSource: (slug: string, patch: unknown) => updateKnowledgeSource(slug, patch),
  markSourceForReindex: (slug: string) => markSourceForReindex(slug),
  getSourceChunksPreview: (slug: string) => getSourceChunksPreview(slug),
}))

import { PATCH } from '../route'
import { POST as REINDEX } from '../reindex/route'
import { GET as CHUNKS } from '../chunks/route'

const params = (slug: string) => ({ params: Promise.resolve({ slug }) })
function patchReq(body: unknown) {
  return new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }) as never
}

beforeEach(() => {
  isCerebroAdmin.mockReset()
  updateKnowledgeSource.mockReset()
  markSourceForReindex.mockReset()
  getSourceChunksPreview.mockReset()
})

describe('PATCH [slug]', () => {
  it('403 sin auth', async () => {
    isCerebroAdmin.mockResolvedValue(false)
    const res = await PATCH(patchReq({ priority_rank: 200 }), params('x'))
    expect(res.status).toBe(403)
  })

  it('400 si no hay campos válidos', async () => {
    isCerebroAdmin.mockResolvedValue(true)
    const res = await PATCH(patchReq({}), params('x'))
    expect(res.status).toBe(400)
    expect(updateKnowledgeSource).not.toHaveBeenCalled()
  })

  it('200 + source con patch válido', async () => {
    isCerebroAdmin.mockResolvedValue(true)
    updateKnowledgeSource.mockResolvedValue({ slug: 'x', priority_rank: 200 })
    const res = await PATCH(patchReq({ priority_rank: 200 }), params('x'))
    expect(res.status).toBe(200)
    expect(updateKnowledgeSource).toHaveBeenCalledWith('x', { priority_rank: 200 })
  })
})

describe('POST [slug]/reindex', () => {
  it('403 sin auth', async () => {
    isCerebroAdmin.mockResolvedValue(false)
    const res = await REINDEX(new Request('http://x') as never, params('x'))
    expect(res.status).toBe(403)
  })

  it('404 si el slug no existe', async () => {
    isCerebroAdmin.mockResolvedValue(true)
    markSourceForReindex.mockResolvedValue(false)
    const res = await REINDEX(new Request('http://x') as never, params('nope'))
    expect(res.status).toBe(404)
  })

  it('200 enqueued con slug existente', async () => {
    isCerebroAdmin.mockResolvedValue(true)
    markSourceForReindex.mockResolvedValue(true)
    const res = await REINDEX(new Request('http://x') as never, params('usga'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.enqueued).toBe(true)
    expect(body.slug).toBe('usga')
  })
})

describe('GET [slug]/chunks', () => {
  it('403 sin auth', async () => {
    isCerebroAdmin.mockResolvedValue(false)
    const res = await CHUNKS(new Request('http://x') as never, params('x'))
    expect(res.status).toBe(403)
  })

  it('404 si el slug no existe', async () => {
    isCerebroAdmin.mockResolvedValue(true)
    getSourceChunksPreview.mockResolvedValue(null)
    const res = await CHUNKS(new Request('http://x') as never, params('nope'))
    expect(res.status).toBe(404)
  })

  it('200 + chunks con slug existente', async () => {
    isCerebroAdmin.mockResolvedValue(true)
    getSourceChunksPreview.mockResolvedValue([{ id: 'c1', breadcrumb: 'R 1.1', content: 'x' }])
    const res = await CHUNKS(new Request('http://x') as never, params('usga'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.chunks).toHaveLength(1)
  })
})
