/**
 * Scorer de grupo ante una caída del servidor — incidente del 04-oct-2026 (torneo Los Leones).
 *
 * Ese día la API respondió en 20-80 s y Auth devolvió 5xx: el scorer mandó al marcador al
 * login/dashboard y no se recuperó solo. Regla: una falla PASAJERA nunca saca a nadie de su
 * ronda; se anota desde la copia local y se reintenta solo.
 */
import { FORMATO_PERSONALIZADO } from '@/golf/formats/personalizado'
import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRondaGrupoData, hoyoInicial } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useRondaGrupoData'
import { saveScorerGrupoSnapshot, saveGroupScores, loadScorerGrupoSnapshot, marcarPendientes } from '@/lib/ronda/score-storage'
import { MENSAJE_SCORER_SIN_CONEXION, PLAZO_CARGA_SCORER_MS, REINTENTO_CARGA_MS } from '@/lib/data/ronda-libre-scorer'
import { useAnotadorDeEquipo } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useAnotadorDeEquipo'
import { MENSAJE_EQUIPOS_TARDAN } from '@/lib/data/ronda-libre-anotador'

const push = vi.fn()
const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }))
const captureError = vi.hoisted(() => vi.fn())
vi.mock('@/lib/error-tracking', () => ({ captureError }))
const addToast = vi.hoisted(() => vi.fn())
vi.mock('@/hooks/useToast', () => ({ addToast }))
const reclamarEquipo = vi.hoisted(() => vi.fn())
vi.mock('@/lib/data/ronda-libre-anotador', async (orig) => ({
  ...(await orig<typeof import('@/lib/data/ronda-libre-anotador')>()),
  reclamarEquipoDeRonda: reclamarEquipo,
}))

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
const opcionesDeCarga: unknown[] = []
/** Compuerta de la lectura de la ronda: mientras `espera` no se resuelva, la lectura queda en vuelo. */
const lecturaEnVuelo = { espera: null as Promise<void> | null }
function compuerta() {
  let abrir = () => {}
  const espera = new Promise<void>(r => { abrir = r })
  lecturaEnVuelo.espera = espera
  return () => { if (lecturaEnVuelo.espera === espera) lecturaEnVuelo.espera = null; abrir() }
}
const lecturaDeEquipos = { falla: false, equipos: [] as unknown[] }
/** Lectura que no contesta nunca (wifi del club que acepta la conexión y no responde). */
type LecturaDeCarga = 'equipos' | 'hoyos' | 'handicaps'
const colgada = { lectura: null as LecturaDeCarga | null }
const nunca = <T,>() => new Promise<T>(() => {})
vi.mock('@/lib/data/ronda-libre-scorer', async (orig) => {
  const real = await orig<typeof import('@/lib/data/ronda-libre-scorer')>()
  return {
    ...real,
    fetchRondaLibreParaScorer: async (_sb: unknown, _codigo: string, opciones?: unknown) => {
      opcionesDeCarga.push(opciones)
      if (lecturaEnVuelo.espera) await lecturaEnVuelo.espera
      return carga.valor
    },
    cargarHoyosDelScorer: async () => colgada.lectura === 'hoyos'
      ? nunca()
      : ({ parMap: { 11: 3, 12: 4, 13: 4 }, holeDataMap: {}, finalParTotal: 72 }),
    resolverHandicapsDelScorer: async () => colgada.lectura === 'handicaps'
      ? nunca()
      : ({ hcpMap: { j1: 10 }, displayMap: { j1: 10 }, sinIndice: new Set<string>() }),
    fetchEquiposDelScorer: async () => {
      if (colgada.lectura === 'equipos') return nunca()
      if (lecturaDeEquipos.falla) throw new Error('Failed to fetch')
      return lecturaDeEquipos.equipos
    },
  }
})

function snapshotPrevio(teamEquipos: unknown[] = []) {
  saveScorerGrupoSnapshot('B4F5Y2', {
    at: Date.now(), authUserId: 'u1', anotadorNombre: 'Juan José Lamarca', ronda: RONDA,
    parMap: { 11: 3, 12: 4, 13: 4 }, holeDataMap: {}, playerHcp: { j1: 10 }, playerDisplayHcp: { j1: 10 }, teamEquipos,
  })
}

