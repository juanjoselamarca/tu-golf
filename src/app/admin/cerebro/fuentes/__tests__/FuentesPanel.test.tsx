import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { FuentesPanel } from '../FuentesPanel'
import type { KnowledgeSourceRow } from '@/lib/cerebro/knowledge-sources'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

function row(overrides: Partial<KnowledgeSourceRow> = {}): KnowledgeSourceRow {
  return {
    id: 'src1',
    slug: 'usga-rules-2023',
    title: 'Rules of Golf 2023',
    authors: [],
    url_source: 'https://x/doc.pdf',
    url_local_pdf: null,
    block_key: 'rules',
    jurisdiction: 'usga',
    priority_rank: 100,
    is_authoritative_for: [],
    legal_basis: 'official',
    source_hash: null,
    ingested_at: null,
    chunk_count: 1842,
    ingest_cost_usd: 0.18,
    status: 'ready',
    error_message: null,
    created_at: '2026-05-29T00:00:00Z',
    updated_at: '2026-05-29T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  refresh.mockReset()
  vi.restoreAllMocks()
})

describe('FuentesPanel', () => {
  it('muestra mensaje vacío sin fuentes', () => {
    render(<FuentesPanel initialSources={[]} />)
    expect(screen.getByText(/No hay fuentes registradas/)).toBeTruthy()
  })

  it('renderiza una fila por fuente con título y chunks', () => {
    render(<FuentesPanel initialSources={[row()]} />)
    expect(screen.getByText('Rules of Golf 2023')).toBeTruthy()
    expect(screen.getByText('1842')).toBeTruthy()
    expect(screen.getByText('$0.1800')).toBeTruthy()
    expect(screen.getByText('ready')).toBeTruthy()
  })

  it('re-indexar llama al endpoint y refresca al éxito', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ enqueued: true }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<FuentesPanel initialSources={[row()]} />)
    fireEvent.click(screen.getByRole('button', { name: /Re-indexar/ }))
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/cerebro/sources/usga-rules-2023/reindex',
      { method: 'POST' },
    )
  })

  it('muestra error si el reindex falla', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({ error: 'source_not_found' }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<FuentesPanel initialSources={[row()]} />)
    fireEvent.click(screen.getByRole('button', { name: /Re-indexar/ }))
    await waitFor(() => expect(screen.getByText('source_not_found')).toBeTruthy())
    expect(refresh).not.toHaveBeenCalled()
  })
})
