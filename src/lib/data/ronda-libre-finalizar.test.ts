import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import {
  fetchEstadoRondaLibre,
  fetchRondaParaCierre,
  fetchRatingsDelTee,
  guardarTarjetaEnHistorial,
  fetchIndiceDeUsuario,
  recalcularIndiceGolfers,
  actualizarNivelDelJugador,
  fetchNombreDeEquipoDelJugador,
  type RatingsPorTee,
} from './ronda-libre-finalizar'

const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

type Cadena = Array<[string, unknown[]]>
type Respuesta = { data?: unknown; error?: unknown; count?: number | null }

/**
 * Cliente falso: `from(tabla)` devuelve un builder encadenable que al hacer
 * `await` resuelve lo que diga `porTabla[tabla]` (valor fijo o función de la
 * cadena de llamadas). Registra cada cadena para poder afirmar sobre ella.
 */
function fakeSupabase(
  porTabla: Record<string, Respuesta | ((cadena: Cadena) => Respuesta)>,
  rpc: (fn: string, args: unknown) => Respuesta = () => ({ data: true, error: null }),
) {
  const llamadas: Array<{ tabla: string; cadena: Cadena }> = []
  const rpcSpy = vi.fn(async (fn: string, args: unknown) => ({ data: null, error: null, ...rpc(fn, args) }))
  return {
    llamadas,
    rpc: rpcSpy,
    from(tabla: string) {
      const cadena: Cadena = []
      llamadas.push({ tabla, cadena })
      const resolver = () => {
        const r = porTabla[tabla]
        const base = typeof r === 'function' ? r(cadena) : (r ?? {})
        return { data: null, error: null, ...base }
      }
      const proxy: Record<string, unknown> = new Proxy({}, {
        get(_t, prop) {
          if (prop === 'then') return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(res, rej)
          return (...args: unknown[]) => { cadena.push([String(prop), args]); return proxy }
        },
      })
      return proxy
    },
  }
}

const PAR: Record<number, number> = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5, 10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5 }
const TEE = { rating: 71.3, slope: 128, front_course_rating: 35.6, front_slope_rating: 126, back_course_rating: 35.7, back_slope_rating: 130 }

const ronda = {
  course_name: 'Los Leones', course_id: 'c1', fecha: '2026-09-30', formato_juego: 'stroke_play' as const, modo_juego: 'gross' as const,
  holes: 18, hoyo_inicio: 1, tees: 'azul',
}
const scores18: Record<number, number> = {}
for (let h = 1; h <= 18; h++) scores18[h] = PAR[h] + 1

beforeEach(() => captureError.mockClear())

describe('fetchEstadoRondaLibre / fetchRondaParaCierre', () => {
  it('estado de la ronda por código', async () => {
    const sb = fakeSupabase({ rondas_libres: { data: { estado: 'finalizada' } } })
    expect(await fetchEstadoRondaLibre(sb as never, 'ABC')).toBe('finalizada')
    expect(sb.llamadas[0].cadena).toEqual([['select', ['estado']], ['eq', ['codigo', 'ABC']], ['single', []]])
  })
  it('null cuando no existe', async () => {
    const sb = fakeSupabase({ rondas_libres: { data: null } })
    expect(await fetchEstadoRondaLibre(sb as never, 'ABC')).toBeNull()
    expect(await fetchRondaParaCierre(sb as never, 'ABC')).toBeNull()
  })
  it('ronda fresca con las tarjetas de todos', async () => {
    const sb = fakeSupabase({ rondas_libres: { data: { estado: 'en_curso', ronda_libre_jugadores: [{ id: 'p1', scores: { '1': 4 } }] } } })
    expect(await fetchRondaParaCierre(sb as never, 'ABC')).toEqual({ estado: 'en_curso', jugadores: [{ id: 'p1', scores: { '1': 4 } }] })
  })
})