beforeEach(() => {
  opcionesDeCarga.length = 0
  lecturaDeEquipos.falla = false
  colgada.lectura = null
  lecturaEnVuelo.espera = null
  addToast.mockClear()
  reclamarEquipo.mockReset()
  captureError.mockClear()
  lecturaDeEquipos.equipos = []
  localStorage.clear()
  push.mockClear()
  replace.mockClear()
  sesion.valor = { session: { user: { id: 'u1', email: 'juanjo@x.cl' } }, error: null }
  carga.valor = { estado: 'ok', ronda: RONDA }
})
afterEach(() => vi.useRealTimers())

describe('useRondaGrupoData — quién anota la Timba (anotaLaRonda, sin bucle con /score)', () => {
  it('Timba sin modo admin: va a la ronda en vivo, nunca a /score (que la mandaría de vuelta)', async () => {
    carga.valor = { estado: 'ok', ronda: { ...RONDA, formato_juego: FORMATO_PERSONALIZADO, admin_mode: false } }
    renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ronda-libre/B4F5Y2'))
    expect(replace).not.toHaveBeenCalledWith('/ronda-libre/B4F5Y2/score')
  })
  it('Timba en modo admin y el usuario es el admin: se queda en el scorer de grupo', async () => {
    carga.valor = { estado: 'ok', ronda: { ...RONDA, formato_juego: FORMATO_PERSONALIZADO } }
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(replace).not.toHaveBeenCalled()
  })
})

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
    expect(localStorage.getItem('ronda_grupo_B4F5Y2')).not.toBeNull() // sin señal no se limpia nada
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

  it('si al reconectar los equipos no se pueden leer: sigue sin conexión y conserva los equipos que tenía', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const equipos = [{ id: 'e1', nombre: 'Cóndores', handicap_equipo: 8, handicap_equipo_juego: 4, scores: {}, jugadorIds: ['j1'] }]
    snapshotPrevio(equipos)
    carga.valor = { estado: 'sin_conexion' }
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.conexion).toBe('sin_conexion'))
    expect(result.current.teamEquipos).toEqual(equipos)

    carga.valor = { estado: 'ok', ronda: RONDA }
    lecturaDeEquipos.falla = true
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) })
    expect(result.current.conexion).toBe('sin_conexion')
    expect(result.current.teamEquipos).toEqual(equipos)
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

  it('la ronda de verdad no existe (PGRST116): limpia su copia local y va al dashboard', async () => {
    snapshotPrevio()
    saveGroupScores('B4F5Y2', { j1: { 11: 4 } })
    localStorage.setItem('golfers_score_B4F5Y2_j1', JSON.stringify({ scores: { 11: 4 }, sincronizado: false, codigoRonda: 'B4F5Y2', jugadorId: 'j1' }))
    carga.valor = { estado: 'no_existe' }
    renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'))
    // Sin esto el banner "Sincronizando…" quedaba pegado con golpes que ya no tienen dónde subirse.
    expect(loadScorerGrupoSnapshot('B4F5Y2', 'u1')).toBeNull()
    expect(localStorage.getItem('ronda_grupo_B4F5Y2')).toBeNull()
    expect(localStorage.getItem('golfers_score_B4F5Y2_j1')).toBeNull()
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

describe('useRondaGrupoData — cada lectura de la carga tiene plazo (revisión Fable #867)', () => {
  // Sin plazo, una de estas lecturas colgada dejaba el scorer en "Cargando…" para siempre (ni copia local ni
  // reintento: la carga en vuelo bloquea las siguientes). Al vencer, el mismo camino que una caída del servidor.
  const LECTURAS: LecturaDeCarga[] = ['equipos', 'hoyos', 'handicaps']

  it.each(LECTURAS)('%s colgada sin copia local: al vencer el plazo, pantalla de espera que reintenta sola', async (lectura) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    colgada.lectura = lectura
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await act(async () => { await vi.advanceTimersByTimeAsync(PLAZO_CARGA_SCORER_MS - 1_000) })
    expect(result.current.loading).toBe(true)
    await act(async () => { await vi.advanceTimersByTimeAsync(1_050) })
    expect(result.current.loading).toBe(false)
    expect(result.current.loadError).toBe(MENSAJE_SCORER_SIN_CONEXION)
    expect(result.current.conexion).toBe('sin_conexion')
    expect(push).not.toHaveBeenCalled()

    // La señal vuelve: el reintento de siempre la recupera.
    colgada.lectura = null
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) })
    await waitFor(() => expect(result.current.conexion).toBe('ok'))
    expect(result.current.loadError).toBeNull()
  })

  it.each(LECTURAS)('%s colgada con copia local: al vencer el plazo abre desde la copia', async (lectura) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    snapshotPrevio()
    colgada.lectura = lectura
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await act(async () => { await vi.advanceTimersByTimeAsync(PLAZO_CARGA_SCORER_MS + 50) })
    expect(result.current.loading).toBe(false)
    expect(result.current.conexion).toBe('sin_conexion')
    expect(result.current.loadError).toBeNull()
    expect(result.current.ronda?.id).toBe('r1')
  })
})

