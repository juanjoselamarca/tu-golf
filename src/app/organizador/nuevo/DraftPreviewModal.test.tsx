// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DraftPreviewModal } from './DraftPreviewModal'

const simulacion = {
  kind: 'individual',
  format: 'stroke_play',
  hole_count: 18,
  players: [{ name: 'Jugador 1', handicap_index: 5, scores: [4, 4, 4] }],
}

function mockPreviewOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ok: true, simulation: simulacion, is_simulation: true }), { status: 200 })),
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('DraftPreviewModal — handicap de juego', () => {
  it('muestra la etiqueta cuando el torneo no juega al 100 %', async () => {
    mockPreviewOk()
    render(<DraftPreviewModal draftId="d1" open onClose={() => {}} etiquetaHcpPct="Handicap al 85 %" />)
    expect(await screen.findByText('Handicap al 85 %')).toBeTruthy()
  })

  it('al 100 % (etiqueta null) no muestra nada extra', async () => {
    mockPreviewOk()
    render(<DraftPreviewModal draftId="d1" open onClose={() => {}} etiquetaHcpPct={null} />)
    await screen.findByText('Jugador 1')
    expect(screen.queryByText(/Handicap al/)).toBeNull()
  })
})
