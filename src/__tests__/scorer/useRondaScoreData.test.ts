import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, it, expect, vi } from 'vitest'
import { useRondaScoreData } from '@/app/ronda-libre/[codigo]/score/hooks/useRondaScoreData'
import { clearScoresDeRonda } from '@/lib/ronda/score-storage'

// Golpes que trae la BD para p1 (cada test los fija).
let golpesEnLaBd: Record<string, number> = {}
// Qué responde la lectura de la ronda: la fila, "no hay fila" (PGRST116) o una falla de red.
let respuestaRonda: 'ok' | 'no_existe' | 'red' = 'ok'
const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }))

// Chainable query builder stub that supports .in(), .order(), .single()
function makeQueryBuilder(table: string) {
  const builder: Record<string, unknown> = {}

  const orderChain = {
    order: () => orderChain,
    then: (resolve: (v: { data: unknown[] }) => void) => resolve({ data: [] }),
    // make it awaitable
    [Symbol.toPrimitive]: undefined,
  }
  // Make orderChain thenable (awaitable)
  Object.defineProperty(orderChain, 'then', {
    value: (onfulfilled: (v: { data: unknown[] }) => void) => {
      return Promise.resolve({ data: [] }).then(onfulfilled)
    },
    configurable: true,
  })
  // Also support direct await by implementing the promise interface
  const awaitableOrderChain = {
    order: () => awaitableOrderChain,
  } as { order: () => typeof awaitableOrderChain } & Promise<{ data: unknown[] }>
  Object.assign(awaitableOrderChain, {
    then: (onfulfilled: (v: { data: unknown[] }) => void, onrejected?: (e: unknown) => void) =>
      Promise.resolve({ data: [] }).then(onfulfilled, onrejected),
    catch: (onrejected: (e: unknown) => void) => Promise.resolve({ data: [] }).catch(onrejected),
    finally: (f: () => void) => Promise.resolve({ data: [] }).finally(f),
  })

  builder['select'] = () => builder
  builder['eq'] = () => builder
  builder['in'] = () => builder
  builder['order'] = () => awaitableOrderChain
  builder['single'] = async () => {
    if (table === 'rondas_libres' && respuestaRonda === 'no_existe') return { data: null, error: { code: 'PGRST116', message: '0 rows' } }
    if (table === 'rondas_libres' && respuestaRonda === 'red') return { data: null, error: { code: '', message: 'Failed to fetch' } }
    if (table === 'rondas_libres') {
      return {
        data: {
          id: 'r1', codigo: 'ABC123', course_name: 'Los Leones',
          course_id: null, tees: 'azul', holes: 9, fecha: '2026-05-12',
          estado: 'en_curso', modo_juego: 'gross', formato_juego: 'stroke_play',
          hoyo_inicio: 1, admin_mode: false, admin_user_id: null, recorridos: null,
          ronda_libre_jugadores: [{
            id: 'p1', nombre: 'Juanjo', user_id: 'u1',
            scores: golpesEnLaBd, handicap: 11.1, tees: 'azul',
          }],
        },
      }
    }
    return { data: null }
  }
  return builder
}

vi.mock('@/lib/supabase', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: 'u1' } } }),
      // El scorer lee la sesión del teléfono (sesionDelScorer), no el servidor de login.
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: null } } }, error: null }),
    },
    from: (table: string) => makeQueryBuilder(table),
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn() }),
}))

vi.mock('@/golf/core/course-handicap', () => ({
  resolverCourseHandicap: () => 11,
  // El handicap que puntúa (`resolverHandicapDeJuego`) parte del CH sin redondear.
  resolverCourseHandicapSinRedondear: () => 11,
  resolverCourseHandicapDisplay: () => 15,
  // El HCP a mostrar sale de la fuente única, que resuelve por su cuenta el
  // CourseData de 18h cuando la vuelta es de 9.
  resolverHandicapDisplayDeRonda: async () => 15,
  cargarCourseData: async () => ({ cr: 72, slope: 113, holes: 9, parTotal: 36 }),
}))

vi.mock('@/lib/ronda/score-storage', () => ({
  loadScores: () => ({}),
  saveScores: vi.fn(),
  clearScores: vi.fn(),
  clearScoresDeRonda: vi.fn(),
}))

vi.mock('@/golf/core/round-score', () => ({
  parTotalEstandar: (holes: number) => holes * 4,
}))