describe('useRondaGrupoData — recargar con una lectura en vuelo (revisión Fable, 1ª vuelta)', () => {
  it('la promesa de recargar() no se resuelve hasta que termina la vuelta que de verdad atiende el pedido', async () => {
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const abrir1 = compuerta()
    let primera: Promise<void> | undefined
    act(() => { primera = result.current.recargar() })
    let atendida = false
    act(() => { void result.current.recargar().then(() => { atendida = true }) })
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(atendida).toBe(false)
    // Termina la lectura vieja (salió antes del pedido): arranca otra vuelta, que sigue en vuelo.
    const abrir2 = compuerta()
    abrir1()
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(atendida).toBe(false)
    abrir2()
    await waitFor(() => expect(atendida).toBe(true))
    await act(async () => { await primera })
  })

  it('reclamar con una lectura colgada en vuelo: la tarjeta sigue congelada y al vencer el plazo avisa que la lista tarda', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    reclamarEquipo.mockResolvedValue({ estado: 'ok' })
    const { result } = renderHook(() => {
      const data = useRondaGrupoData('B4F5Y2')
      const anotador = useAnotadorDeEquipo({ codigo: 'B4F5Y2', recargar: data.recargar, recargarTrasDejarEquipo: data.recargarTrasDejarEquipo })
      return { data, anotador }
    })
    await waitFor(() => expect(result.current.data.loading).toBe(false))
    const abrir = compuerta()
    act(() => { void result.current.data.recargar() }) // el refresco periódico, colgado por la mala señal
    act(() => { void result.current.anotador.reclamar('e2') })
    await act(async () => { await vi.advanceTimersByTimeAsync(PLAZO_CARGA_SCORER_MS - 1_000) })
    expect(result.current.anotador.enCurso).toBe('e2')
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: MENSAJE_EQUIPOS_TARDAN }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1_050) })
    expect(result.current.anotador.enCurso).toBeNull()
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: MENSAJE_EQUIPOS_TARDAN }))
    abrir()
  })
})

describe('useRondaGrupoData — la primera lectura lanza (un bug, no la red) (Fable, 3ª vuelta)', () => {
  it('no queda en «Preparando scorer»: pantalla de espera que reintenta sola, y el error se reporta como error', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    carga.valor = { estado: 'ok', ronda: { ...RONDA, es_demo: true } } // redirige a la ronda en vivo…
    replace.mockImplementationOnce(() => { throw new Error('navegación') }) // …y la navegación revienta
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.loadError).toBe(MENSAJE_SCORER_SIN_CONEXION)
    expect(result.current.conexion).toBe('sin_conexion')
    expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ message: 'navegación' }), expect.objectContaining({ level: 'error' }))

    // El reintento de siempre vuelve a leer.
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) })
    expect(replace).toHaveBeenCalledTimes(2)
  })

  // Opus, 4ª vuelta: un bug determinista se repite en cada reintento; solo el primero va como error.
  it('si la lectura lanza en cada reintento, solo el primer reporte es error; los siguientes, warning', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    carga.valor = { estado: 'ok', ronda: { ...RONDA, es_demo: true } }
    replace.mockImplementation(() => { throw new Error('navegación') })
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) })
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) })
    const niveles = captureError.mock.calls
      .filter(([e]) => (e as Error)?.message === 'navegación')
      .map(([, ctx]) => (ctx as { level: string }).level)
    expect(niveles.length).toBeGreaterThanOrEqual(3)
    expect(niveles[0]).toBe('error')
    expect(niveles.slice(1).every(n => n === 'warning')).toBe(true)
    replace.mockReset()
  })
})

