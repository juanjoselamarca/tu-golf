/**
 * Scorer de grupo ante una caída del servidor — incidente del 04-oct-2026 (torneo Los Leones).
 *
 * Ese día la API respondió en 20-80 s y Auth devolvió 5xx: el scorer mandó al marcador al
 * login/dashboard y no se recuperó solo. Regla: una falla PASAJERA nunca saca a nadie de su
 * ronda; se anota desde la copia local y se reintenta solo.
 */
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRondaGrupoData } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useRondaGrupoData'
import { saveScorerGrupoSnapshot, saveGroupScores, loadScorerGrupoSnapshot } from '@/lib/ronda/score-storage'
import { MENSAJE_SCORER_SIN_CONEXION, REINTENTO_CARGA_MS } from '@/lib/data/ronda-libre-scorer'

const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

type SesionMock = { session: unknown; error: unknown } | 'lanza'
const sesion = { valor: { session: { user: { id: 'u1', email: 'juanjo@x.cl' } }, error: null } as SesionMock }
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getSession: async () => {
        if (sesion.valor === 'lanza') throw new TypeError('Failed to fetch')
        return { data: { session: sesion.valor.session }, error: sesion.valor.error }
      },
    },
  }),
}))

const RONDA = {
  id: 'r1', codigo: 'B4F5Y2', course_name: 'Club de Golf Los Leones', course_id: 'c1', tees: 'azul', holes: 18,
  fecha: '2026-10-04', estado: 'en_curso', modo_juego: 'gross', formato_juego: 'stableford', admin_mode: true,
  admin_user_id: 'u1', creador_id: 'u1', hoyo_inicio: 11, recorridos: null, es_demo: false,
  ronda_libre_jugadores: [{ id: 'j1', nombre: 'Juan José Lamarca', user_id: 'u1', scores: { 11: 4, 12: 6 }, handicap: 8.2, tees: 'azul' }],
}
const carga = { valor: { estado: 'ok', ronda: RONDA } as { estado: string; ronda?: unknown } }
vi.mock('@/lib/data/ronda-libre-scorer', async (orig) => {
  const real = await orig<typeof import('@/lib/data/ronda-libre-scorer')>()
  return {
    ...real,
    fetchRondaLibreParaScorer: async () => carga.valor,
    cargarHoyosDelScorer: async () => ({ parMap: { 11: 3, 12: 4, 13: 4 }, holeDataMap: {}, finalParTotal: 72 }),
    resolverHandicapsDelScorer: async () => ({ hcpMap: { j1: 10 }, displayMap: { j1: 10 } }),
    fetchEquiposDelScorer: async () => [],
  }
})

function snapshotPrevio() {
  saveScorerGrupoSnapshot('B4F5Y2', {
    at: 1, authUserId: 'u1', anotadorNombre: 'Juan José Lamarca', ronda: RONDA,
    parMap: { 11: 3, 12: 4, 13: 4 }, holeDataMap: {}, playerHcp: { j1: 10 }, playerDisplayHcp: { j1: 10 }, teamEquipos: [],
  })
}

beforeEach(() => {
  localStorage.clear()
  push.mockClear()
  replace.mockClear()
  sesion.valor = { session: { user: { id: 'u1', email: 'juanjo@x.cl' } }, error: null }
  carga.valor = { estado: 'ok', ronda: RONDA }
})
afterEach(() => vi.useRealTimers())

describe('useRondaGrupoData — resiliencia ante caídas del servidor', () => {
  it('online: carga, conexión ok y deja la copia local para abrir sin servidor', async () => {
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conexion).toBe('ok')
    expect(result.current.ronda?.id).toBe('r1')
    expect(result.current.currentHole).toBe(13) // primer hoyo sin anotar desde la salida del 11
    expect(loadScorerGrupoSnapshot('B4F5Y2', 'u1')?.parMap).toEqual({ 11: 3, 12: 4, 13: 4 })
  })

  it('servidor caído al abrir/recargar CON copia local: abre igual, lo local gana y NO redirige', async () => {
    snapshotPrevio()
    saveGroupScores('B4F5Y2', { j1: { 11: 4, 12: 6, 13: 5, 14: 3 } }) // golpes anotados offline
    carga.valor = { estado: 'sin_conexion' }
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conexion).toBe('sin_conexion')
    expect(result.current.loadError).toBeNull()
    expect(result.current.scores.j1).toEqual({ 11: 4, 12: 6, 13: 5, 14: 3 })
    expect(result.current.currentHole).toBe(15)
    expect(push).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('Auth caído (getSession falla, como los 5xx del 04-oct): NUNCA manda al login', async () => {
    snapshotPrevio()
    sesion.valor = { session: null, error: { name: 'AuthRetryableFetchError', status: 503 } }
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conexion).toBe('sin_conexion')
    expect(result.current.ronda?.id).toBe('r1')
    expect(push).not.toHaveBeenCalled()
  })

  it('getSession revienta (red caída): tampoco manda al login', async () => {
    snapshotPrevio()
    sesion.valor = 'lanza'
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(push).not.toHaveBeenCalled()
    expect(result.current.ronda?.id).toBe('r1')
  })

  it('sin copia local y sin servidor: pantalla de espera (no dashboard) y se recupera SOLA al volver', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    carga.valor = { estado: 'sin_conexion' }
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadError).toBe(MENSAJE_SCORER_SIN_CONEXION)
    expect(push).not.toHaveBeenCalled()

    carga.valor = { estado: 'ok', ronda: RONDA }
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) })
    await waitFor(() => expect(result.current.conexion).toBe('ok'))
    expect(result.current.loadError).toBeNull()
    expect(result.current.ronda?.id).toBe('r1')
  })

  it('al reconectar en segundo plano refresca la ronda SIN pisar los golpes anotados offline', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    snapshotPrevio()
    saveGroupScores('B4F5Y2', { j1: { 11: 4, 12: 6, 13: 5 } })
    carga.valor = { estado: 'sin_conexion' }
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.conexion).toBe('sin_conexion'))
    act(() => { result.current.setScores(s => ({ ...s, j1: { ...s.j1, 14: 3 } })) })

    carga.valor = { estado: 'ok', ronda: RONDA } // la BD sólo tiene 11 y 12
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) })
    await waitFor(() => expect(result.current.conexion).toBe('ok'))
    expect(result.current.scores.j1).toEqual({ 11: 4, 12: 6, 13: 5, 14: 3 })
  })

  it('la ronda de verdad no existe (PGRST116): dashboard, como antes', async () => {
    carga.valor = { estado: 'no_existe' }
    renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
  })

  it('de verdad sin sesión y sin copia: login, como antes', async () => {
    sesion.valor = { session: null, error: null }
    renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(push).toHaveBeenCalledWith(expect.stringContaining('/login')))
  })

  it('sesión vencida pero con copia: sigue anotando (conexión sin_sesion) en vez de expulsar', async () => {
    snapshotPrevio()
    sesion.valor = { session: null, error: null }
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conexion).toBe('sin_sesion')
    expect(push).not.toHaveBeenCalled()
  })
})
