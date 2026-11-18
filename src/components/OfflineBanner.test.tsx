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
import { AvisoSesionCerradaBanner } from '@/app/ronda-libre/[codigo]/score/components/AvisoSesionCerradaBanner'
import { ConexionScorerBanner } from '@/app/ronda-libre/[codigo]/score-grupo/components/ConexionScorerBanner'
import { AvisoSinAccesoBanner } from '@/app/torneo/[slug]/score/components/AvisoSinAccesoBanner'
import { avisoSesionCerrada } from '@/lib/auth/aviso-sesion-cerrada'
import { avisoSinAcceso } from '@/app/torneo/[slug]/score/hooks/acceso-guardado'
import type { ReactElement } from 'react'

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

// Con la sesión perdida, "Sincronizando N hoyos…" (fijo arriba, z-index 9999) tapaba el encabezado del scorer y
// contradecía su aviso: esos golpes no se suben solos hasta que vuelva a iniciar sesión. Los tres scorers.
describe('OfflineBanner — con el aviso de sesión de un scorer a la vista', () => {
  const casos: Array<[string, (visible: boolean) => ReactElement]> = [
    ['torneo', v => <AvisoSinAccesoBanner aviso={v ? avisoSinAcceso({ slug: 'copa', motivo: 'sin_sesion' }) : null} />],
    ['ronda libre', v => <AvisoSesionCerradaBanner aviso={v ? avisoSesionCerrada('/ronda-libre/ABC123/score', { habiaSesion: true }) : null} />],
    ['score-grupo', v => <ConexionScorerBanner conexion="ok" pendienteDeEnvio codigo="ABC123" sesionPerdida={v} />],
  ]

  it.each(casos)('%s: el banner se calla mientras está el aviso y vuelve cuando se va', async (_scorer, aviso) => {
    respaldo('ABC123')
    respuesta.actual = { data: { estado: 'en_curso' }, error: null }
    const { rerender } = render(<><OfflineBanner />{aviso(true)}</>)
    expect(screen.getAllByText(/sesión/i).length).toBeGreaterThan(0)
    await new Promise(r => setTimeout(r, 20))
    expect(screen.queryByText(/Sincronizando/)).toBeNull()
    rerender(<><OfflineBanner />{aviso(false)}</>)
    expect(await screen.findByText('Sincronizando 2 hoyos...')).toBeTruthy()
  })

  it('sin conexión, "Sin conexión" se sigue viendo aunque esté el aviso de sesión', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    respaldo('ABC123')
    render(<><OfflineBanner />{casos[0][1](true)}</>)
    expect(await screen.findByText(/^Sin conexión/)).toBeTruthy()
  })
})