describe('useRondaGrupoData — pendientes ganan (revisión Fable)', () => {
  it('corrección offline (hoyo 12: 6 → 7) sobrevive a reabrir con el servidor de vuelta', async () => {
    marcarPendientes('B4F5Y2', 'j1', { 12: 7 }) // la BD tiene 12: 6
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conexion).toBe('ok')
    expect(result.current.scores.j1[12]).toBe(7)
    expect(result.current.golpesSinSubir).toBe(true)
  })
})

describe('hoyoInicial', () => {
  const base = { hoyo_inicio: 1, holes: 9, ronda_libre_jugadores: [{ id: 'p1' }, { id: 'p2' }] }
  it('individual: primer hoyo sin anotar', () => {
    const r = { ...base, formato_juego: 'stroke_play' } as never
    expect(hoyoInicial(r, { p1: { 1: 4, 2: 5 }, p2: { 1: 4, 2: 5 } })).toBe(3)
  })
  it('si otro jugador va atrás abre en su hoyo: el primero que le falte a alguna tarjeta', () => {
    const r = { ...base, formato_juego: 'stroke_play' } as never
    expect(hoyoInicial(r, { p1: { 1: 4, 2: 5, 3: 4 }, p2: { 1: 4 } })).toBe(2)
  })
  it('con la tarjeta llena abre en el último hoyo, donde está Finalizar', () => {
    const r = { ...base, holes: 3, formato_juego: 'stroke_play' } as never
    expect(hoyoInicial(r, { p1: { 1: 4, 2: 5, 3: 4 }, p2: { 1: 5, 2: 4, 3: 4 } })).toBe(3)
  })
  it('scramble (bola compartida): mira la tarjeta del primer EQUIPO, no la del jugador (vacía)', () => {
    const r = { ...base, formato_juego: 'scramble' } as never
    expect(hoyoInicial(r, { p1: {} }, [{ scores: { '1': 4, '2': 3, '3': 5 } }])).toBe(4)
  })
  it('salida del 10 en 18 hoyos: respeta el orden de juego', () => {
    const r = { ...base, holes: 18, hoyo_inicio: 10, formato_juego: 'stroke_play' } as never
    expect(hoyoInicial(r, { p1: { 10: 4, 11: 4 }, p2: { 10: 5, 11: 4 } })).toBe(12)
  })
})

// Revisión Fable (17-nov): una copia local anterior al orden del juego abre en el orden canónico y el servidor trae
// el del juego. El refresco de fondo no mueve las filas bajo el dedo, pero sí trae los datos nuevos de cada jugador.
describe('useRondaGrupoData — orden de los jugadores al reconectar', () => {
  const jug = (id: string, nombre: string, handicap: number) => ({ id, nombre, user_id: id === 'j1' ? 'u1' : null, scores: {}, handicap, tees: 'azul' })
  it('pide reglas_juego (con sesión) y al reconectar conserva el orden en pantalla con los datos nuevos', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const enCopia = { ...RONDA, ronda_libre_jugadores: [jug('j1', 'Ana', 8.2), jug('j2', 'Beto', 12), jug('j3', 'Caro', 20)] }
    saveScorerGrupoSnapshot('B4F5Y2', {
      at: Date.now(), authUserId: 'u1', anotadorNombre: 'Ana', ronda: enCopia,
      parMap: { 11: 3, 12: 4, 13: 4 }, holeDataMap: {}, playerHcp: { j1: 10 }, playerDisplayHcp: { j1: 10 }, teamEquipos: [],
    })
    carga.valor = { estado: 'sin_conexion' }
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.conexion).toBe('sin_conexion'))
    expect(result.current.ronda?.ronda_libre_jugadores.map(j => j.id)).toEqual(['j1', 'j2', 'j3'])

    carga.valor = { estado: 'ok', ronda: { ...RONDA, ronda_libre_jugadores: [jug('j3', 'Caro', 21), jug('j1', 'Ana', 8.2), jug('j2', 'Beto', 13)] } }
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) })
    await waitFor(() => expect(result.current.conexion).toBe('ok'))
    expect(result.current.ronda?.ronda_libre_jugadores.map(j => j.id)).toEqual(['j1', 'j2', 'j3'])
    expect(result.current.ronda?.ronda_libre_jugadores.map(j => j.handicap)).toEqual([8.2, 13, 21])
    expect(opcionesDeCarga.length).toBeGreaterThan(0)
    expect(opcionesDeCarga.every(o => (o as { conReglasDelJuego?: boolean })?.conReglasDelJuego === true)).toBe(true)
  })
})

