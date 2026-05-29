import { describe, it, expect, vi, beforeEach } from 'vitest'

const isCerebroAdmin = vi.fn()
const listKnowledgeSources = vi.fn()
const addKnowledgeSource = vi.fn()

vi.mock('@/lib/cerebro/admin-auth', () => ({
  isCerebroAdmin: () => isCerebroAdmin(),
}))
vi.mock('@/lib/cerebro/knowledge-sources', () => ({
  listKnowledgeSources: () => listKnowledgeSources(),
  addKnowledgeSource: (input: unknown) => addKnowledgeSource(input),
}))

import { GET, POST } from '../route'

function jsonReq(body: unknown): import('next/server').NextRequest {
  return new Request('http://x/api/admin/cerebro/sources', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest
}

describe('GET /api/admin/cerebro/sources', () => {
  beforeEach(() => {
    isCerebroAdmin.mockReset()
    listKnowledgeSources.mockReset()
  })

  it('403 sin auth admin', async () => {
    isCerebroAdmin.mockResolvedValue(false)
    const res = await GET(new Request('http://x') as never)
    expect(res.status).toBe(403)
    expect(listKnowledgeSources).not.toHaveBeenCalled()
  })

  it('200 + lista con auth válido', async () => {
    isCerebroAdmin.mockResolvedValue(true)
    listKnowledgeSources.mockResolvedValue([{ slug: 'usga-rules-2023', status: 'ready' }])
    const res = await GET(new Request('http://x') as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.sources).toHaveLength(1)
    expect(body.sources[0].slug).toBe('usga-rules-2023')
  })
})

describe('POST /api/admin/cerebro/sources', () => {
  beforeEach(() => {
    isCerebroAdmin.mockReset()
    addKnowledgeSource.mockReset()
  })

  it('403 sin auth admin', async () => {
    isCerebroAdmin.mockResolvedValue(false)
    const res = await POST(jsonReq({ slug: 'x' }))
    expect(res.status).toBe(403)
  })

  it('400 si el body es inválido', async () => {
    isCerebroAdmin.mockResolvedValue(true)
    const res = await POST(jsonReq({ slug: 'x' })) // faltan campos required
    expect(res.status).toBe(400)
    expect(addKnowledgeSource).not.toHaveBeenCalled()
  })

  it('201 + source con body válido', async () => {
    isCerebroAdmin.mockResolvedValue(true)
    addKnowledgeSource.mockResolvedValue({ id: 'src1', slug: 'nueva', status: 'pending' })
    const res = await POST(
      jsonReq({
        slug: 'nueva',
        title: 'Fuente nueva',
        url_source: 'https://example.com/doc.pdf',
        block_key: 'rules',
        jurisdiction: 'usga',
      }),
    )
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.source.slug).toBe('nueva')
    expect(addKnowledgeSource).toHaveBeenCalledOnce()
  })
})