describe('fetchRatingsDelTee', () => {
  it('sin cancha no consulta nada', async () => {
    const sb = fakeSupabase({})
    expect(await fetchRatingsDelTee(sb as never, null, 'azul', hoyosDeLaRonda(1, 18))).toEqual({ slope: null, cr: null, nineHole: null })
    expect(sb.llamadas).toHaveLength(0)
  })

  it('tee publicado: CR/slope del tee y, en una vuelta de 9 desde el 10, los ratings del BACK', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE } })
    const r = await fetchRatingsDelTee(sb as never, 'c1', 'azul', hoyosDeLaRonda(10, 9))
    expect(r).toEqual({ slope: 128, cr: 71.3, nineHole: { cr9h: 35.7, slope9h: 130 } })
    expect(sb.llamadas.map(l => l.tabla)).toEqual(['course_tees'])
    expect(sb.llamadas[0].cadena).toContainEqual(['ilike', ['nombre', 'azul%']])
  })

  it('18 hoyos: sin rating de 9 (no es una mitad)', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE } })
    const r = await fetchRatingsDelTee(sb as never, 'c1', 'azul', hoyosDeLaRonda(1, 18))
    expect(r.nineHole).toBeNull()
  })

  it('tee sin rating → cae al rating de la cancha', async () => {
    const sb = fakeSupabase({ course_tees: { data: null }, courses: { data: { slope_rating: 120, course_rating: 70.1 } } })
    const r = await fetchRatingsDelTee(sb as never, 'c1', 'blanco', hoyosDeLaRonda(1, 18))
    expect(r).toEqual({ slope: 120, cr: 70.1, nineHole: null })
    expect(sb.llamadas.map(l => l.tabla)).toEqual(['course_tees', 'courses'])
  })

  it('sin tee no consulta course_tees, sólo la cancha', async () => {
    const sb = fakeSupabase({ courses: { data: { slope_rating: 120, course_rating: 70.1 } } })
    const r = await fetchRatingsDelTee(sb as never, 'c1', '', hoyosDeLaRonda(1, 18))
    expect(r.slope).toBe(120)
    expect(sb.llamadas.map(l => l.tabla)).toEqual(['courses'])
  })
})

describe('guardarTarjetaEnHistorial', () => {
  const base = () => ({
    ronda, jugador: { id: 'p1', tees: null }, userId: 'u1', scores: scores18,
    hoyos: hoyosDeLaRonda(1, 18), parMap: PAR, ratingsPorTee: new Map() as RatingsPorTee, conId: true,
  })

  it('sin hoyos jugados no inserta', async () => {
    const sb = fakeSupabase({})
    const r = await guardarTarjetaEnHistorial(sb as never, { ...base(), scores: {} })
    expect(r.status).toBe('sin_hoyos')
    expect(sb.llamadas).toHaveLength(0)
  })

  it('inserta la fila canónica con ratings, diferencial y pide el id (scorer individual)', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE }, historical_rounds: { data: { id: 'h1' } } })
    const r = await guardarTarjetaEnHistorial(sb as never, base())
    expect(r.status).toBe('insertada')
    if (r.status !== 'insertada') return
    expect(r.id).toBe('h1')
    const ins = sb.llamadas.find(l => l.tabla === 'historical_rounds')!
    const [metodo, [fila]] = ins.cadena[0] as [string, [Record<string, unknown>]]
    expect(metodo).toBe('insert')
    expect(fila).toMatchObject({
      user_id: 'u1', course_name: 'Los Leones', course_id: 'c1', total_gross: 90, holes_played: 18,
      tee_color: 'azul', slope_rating: 128, course_rating: 71.3,
      metadata: { hoyos: hoyosDeLaRonda(1, 18), ronda_libre_jugador_id: 'p1' },
      formato_juego: 'stroke_play', modo_juego: 'gross', privacy: 'private',
    })
    // (90 − 71.3) × 113 / 128
    expect(fila.diferencial).toBeCloseTo(16.51, 2)
    expect(ins.cadena.map(c => c[0])).toEqual(['insert', 'select', 'single'])
  })

  it('scorer de grupo (conId=false): inserta sin pedir el id (no tropieza con RLS de otro usuario)', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE }, historical_rounds: {} })
    const r = await guardarTarjetaEnHistorial(sb as never, { ...base(), conId: false })
    expect(r).toMatchObject({ status: 'insertada', id: null })
    const ins = sb.llamadas.find(l => l.tabla === 'historical_rounds')!
    expect(ins.cadena.map(c => c[0])).toEqual(['insert'])
  })

  it('23505 (ya guardada desde el otro scorer) → duplicada, la primera queda', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE }, historical_rounds: { error: { code: '23505', message: 'dup' } } })
    const r = await guardarTarjetaEnHistorial(sb as never, base())
    expect(r.status).toBe('duplicada')
  })

  it('otro error de PostgREST → error con el error original', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE }, historical_rounds: { error: { code: '42501', message: 'rls' } } })
    const r = await guardarTarjetaEnHistorial(sb as never, base())
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.error.code).toBe('42501')
  })

  it('scramble / foursome: diferencial null (el score es del equipo)', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE }, historical_rounds: {} })
    await guardarTarjetaEnHistorial(sb as never, { ...base(), ronda: { ...ronda, formato_juego: 'scramble' as never }, conId: false })
    const [, [fila]] = sb.llamadas.find(l => l.tabla === 'historical_rounds')!.cadena[0] as [string, [Record<string, unknown>]]
    expect(fila.diferencial).toBeNull()
    expect(fila.slope_rating).toBe(128) // los ratings sí se guardan
  })

  it('el cache de ratings por tee evita consultar dos veces el mismo tee', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE }, historical_rounds: {} })
    const cache: RatingsPorTee = new Map()
    await guardarTarjetaEnHistorial(sb as never, { ...base(), ratingsPorTee: cache, conId: false })
    await guardarTarjetaEnHistorial(sb as never, { ...base(), jugador: { id: 'p2', tees: 'AZUL' }, ratingsPorTee: cache, conId: false })
    expect(sb.llamadas.filter(l => l.tabla === 'course_tees')).toHaveLength(1)
    expect(cache.has('azul')).toBe(true)
  })

  it('menos de 9 hoyos: sin diferencial aunque haya ratings', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE }, historical_rounds: {} })
    await guardarTarjetaEnHistorial(sb as never, { ...base(), scores: { 1: 4, 2: 4, 3: 3 }, conId: false })
    const [, [fila]] = sb.llamadas.find(l => l.tabla === 'historical_rounds')!.cadena[0] as [string, [Record<string, unknown>]]
    expect(fila.holes_played).toBe(3)
    expect(fila.diferencial).toBeNull()
  })

  it('match_result y team_name viajan a la fila', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE }, historical_rounds: {} })
    await guardarTarjetaEnHistorial(sb as never, { ...base(), matchResult: '3&2', teamName: 'Cóndores', conId: false })
    const [, [fila]] = sb.llamadas.find(l => l.tabla === 'historical_rounds')!.cadena[0] as [string, [Record<string, unknown>]]
    expect(fila).toMatchObject({ match_result: '3&2', team_name: 'Cóndores' })
  })
})