beforeEach(() => {
  golpesEnLaBd = {}
  respuestaRonda = 'ok'
  routerPush.mockClear()
  localStorage.clear()
})

describe('useRondaScoreData', () => {
  it('carga ronda + jugadores y deja loading en false', async () => {
    const { result } = renderHook(() => useRondaScoreData('ABC123', null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.ronda?.codigo).toBe('ABC123')
    expect(result.current.ronda?.ronda_libre_jugadores.length).toBe(1)
    // playerHcp = scoring (9h); hcpAMostrar = completo (18h) para mostrar.
    expect(result.current.playerHcp.p1).toBe(11)
    expect(result.current.hcpAMostrar('p1')).toBe(15)
  })

  it('devuelve activeJugadorId del jugador matched por user_id', async () => {
    const { result } = renderHook(() => useRondaScoreData('ABC123', null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.activeJugadorId).toBe('p1')
  })

  // Revisión Fable del #684: corregir el hoyo 3 (6 → 4) sin señal deja la tarjeta pendiente en el
  // respaldo; al recargar con señal la BD todavía tiene el 6. Si la pantalla mostrara el 6, el
  // siguiente toque reenviaría la tarjeta con el 6 y la corrección se perdería.
  it('la tarjeta que el servidor no confirmó gana sobre la BD al cargar', async () => {
    golpesEnLaBd = { '1': 5, '2': 4, '3': 6 }
    localStorage.setItem('golfers_score_ABC123_p1', JSON.stringify({
      scores: { 1: 5, 2: 4, 3: 4 }, timestamp: Date.now(), sincronizado: false, codigoRonda: 'ABC123', jugadorId: 'p1',
    }))
    const { result } = renderHook(() => useRondaScoreData('ABC123', null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.scores.p1).toEqual({ 1: 5, 2: 4, 3: 4 })
  })

  it('una tarjeta ya sincronizada no pisa a la BD', async () => {
    golpesEnLaBd = { '1': 5, '2': 4, '3': 6 }
    localStorage.setItem('golfers_score_ABC123_p1', JSON.stringify({
      scores: { 1: 5, 2: 4, 3: 4 }, timestamp: Date.now(), sincronizado: true, codigoRonda: 'ABC123', jugadorId: 'p1',
    }))
    const { result } = renderHook(() => useRondaScoreData('ABC123', null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.scores.p1).toEqual({ 1: 5, 2: 4, 3: 6 })
  })

  // PR #759: con la ronda borrada, el scorer manda al dashboard. El respaldo sin
  // sincronizar quedaba en el teléfono y el banner "Sincronizando N hoyos…" no se iba nunca.
  const respaldo = (jugador: string) => localStorage.setItem(`golfers_score_ABC123_${jugador}`, JSON.stringify({
    scores: { 1: 4 }, timestamp: Date.now(), sincronizado: false, codigoRonda: 'ABC123', jugadorId: jugador,
  }))

  it('ronda que ya no existe (PGRST116): borra las copias locales de la ronda y va al dashboard', async () => {
    respuestaRonda = 'no_existe'
    respaldo('p1'); respaldo('p2')
    localStorage.setItem('golfers_score_OTRA_p1', '{"sincronizado":false}')
    renderHook(() => useRondaScoreData('ABC123', null))
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/dashboard'))
    expect(localStorage.getItem('golfers_score_ABC123_p1')).toBeNull()
    expect(localStorage.getItem('golfers_score_ABC123_p2')).toBeNull()
    expect(localStorage.getItem('golfers_score_OTRA_p1')).not.toBeNull()
    expect(clearScoresDeRonda).toHaveBeenCalledWith('ABC123')
  })

  it('inverso: sin señal al leer la ronda NO borra nada ni saca al jugador', async () => {
    respuestaRonda = 'red'
    vi.mocked(clearScoresDeRonda).mockClear()
    respaldo('p1')
    const { result } = renderHook(() => useRondaScoreData('ABC123', null))
    await waitFor(() => expect(result.current.loadError).not.toBeNull())
    expect(routerPush).not.toHaveBeenCalled()
    expect(localStorage.getItem('golfers_score_ABC123_p1')).not.toBeNull()
    expect(clearScoresDeRonda).not.toHaveBeenCalled()
  })
})
