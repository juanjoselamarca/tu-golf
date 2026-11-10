/**
 * Bug PR #763: el creador borró la ronda y en el teléfono del jugador "Sincronizando N hoyos…"
 * quedaba para siempre en todas las páginas. El banner concilia con el servidor al montar.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const { respuesta } = vi.hoisted(() => ({ respuesta: { actual: null as { data: unknown; error: unknown } | null } }))
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => respuesta.actual }) }) }),
  }),
}))

import { OfflineBanner } from './OfflineBanner'

const respaldo = (codigo: string) => localStorage.setItem(`golfers_score_${codigo}_p1`,
  JSON.stringify({ scores: { 1: 4, 2: 5 }, timestamp: Date.now(), sincronizado: false, codigoRonda: codigo, jugadorId: 'p1' }))

beforeEach(() => { localStorage.clear(); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true) })
afterEach(() => vi.restoreAllMocks())

describe('OfflineBanner', () => {
  it('ronda borrada por su creador: el aviso de sincronización se va solo', async () => {
    respaldo('ABC123')
    respuesta.actual = { data: null, error: { code: 'PGRST116', message: '0 rows' } }
    render(<OfflineBanner />)
    await waitFor(() => expect(screen.queryByText(/Sincronizando/)).toBeNull())
    expect(localStorage.getItem('golfers_score_ABC123_p1')).toBeNull()
  })

  it('ronda cerrada (se puede reabrir): el aviso se va, pero los golpes quedan en el teléfono', async () => {
    respaldo('ABC123')
    respuesta.actual = { data: { estado: 'finalizada' }, error: null }
    render(<OfflineBanner />)
    await waitFor(() => expect(screen.queryByText(/Sincronizando/)).toBeNull())
    expect(JSON.parse(localStorage.getItem('golfers_score_ABC123_p1')!).scores).toEqual({ 1: 4, 2: 5 })
  })

  it('inverso: ronda en curso, el aviso sigue con sus hoyos pendientes', async () => {
    respaldo('ABC123')
    respuesta.actual = { data: { estado: 'en_curso' }, error: null }
    render(<OfflineBanner />)
    expect(await screen.findByText('Sincronizando 2 hoyos...')).toBeTruthy()
    await new Promise(r => setTimeout(r, 20))
    expect(screen.getByText('Sincronizando 2 hoyos...')).toBeTruthy()
    expect(localStorage.getItem('golfers_score_ABC123_p1')).not.toBeNull()
  })
})