describe('fetchIndiceDeUsuario', () => {
  it('índice del perfil o null', async () => {
    expect(await fetchIndiceDeUsuario(fakeSupabase({ profiles: { data: { indice: 12.4 } } }) as never, 'u1')).toBe(12.4)
    expect(await fetchIndiceDeUsuario(fakeSupabase({ profiles: { data: null } }) as never, 'u1')).toBeNull()
  })
})

describe('recalcularIndiceGolfers', () => {
  it('éxito al primer intento', async () => {
    const sb = fakeSupabase({})
    expect(await recalcularIndiceGolfers(sb as never, 'u1', { reintentos: 3 })).toBe(true)
    expect(sb.rpc).toHaveBeenCalledTimes(1)
    expect(sb.rpc).toHaveBeenCalledWith('calcular_indice_golfers', { p_user_id: 'u1' })
    expect(captureError).not.toHaveBeenCalled()
  })

  it('reintenta con backoff y reporta sólo si agota los intentos', async () => {
    vi.useFakeTimers()
    try {
      let n = 0
      const sb = fakeSupabase({}, () => { n++; return { error: { code: '08006', message: 'red' } } })
      const p = recalcularIndiceGolfers(sb as never, 'u1', { reintentos: 3, context: 'x' })
      await vi.runAllTimersAsync()
      expect(await p).toBe(false)
      expect(n).toBe(3)
      expect(captureError).toHaveBeenCalledTimes(1)
      expect(captureError.mock.calls[0][1]).toMatchObject({ context: 'x', level: 'error', meta: { historicalUserId: 'u1', attempts: 3 } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('un solo intento (scorer de grupo): falla → reporta sin esperar', async () => {
    const sb = fakeSupabase({}, () => ({ error: { code: '08006', message: 'red' } }))
    expect(await recalcularIndiceGolfers(sb as never, 'u1')).toBe(false)
    expect(sb.rpc).toHaveBeenCalledTimes(1)
    expect(captureError).toHaveBeenCalledTimes(1)
  })
})

describe('actualizarNivelDelJugador', () => {
  it('cuenta rondas de 90 días y escribe nivel con vigencia de 60 días', async () => {
    const sb = fakeSupabase({ historical_rounds: { count: 7 }, profiles: {} })
    await actualizarNivelDelJugador(sb as never, 'u1')
    const upd = sb.llamadas.find(l => l.tabla === 'profiles')!
    const [metodo, [payload]] = upd.cadena[0] as [string, [Record<string, unknown>]]
    expect(metodo).toBe('update')
    expect(payload.nivel).toBe(3) // 6..11 rondas → Jugador Activo
    expect(upd.cadena[1]).toEqual(['eq', ['id', 'u1']])
    const cnt = sb.llamadas.find(l => l.tabla === 'historical_rounds')!
    expect(cnt.cadena[0]).toEqual(['select', ['*', { count: 'exact', head: true }]])
  })
})

describe('fetchNombreDeEquipoDelJugador', () => {
  it('nombre del equipo o null', async () => {
    const sb = fakeSupabase({ ronda_equipo_jugadores: { data: { ronda_equipos: { nombre: 'Cóndores' } } } })
    expect(await fetchNombreDeEquipoDelJugador(sb as never, 'r1', 'p1')).toBe('Cóndores')
    expect(await fetchNombreDeEquipoDelJugador(fakeSupabase({ ronda_equipo_jugadores: { data: null } }) as never, 'r1', 'p1')).toBeNull()
  })
})
