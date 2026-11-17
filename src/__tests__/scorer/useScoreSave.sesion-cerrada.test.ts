import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useScoreSave } from '@/app/ronda-libre/[codigo]/score/hooks/useScoreSave'
import { addToast } from '@/hooks/useToast'
import { leerRespaldoPendiente } from '@/lib/ronda/respaldo-local'
import { loginUrl } from '@/lib/auth/login-url'

/**
 * PR #789 (hunter 13-nov): en el scorer de ronda libre, con la sesión cerrada en plena ronda el RPC corre como
 * anónimo y responde P0003. Antes: "No puedes anotar esta tarjeta…" al propio jugador en cada golpe, sin salida.
 * Ahora: un aviso persistente "Tu sesión se cerró" con "Iniciar sesión" que vuelve a esta tarjeta, sin toast ni
 * redirección sola, y el respaldo local sigue pendiente para que useOfflineResync lo reenvíe al volver.
 */

const mockRpc = vi.fn()
const mockGetSession = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createClient: () => ({ auth: { getSession: mockGetSession }, rpc: mockRpc }),
}))
vi.mock('@/hooks/useToast', () => ({ addToast: vi.fn() }))

const makeScoreSync = () => ({
  guardarLocal: vi.fn(),
  marcarSincronizado: vi.fn(),
  tienePendientes: vi.fn(() => false),
  obtenerLocal: vi.fn(),
  obtenerTimestamp: vi.fn(() => 0),
  syncInProgressRef: { current: false },
})

const P0003 = { data: null, error: { code: 'P0003', message: 'RONDA_FORBIDDEN' } }
const P0003_DEMO = { data: null, error: { code: 'P0003', message: 'RONDA_FORBIDDEN', details: 'ronda demo' } }
const SIN_SESION = { data: { session: null }, error: null }
const SESION_NO_CONFIRMABLE = { data: { session: null }, error: { message: 'Failed to fetch' } }
const TITULO_PERMISO = 'No puedes anotar esta tarjeta'

const toastsCon = (titulo: string) => vi.mocked(addToast).mock.calls.filter(([t]) => t.title === titulo)

function montar(authUserId: string | null = 'u1') {
  return renderHook(() => useScoreSave({ codigo: 'ABC123', isOnline: true, scoreSync: makeScoreSync(), authUserId }))
}

async function anotar(result: ReturnType<typeof montar>['result'], jugadorId: string, scores: Record<number, number>) {
  await act(async () => { await result.current.saveScores(jugadorId, scores) })
  await act(async () => { await vi.runAllTimersAsync() })
}

beforeEach(() => {
  vi.useFakeTimers()
  mockRpc.mockReset()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null })
  vi.mocked(addToast).mockClear()
  localStorage.clear()
})

afterEach(() => { vi.useRealTimers() })