describe('useRondaGrupoData — un celular por equipo (scramble rápido)', () => {
  const SCRAMBLE = { ...RONDA, formato_juego: 'scramble', admin_mode: false, admin_user_id: null }
  const eq = (id: string, anotador: string | null, nombre: string | null = null) => ({
    id, nombre: id, handicap_equipo: 10, handicap_equipo_juego: 3, handicap_origen: 'club', scores: {}, jugadorIds: [], jugadorNombres: [],
    anotador_user_id: anotador, anotador_nombre: nombre,
  })
  it('el creador carga solo su equipo y los libres; el de Pedro queda aparte y nunca en teamEquipos', async () => {
    carga.valor = { estado: 'ok', ronda: SCRAMBLE }
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', 'u-pedro', 'Pedro'), eq('e3', null)]
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.teamEquipos.map(e => e.id)).toEqual(['e1', 'e3'])
    expect(result.current.equiposDeOtroCelular.map(e => e.id)).toEqual(['e2'])
    expect(result.current.unCelularPorEquipo).toBe(true)
    expect(result.current.eleccion).toBeNull()
    // La copia local también guarda solo los suyos: al abrir sin red no aparece el equipo de Pedro.
    expect((loadScorerGrupoSnapshot('B4F5Y2', 'u1')?.teamEquipos as { id: string }[] | undefined)?.map(e => e.id)).toEqual(['e1', 'e3'])
  })
  it('una cuenta sin equipo (abrió el link): elige equipo, no anota ni va a la ronda en vivo', async () => {
    sesion.valor = { session: { user: { id: 'u-juan' } }, error: null }
    carga.valor = { estado: 'ok', ronda: SCRAMBLE }
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', null)]
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.eleccion).not.toBeNull())
    expect(result.current.eleccion?.equipos.map(e => e.id)).toEqual(['e1', 'e2'])
    expect(result.current.teamEquipos).toEqual([])
    expect(replace).not.toHaveBeenCalled()
  })
  it('«Elige tu equipo» se relee solo: un equipo que otro toma aparece tomado sin recargar la página', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    sesion.valor = { session: { user: { id: 'u-juan' } }, error: null }
    carga.valor = { estado: 'ok', ronda: SCRAMBLE }
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', null)]
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.eleccion).not.toBeNull())
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', 'u-pedro', 'Pedro')]
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) })
    await waitFor(() => expect(result.current.eleccion?.equipos.find(e => e.id === 'e2')?.anotador_user_id).toBe('u-pedro'))
  })
  it('«Elige tu equipo» sin señal (plazo vencido): la lista se queda, no la pantalla de sin conexión', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    sesion.valor = { session: { user: { id: 'u-juan' } }, error: null }
    carga.valor = { estado: 'ok', ronda: SCRAMBLE }
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', null)]
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.eleccion).not.toBeNull())
    colgada.lectura = 'equipos'
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + PLAZO_CARGA_SCORER_MS + 50) })
    expect(result.current.conexion).toBe('sin_conexion')
    expect(result.current.loadError).toBeNull()
    expect(result.current.eleccion?.equipos.map(e => e.id)).toEqual(['e1', 'e2'])
    expect(push).not.toHaveBeenCalled()

    // La señal vuelve: se relee y la lista se pone al día.
    colgada.lectura = null
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', 'u-pedro', 'Pedro')]
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) })
    await waitFor(() => expect(result.current.conexion).toBe('ok'))
    expect(result.current.eleccion?.equipos.find(e => e.id === 'e2')?.anotador_user_id).toBe('u-pedro')
  })

  /** Los tres pedidos de fondo que pasan por `cargar` (Fable, 2ª vuelta): ninguno encola vuelta. */
  const TICS: Array<[string, () => Promise<void>]> = [
    ['el intervalo', async () => { await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) }) }],
    ['«online»', async () => { act(() => { window.dispatchEvent(new Event('online')) }) }],
    ['volver a la app', async () => {
      const ahora = Date.now()
      const visible = vi.spyOn(document, 'visibilityState', 'get')
      const reloj = vi.spyOn(Date, 'now')
      visible.mockReturnValue('hidden'); reloj.mockReturnValue(ahora)
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      visible.mockReturnValue('visible'); reloj.mockReturnValue(ahora + 5000)
      act(() => { document.dispatchEvent(new Event('visibilitychange')) })
      visible.mockRestore(); reloj.mockRestore()
    }],
  ]
  it.each(TICS)('con señal lenta, %s no alarga la corrida: recargar() se resuelve tras la vuelta siguiente', async (_n, tic) => {
    // Revisión Fable, 2ª vuelta: cada tic (15 s) caía dentro de una vuelta de ~58 s y encolaba otra; la corrida no
    // terminaba nunca y Finalizar, que espera recargar(), quedaba en «Finalizando…».
    vi.useFakeTimers({ shouldAdvanceTime: true })
    sesion.valor = { session: { user: { id: 'u-juan' } }, error: null }
    carga.valor = { estado: 'ok', ronda: SCRAMBLE }
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', null)]
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.eleccion).not.toBeNull())
    const abrir1 = compuerta()
    await act(async () => { await vi.advanceTimersByTimeAsync(REINTENTO_CARGA_MS + 50) }) // tic: vuelta 1, colgada
    let atendida = false
    act(() => { void result.current.recargar().then(() => { atendida = true }) })
    const abrir2 = compuerta()
    abrir1() // termina la vuelta 1; la 2 (la del pedido) queda colgada
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    await tic() // un pedido de fondo dentro de la vuelta 2
    expect(atendida).toBe(false)
    const abrir3 = compuerta()
    abrir2()
    await act(async () => { await vi.advanceTimersByTimeAsync(50) })
    expect(atendida).toBe(true)
    abrir3()
  })

  it('una vuelta que lanza no pierde el pedido encolado ni deja un rechazo sin manejar', async () => {
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    const abrir1 = compuerta()
    const estados: string[] = []
    act(() => { result.current.recargar().then(() => estados.push('p1 ok'), () => estados.push('p1 rechazo')) })
    act(() => { result.current.recargar().then(() => estados.push('p2 ok'), () => estados.push('p2 rechazo')) })
    // La vuelta 1 termina en una ronda demo (redirige) y la navegación revienta una vez.
    carga.valor = { estado: 'ok', ronda: { ...RONDA, es_demo: true } }
    replace.mockImplementationOnce(() => { throw new Error('navegación') })
    abrir1()
    await waitFor(() => expect(estados).toEqual(['p1 ok', 'p2 ok']))
    expect(replace).toHaveBeenCalledTimes(2) // la vuelta encolada corrió igual
    expect(captureError).toHaveBeenCalledWith(expect.objectContaining({ message: 'navegación' }), expect.anything())
  })

  it('una vuelta que lanza con «Elige tu equipo» en pantalla: la lista se queda (sin pantalla de error)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    sesion.valor = { session: { user: { id: 'u-juan' } }, error: null }
    carga.valor = { estado: 'ok', ronda: SCRAMBLE }
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', null)]
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.eleccion).not.toBeNull())
    carga.valor = { estado: 'ok', ronda: { ...SCRAMBLE, es_demo: true } }
    replace.mockImplementationOnce(() => { throw new Error('navegación') })
    await act(async () => { await result.current.recargar() })
    expect(captureError).toHaveBeenCalled()
    expect(result.current.loadError).toBeNull()
    expect(result.current.eleccion?.equipos.map(e => e.id)).toEqual(['e1', 'e2'])
  })

  it('«Elige tu equipo» relee al volver a la app (más de 2 s afuera)', async () => {
    sesion.valor = { session: { user: { id: 'u-juan' } }, error: null }
    carga.valor = { estado: 'ok', ronda: SCRAMBLE }
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', null)]
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.eleccion).not.toBeNull())
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', 'u-pedro', 'Pedro')]
    const ahora = Date.now()
    const visible = vi.spyOn(document, 'visibilityState', 'get')
    const reloj = vi.spyOn(Date, 'now')
    visible.mockReturnValue('hidden'); reloj.mockReturnValue(ahora)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    visible.mockReturnValue('visible'); reloj.mockReturnValue(ahora + 5000)
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    visible.mockRestore(); reloj.mockRestore()
    await waitFor(() => expect(result.current.eleccion?.equipos.find(e => e.id === 'e2')?.anotador_user_id).toBe('u-pedro'))
  })
  it('ronda de un celular (admin_mode): un extraño va a la ronda en vivo, como siempre', async () => {
    sesion.valor = { session: { user: { id: 'u-juan' } }, error: null }
    carga.valor = { estado: 'ok', ronda: { ...SCRAMBLE, admin_mode: true, admin_user_id: 'u1' } }
    lecturaDeEquipos.equipos = [eq('e1', null)]
    renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/ronda-libre/B4F5Y2'))
  })
  it('par al pasar de hoyo: otro celular reclama un equipo del creador y sale de teamEquipos (lo que se rellena con par)', async () => {
    carga.valor = { estado: 'ok', ronda: SCRAMBLE }
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e3', null)]
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.teamEquipos.map(e => e.id)).toEqual(['e1', 'e3'])
    addToast.mockClear()
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e3', 'u-pedro', 'Pedro')]
    await act(async () => { await result.current.recargar() })
    // autoFillTeamsWithPar y completarEquiposConPar recorren teamEquipos: e3 ya no está ahí.
    expect(result.current.teamEquipos.map(e => e.id)).toEqual(['e1'])
    expect(result.current.equiposDeOtroCelular.map(e => e.id)).toEqual(['e3'])
    // Era suyo en pantalla: se avisa.
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ya no anotas este equipo.' }))
  })
  it('lo liberaron mientras anotaba (P0003 → recargar): «Ya no anotas este equipo.» y vuelve a elegir equipo', async () => {
    sesion.valor = { session: { user: { id: 'u-pedro' } }, error: null }
    carga.valor = { estado: 'ok', ronda: SCRAMBLE }
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', 'u-pedro', 'Pedro')]
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.teamEquipos.map(e => e.id)).toEqual(['e2'])
    addToast.mockClear()
    // El creador liberó e2: la relectura (la que dispara el P0003 vía alPerderEquipo) ya no lo trae como suyo.
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', null)]
    await act(async () => { await result.current.recargar() })
    expect(result.current.eleccion?.equipos.map(e => e.id)).toEqual(['e1', 'e2'])
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ya no anotas este equipo.' }))
    // La copia local del equipo perdido se borra: sin señal no vuelve a abrir el scorer de e2.
    expect(loadScorerGrupoSnapshot('B4F5Y2', 'u-pedro')).toBeNull()
  })
  it('«Dejar este equipo»: vuelve a elegir equipo SIN el aviso «Ya no anotas» y sin la copia local', async () => {
    sesion.valor = { session: { user: { id: 'u-pedro' } }, error: null }
    carga.valor = { estado: 'ok', ronda: SCRAMBLE }
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', 'u-pedro', 'Pedro')]
    const { result } = renderHook(() => useRondaGrupoData('B4F5Y2'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    addToast.mockClear()
    lecturaDeEquipos.equipos = [eq('e1', 'u1'), eq('e2', null)]
    await act(async () => { await result.current.recargarTrasDejarEquipo() })
    expect(result.current.eleccion?.equipos.map(e => e.id)).toEqual(['e1', 'e2'])
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Ya no anotas este equipo.' }))
    expect(loadScorerGrupoSnapshot('B4F5Y2', 'u-pedro')).toBeNull()
  })
})