describe('useScoreSave — P0003 con la sesión cerrada', () => {
  it('había sesión al abrir y ya no: aviso persistente con "Iniciar sesión" que vuelve a esta tarjeta; ni toast ni "No puedes anotar"', async () => {
    mockRpc.mockResolvedValue(P0003)
    mockGetSession.mockResolvedValue(SIN_SESION)
    const { result } = montar()
    await anotar(result, 'p1', { 1: 4 })

    expect(mockRpc).toHaveBeenCalledTimes(1)  // P0003 no se reintenta
    expect(result.current.sesionCerrada).toEqual({
      titulo: 'Tu sesión se cerró',
      detalle: expect.stringContaining('quedaron en este teléfono'),
      cta: 'Iniciar sesión',
      href: loginUrl('/ronda-libre/ABC123/score?j=p1'),
    })
    expect(addToast).not.toHaveBeenCalled()
    expect(result.current.saveStatus).toBe('error')
  })

  it('el respaldo local queda pendiente (no se descarta) para reenviarse al volver con la sesión', async () => {
    mockRpc.mockResolvedValue(P0003)
    mockGetSession.mockResolvedValue(SIN_SESION)
    // El respaldo lo escribe scoreSync.guardarLocal al anotar (acá simulado): se siembra como quedaría.
    localStorage.setItem('golfers_score_ABC123_p1', JSON.stringify({ scores: { 1: 4, 2: 5 }, timestamp: Date.now(), sincronizado: false, codigoRonda: 'ABC123', jugadorId: 'p1' }))
    const { result } = montar()
    await anotar(result, 'p1', { 1: 4, 2: 5 })
    expect(result.current.sesionCerrada).not.toBeNull()
    expect(leerRespaldoPendiente('ABC123', 'p1')).toEqual({ 1: 4, 2: 5 })
  })

  it('golpes siguientes: el mismo aviso sigue, sin repetirse ni sumar toasts', async () => {
    mockRpc.mockResolvedValue(P0003)
    mockGetSession.mockResolvedValue(SIN_SESION)
    const { result } = montar()
    await anotar(result, 'p1', { 1: 4 })
    const primero = result.current.sesionCerrada
    await anotar(result, 'p1', { 1: 4, 2: 5 })
    await anotar(result, 'p1', { 1: 4, 2: 5, 3: 3 })
    expect(result.current.sesionCerrada).toEqual(primero)
    expect(addToast).not.toHaveBeenCalled()
  })

  it('cambia de tarjeta y la rechaza también: "Iniciar sesión" vuelve a la tarjeta en pantalla', async () => {
    mockRpc.mockResolvedValue(P0003)
    mockGetSession.mockResolvedValue(SIN_SESION)
    const { result } = montar()
    await anotar(result, 'p1', { 1: 4 })
    await anotar(result, 'p2', { 1: 5 })
    expect(result.current.sesionCerrada?.href).toBe(loginUrl('/ronda-libre/ABC123/score?j=p2'))
  })

  it('un guardado que vuelve a llegar apaga el aviso', async () => {
    mockRpc.mockResolvedValueOnce(P0003)
    mockGetSession.mockResolvedValue(SIN_SESION)
    const { result } = montar()
    await anotar(result, 'p1', { 1: 4 })
    expect(result.current.sesionCerrada).not.toBeNull()
    mockRpc.mockResolvedValue({ data: { '1': 4, '2': 5 }, error: null })
    await anotar(result, 'p1', { 1: 4, 2: 5 })
    expect(result.current.sesionCerrada).toBeNull()
  })

  it('Finalizar sin sesión: devuelve sin_permiso (Finalizar no cierra) y deja el aviso', async () => {
    mockRpc.mockResolvedValue(P0003)
    mockGetSession.mockResolvedValue(SIN_SESION)
    const { result } = montar()
    let r: string | undefined
    await act(async () => { r = await result.current.guardarAhora('p1', { 1: 4 }) })
    expect(r).toBe('sin_permiso')
    expect(result.current.sesionCerrada?.cta).toBe('Iniciar sesión')
  })
})

describe('useScoreSave — P0003 que NO es sesión cerrada', () => {
  it('con sesión (tarjeta de otro de verdad): aviso de permiso, sin aviso de sesión', async () => {
    mockRpc.mockResolvedValue(P0003)
    const { result } = montar()
    await anotar(result, 'p1', { 1: 4 })
    expect(toastsCon(TITULO_PERMISO)).toHaveLength(1)
    expect(result.current.sesionCerrada).toBeNull()
  })

  it('nunca hubo sesión (link abierto sin entrar): aviso de permiso, ni se consulta la sesión', async () => {
    mockRpc.mockResolvedValue(P0003)
    mockGetSession.mockResolvedValue(SIN_SESION)
    const { result } = montar(null)
    await anotar(result, 'p1', { 1: 4 })
    expect(mockGetSession).not.toHaveBeenCalled()
    expect(toastsCon(TITULO_PERMISO)).toHaveLength(1)
    expect(result.current.sesionCerrada).toBeNull()
  })

  it('ronda demo (P0003 "ronda demo") aunque no haya sesión: aviso de permiso, no de sesión', async () => {
    mockRpc.mockResolvedValue(P0003_DEMO)
    mockGetSession.mockResolvedValue(SIN_SESION)
    const { result } = montar()
    await anotar(result, 'p1', { 1: 4 })
    expect(toastsCon(TITULO_PERMISO)).toHaveLength(1)
    expect(result.current.sesionCerrada).toBeNull()
  })

  it('no se puede confirmar la sesión (renovarla falló por red): como falta de conexión', async () => {
    mockRpc.mockResolvedValue(P0003)
    mockGetSession.mockResolvedValue(SESION_NO_CONFIRMABLE)
    const { result } = montar()
    let r: string | undefined
    await act(async () => { r = await result.current.guardarAhora('p1', { 1: 4 }) })
    expect(r).toBe('sin_conexion')
    expect(result.current.sesionCerrada).toBeNull()
    expect(toastsCon(TITULO_PERMISO)).toHaveLength(0)
    expect(result.current.saveStatus).toBe('error')
  })
})
