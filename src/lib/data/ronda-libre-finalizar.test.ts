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
  PG_INSUFFICIENT_PRIVILEGE,
  type RatingsPorTee,
} from './ronda-libre-finalizar'
import { actualizarScoresDeRonda } from './historial-edicion'
import { grossAjustadoDeFila } from './ajuste-whs-fila'

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

/** El INSERT en `historical_rounds` (antes va la lectura del índice del día). */
const insercion = (sb: ReturnType<typeof fakeSupabase>) =>
  sb.llamadas.find(l => l.tabla === 'historical_rounds' && l.cadena[0]?.[0] === 'insert')!

const PAR: Record<number, number> = { 1: 4, 2: 4, 3: 3, 4: 5, 5: 4, 6: 3, 7: 4, 8: 4, 9: 5, 10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5 }
const TEE = { rating: 71.3, slope: 128, front_course_rating: 35.6, front_slope_rating: 126, back_course_rating: 35.7, back_slope_rating: 130 }

const ronda = {
  course_name: 'Los Leones', course_id: 'c1', fecha: '2026-09-30', formato_juego: 'stroke_play' as const, modo_juego: 'gross' as const,
  holes: 18, hoyo_inicio: 1, tees: 'azul',
  id: 'r1', codigo: 'ABC', estado: 'en_curso', ronda_libre_jugadores: [],
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
    ronda, jugador: { id: 'p1', tees: null }, userId: 'u1', scores: scores18, scoresPorJugador: {},
    hoyos: hoyosDeLaRonda(1, 18), parMap: PAR, ratingsPorTee: new Map() as RatingsPorTee, conId: true,
  })

  it('sin hoyos jugados no inserta', async () => {
    const sb = fakeSupabase({})
    const r = await guardarTarjetaEnHistorial(sb as never, { ...base(), scores: {} })
    expect(r.status).toBe('sin_hoyos')
    expect(sb.llamadas.some(l => l.tabla === 'historical_rounds')).toBe(false)
  })

  it('inserta la fila canónica con ratings, diferencial y pide el id (scorer individual)', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE }, historical_rounds: c => (c[0][0] === 'insert' ? { data: { id: 'h1' } } : {}) })
    const r = await guardarTarjetaEnHistorial(sb as never, base())
    expect(r.status).toBe('insertada')
    if (r.status !== 'insertada') return
    expect(r.id).toBe('h1')
    const ins = insercion(sb)
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
    const ins = insercion(sb)
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
    if (r.status === 'error') expect((r.error as { code?: string }).code).toBe('42501')
  })

  it('scramble / foursome: diferencial null (el score es del equipo)', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE }, historical_rounds: {} })
    await guardarTarjetaEnHistorial(sb as never, { ...base(), ronda: { ...ronda, formato_juego: 'scramble' as never }, conId: false })
    const [, [fila]] = insercion(sb).cadena[0] as [string, [Record<string, unknown>]]
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
    const [, [fila]] = insercion(sb).cadena[0] as [string, [Record<string, unknown>]]
    expect(fila.holes_played).toBe(3)
    expect(fila.diferencial).toBeNull()
  })

  it('formato por equipos: el nombre del equipo viaja a la fila (lo resuelve el guardado, no el que llama)', async () => {
    const sb = fakeSupabase({
      course_tees: { data: TEE }, historical_rounds: {},
      ronda_equipo_jugadores: { data: { ronda_equipos: { nombre: 'Cóndores' } } },
    })
    await guardarTarjetaEnHistorial(sb as never, { ...base(), ronda: { ...ronda, formato_juego: 'best_ball' as never }, conId: false })
    const [, [fila]] = insercion(sb).cadena[0] as [string, [Record<string, unknown>]]
    expect(fila).toMatchObject({ match_result: null, team_name: 'Cóndores' })
  })
})

describe('guardarTarjetaEnHistorial — Adjusted Gross Score WHS 3.1 (#545)', () => {
  // Catálogo de 18 hoyos con el par de PAR y SI = número de hoyo.
  const CATALOGO = Object.entries(PAR).map(([n, par]) => ({ numero: Number(n), par, stroke_index: Number(n), recorrido: null }))
  const CANCHA = { slope_rating: 128, course_rating: 71.3, par_total: 72 }
  const conJugador = (handicap: number | null, formato = 'stroke_play') => ({
    ...ronda, formato_juego: formato as never,
    ronda_libre_jugadores: [{ id: 'p1', nombre: 'Ana', handicap, user_id: 'u1', scores: {}, tees: null }],
  }) as never
  const base = (r: unknown, scores: Record<number, number>, parMap: Record<number, number> = PAR) => ({
    ronda: r as typeof ronda, jugador: { id: 'p1', tees: null }, userId: 'u1', scores, scoresPorJugador: {},
    hoyos: hoyosDeLaRonda(1, 18), parMap, ratingsPorTee: new Map() as RatingsPorTee, conId: false,
  })
  const filaInsertada = (sb: ReturnType<typeof fakeSupabase>) =>
    (insercion(sb).cadena[0] as [string, [Record<string, unknown>]])[1][0]
  const ajusteDe = (fila: Record<string, unknown>) => (fila.metadata as { ajuste_whs: Record<string, unknown> }).ajuste_whs
  const conCatalogo = (indice: number | null, extra: Record<string, Respuesta | ((c: Cadena) => Respuesta)> = {}) => fakeSupabase({
    course_tees: { data: TEE }, courses: { data: CANCHA }, course_holes: { data: CATALOGO },
    profiles: { data: { indice } }, historical_rounds: {}, ...extra,
  })
  // Un 11 en el hoyo 4 (par 5, SI 4) y bogey en el resto.
  const conDesastre = { ...scores18, 4: 11 }
  const bruto = 90 - 6 + 11

  it('stroke play con índice: el 11 en el par 5 se topa en doble bogey neto y el diferencial sale del ajustado', async () => {
    const sb = conCatalogo(12)
    await guardarTarjetaEnHistorial(sb as never, base(conJugador(null), conDesastre))
    const fila = filaInsertada(sb)
    // CH = round(12 × 128/113 + (71.3 − 72)) = 13 → golpe en SI 4 → tope 5 + 2 + 1 = 8.
    expect(fila.total_gross).toBe(bruto)
    expect(fila.adjusted_gross).toBe(bruto - 3)
    expect(fila.diferencial).toBeCloseTo(((bruto - 3) - 71.3) * 113 / 128, 2)
    expect(ajusteDe(fila)).toMatchObject({ course_hcp: 13, indice: 12, si_fuente: 'catalogo', hoyos_topados: [{ hoyo: 4, gross: 11, tope: 8 }], hoyos_sin_par: [] })
  })

  it('el índice declarado en la tarjeta de la ronda manda sobre el del perfil', async () => {
    const sb = conCatalogo(30)
    await guardarTarjetaEnHistorial(sb as never, base(conJugador(12), conDesastre))
    expect(ajusteDe(filaInsertada(sb))).toMatchObject({ indice: 12, course_hcp: 13 })
  })

  it('sin índice (Regla 3.1a): tope par + 5', async () => {
    const sb = conCatalogo(null)
    await guardarTarjetaEnHistorial(sb as never, base(conJugador(null), conDesastre))
    const fila = filaInsertada(sb)
    expect(fila.adjusted_gross).toBe(bruto - 1)
    expect(ajusteDe(fila)).toMatchObject({ course_hcp: null, indice: null, hoyos_topados: [{ hoyo: 4, gross: 11, tope: 10 }] })
  })

  it('sin Course Rating/Slope creíbles NO aproxima el CH con el índice: tope par + 5 (P1-b)', async () => {
    const sb = conCatalogo(12, { course_tees: { data: null }, courses: { data: null } })
    await guardarTarjetaEnHistorial(sb as never, base(conJugador(null), conDesastre))
    const fila = filaInsertada(sb)
    expect(ajusteDe(fila)).toMatchObject({ course_hcp: null, indice: 12, hoyos_topados: [{ hoyo: 4, gross: 11, tope: 10 }] })
    expect(fila.adjusted_gross).toBe(bruto - 1)
  })

  it('ronda de 18 con sólo el back 9 jugado: CH de 9 hoyos con los MISMOS ratings que el diferencial y SI 1..9 (P2-a)', async () => {
    const back: Record<number, number> = {}
    for (let h = 10; h <= 18; h++) back[h] = PAR[h] + 1
    back[17] = 12
    const sb = conCatalogo(12)
    await guardarTarjetaEnHistorial(sb as never, base(conJugador(null), back))
    const fila = filaInsertada(sb)
    const aj = ajusteDe(fila) as { course_hcp: number; hoyos_reparto: number }
    expect(aj.hoyos_reparto).toBe(9)
    // El diferencial de esta tarjeta usa CR/2 = 35.65 y slope 128 (la ronda es de 18:
    // sin rating de 9 resuelto). El tope usa ESOS: round(6 × 128/113 + (35.65 − 36)) = 6.
    expect(aj.course_hcp).toBe(6)
    expect(fila.diferencial).toBeCloseTo(((fila.adjusted_gross as number) - 35.65) * 113 / 128 * 2, 2)
    // 6 golpes en SI 1..6 de la vuelta: el 17 (SI 8 de 9) no recibe → tope 5 + 2 = 7.
    expect(aj).toMatchObject({ hoyos_topados: [{ hoyo: 17, gross: 12, tope: 7 }] })
  })

  it('sin catálogo de hoyos: el par 4 de relleno no topa nada (ajustado = bruto)', async () => {
    const sb = conCatalogo(12, { course_holes: { data: [] } })
    await guardarTarjetaEnHistorial(sb as never, base(conJugador(null), conDesastre))
    const fila = filaInsertada(sb)
    expect(fila.adjusted_gross).toBe(bruto)
    expect(fila.diferencial).toBeCloseTo((bruto - 71.3) * 113 / 128, 2)
    expect(ajusteDe(fila).si_fuente).toBe('desconocido')
  })

  it('si el catálogo no responde, la ronda se guarda igual con el diferencial sobre el bruto y se reporta (3)', async () => {
    const sb = conCatalogo(12, { course_holes: () => { throw new Error('red caída') } })
    const r = await guardarTarjetaEnHistorial(sb as never, base(conJugador(null), conDesastre))
    expect(r.status).toBe('insertada')
    const fila = filaInsertada(sb)
    expect(fila.adjusted_gross).toBe(bruto)
    expect(fila.diferencial).toBeCloseTo((bruto - 71.3) * 113 / 128, 2)
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'ajuste-whs.catalogo' }))
  })

  it('sin índice declarado: el tope usa el índice del día de la ronda, no el de hoy del perfil', async () => {
    const sb = conCatalogo(25, {
      indice_historial: { data: [{ indice: 12, fecha: '2026-09-20T12:00:00Z' }, { indice: 25, fecha: '2026-10-15T12:00:00Z' }] },
    })
    await guardarTarjetaEnHistorial(sb as never, base(conJugador(null), conDesastre))
    expect(ajusteDe(filaInsertada(sb))).toMatchObject({ indice: 12, course_hcp: 13, hoyos_topados: [{ hoyo: 4, gross: 11, tope: 8 }] })
  })

  it('si leer el índice lanza, la ronda se guarda sin ajuste (bruto) y se reporta (3)', async () => {
    const sb = conCatalogo(12, { profiles: () => { throw new Error('red caída') } })
    const r = await guardarTarjetaEnHistorial(sb as never, base(conJugador(null), conDesastre))
    expect(r.status).toBe('insertada')
    const fila = filaInsertada(sb)
    expect(fila.adjusted_gross).toBeNull()
    expect(fila.diferencial).toBeCloseTo((bruto - 71.3) * 113 / 128, 2)
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'ronda-libre.tope-whs' }))
  })

  it('bola compartida: sin ajuste ni diferencial, y no consulta hoyos', async () => {
    const sb = fakeSupabase({ course_tees: { data: TEE }, historical_rounds: {} })
    await guardarTarjetaEnHistorial(sb as never, base(conJugador(null, 'scramble'), conDesastre))
    const fila = filaInsertada(sb)
    expect(fila.adjusted_gross).toBeNull()
    expect(fila.diferencial).toBeNull()
    expect((fila.metadata as Record<string, unknown>).ajuste_whs).toBeUndefined()
    expect(sb.llamadas.some(l => l.tabla === 'course_holes')).toBe(false)
  })

  it('el mínimo de hoyos sigue mandando: 3 hoyos no tienen diferencial aunque se topen', async () => {
    const sb = conCatalogo(12)
    await guardarTarjetaEnHistorial(sb as never, base(conJugador(null), { 1: 4, 2: 4, 4: 11 }))
    const fila = filaInsertada(sb)
    expect(fila.diferencial).toBeNull()
    // 3 hoyos no alcanzan para un course handicap de 9 creíble: sin CH, tope par + 5 (10).
    expect(fila.adjusted_gross).toBe(4 + 4 + 10)
  })
})

describe('finalizar y después corregir un hoyo: el ajuste de los demás no cambia (#545 P1-a, P1-c)', () => {
  const CATALOGO = Object.entries(PAR).map(([n, par]) => ({ numero: Number(n), par, stroke_index: Number(n), recorrido: null }))
  const CANCHA = { slope_rating: 128, course_rating: 71.3, par_total: 72 }
  const conJugador = { ...ronda, ronda_libre_jugadores: [{ id: 'p1', nombre: 'Ana', handicap: null, user_id: 'u1', scores: {}, tees: null }] } as never
  const input = (scores: Record<number, number>, parMap: Record<number, number>) => ({
    ronda: conJugador as typeof ronda, jugador: { id: 'p1', tees: null }, userId: 'u1', scores, scoresPorJugador: {},
    hoyos: hoyosDeLaRonda(1, 18), parMap, ratingsPorTee: new Map() as RatingsPorTee, conId: false,
  })
  /** Edita la fila recién insertada: la lectura devuelve esa fila; el UPDATE se captura. */
  const editar = async (fila: Record<string, unknown>, tablas: Record<string, Respuesta>, scores: (number | null)[]) => {
    const sb = fakeSupabase({
      ...tablas,
      historical_rounds: c => c.some(x => x[0] === 'update') ? { data: [{ id: 'h1' }] } : { data: { ...fila, user_id: 'u1', import_source: null } },
    })
    await actualizarScoresDeRonda(sb as never, { id: 'h1', scores })
    const up = sb.llamadas.filter(l => l.tabla === 'historical_rounds').map(l => l.cadena.find(c => c[0] === 'update')).find(Boolean)!
    return up[1][0] as Record<string, unknown>
  }
  const insertada = (sb: ReturnType<typeof fakeSupabase>) =>
    (insercion(sb).cadena[0] as [string, [Record<string, unknown>]])[1][0]

  it('cancha sin catálogo: el 9 en un hoyo de par de relleno no se topa ni al finalizar ni al editar otro hoyo', async () => {
    const PAR4 = Object.fromEntries(Object.keys(PAR).map(h => [Number(h), 4]))
    const tablas = { course_tees: { data: TEE }, courses: { data: CANCHA }, course_holes: { data: [] }, profiles: { data: { indice: 12 } } }
    const scores: Record<number, number> = { ...scores18, 4: 9 }
    const sb = fakeSupabase({ ...tablas, historical_rounds: {} })
    await guardarTarjetaEnHistorial(sb as never, input(scores, PAR4))
    const fila = insertada(sb)
    expect(fila.adjusted_gross).toBe(fila.total_gross)
    const nuevos = (fila.scores as number[]).slice(); nuevos[0] += 1
    const u = await editar(fila, tablas, nuevos)
    expect(u.adjusted_gross).toBe(u.total_gross)
    expect((u.metadata as { ajuste_whs: { hoyos_topados: unknown[] } }).ajuste_whs.hoyos_topados).toEqual([])
  })

  it('editar usa el índice con que se finalizó, aunque el perfil haya cambiado', async () => {
    const tablas = { course_tees: { data: TEE }, courses: { data: CANCHA }, course_holes: { data: CATALOGO } }
    const sb = fakeSupabase({ ...tablas, profiles: { data: { indice: 12 } }, historical_rounds: {} })
    await guardarTarjetaEnHistorial(sb as never, input({ ...scores18, 4: 11 }, PAR))
    const fila = insertada(sb)
    const nuevos = (fila.scores as number[]).slice(); nuevos[0] += 1
    const u = await editar(fila, { ...tablas, profiles: { data: { indice: 25 } } }, nuevos)
    expect((u.metadata as { ajuste_whs: Record<string, unknown> }).ajuste_whs).toMatchObject({ indice: 12, course_hcp: 13, hoyos_topados: [{ hoyo: 4, gross: 11, tope: 8 }] })
    expect(u.adjusted_gross).toBe(Number(fila.adjusted_gross) + 1)
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

describe('recalcularIndiceGolfers — reporte del scorer de grupo', () => {
  it('context / level / meta del caller llegan a captureError (antes el error se descartaba)', async () => {
    const sb = fakeSupabase({}, () => ({ error: { code: 'P0001', message: 'boom' } }))
    const ok = await recalcularIndiceGolfers(sb as never, 'u9', {
      context: 'score_grupo_finalize.calcular_indice', level: 'warning', meta: { codigo: 'ABC', userId: 'u9' },
    })
    expect(ok).toBe(false)
    expect(captureError).toHaveBeenCalledTimes(1)
    expect(captureError.mock.calls[0][0]).toMatchObject({ code: 'P0001' })
    expect(captureError.mock.calls[0][1]).toEqual({
      context: 'score_grupo_finalize.calcular_indice',
      level: 'warning',
      meta: { historicalUserId: 'u9', attempts: 1, codigo: 'ABC', userId: 'u9' },
    })
  })
})

describe('recalcularIndiceGolfers — 42501 (sin permiso) corta el reintento', () => {
  it('con 3 intentos configurados, un 42501 reporta de inmediato y no espera el backoff', async () => {
    vi.useFakeTimers()
    try {
      let n = 0
      const sb = fakeSupabase({}, () => { n++; return { error: { code: PG_INSUFFICIENT_PRIVILEGE, message: 'permission denied' } } })
      const p = recalcularIndiceGolfers(sb as never, 'u1', { reintentos: 3 })
      // Sin avanzar timers: si reintentara, la promesa quedaría colgada en el backoff de 1s.
      expect(await p).toBe(false)
      expect(n).toBe(1)
      expect(captureError).toHaveBeenCalledTimes(1)
      expect(captureError.mock.calls[0][0]).toMatchObject({ code: '42501' })
      expect(captureError.mock.calls[0][1]).toMatchObject({ meta: { historicalUserId: 'u1', attempts: 1 } })
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('un error transitorio seguido de éxito NO reporta (el corte es sólo para 42501)', async () => {
    vi.useFakeTimers()
    try {
      let n = 0
      const sb = fakeSupabase({}, () => { n++; return n === 1 ? { error: { code: '08006', message: 'red' } } : {} })
      const p = recalcularIndiceGolfers(sb as never, 'u1', { reintentos: 3 })
      await vi.runAllTimersAsync()
      expect(await p).toBe(true)
      expect(n).toBe(2)
      expect(captureError).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('fetchRondaParaCierre — ronda borrada vs falla de red', () => {
  it('sin filas (PGRST116) → estado no_existe; otro error → null', async () => {
    const borrada = fakeSupabase({ rondas_libres: { data: null, error: { code: 'PGRST116', message: 'no rows' } } })
    expect(await fetchRondaParaCierre(borrada as never, 'ABC')).toEqual({ estado: 'no_existe', jugadores: [] })
    const red = fakeSupabase({ rondas_libres: { data: null, error: { code: '', message: 'fetch failed' } } })
    expect(await fetchRondaParaCierre(red as never, 'ABC')).toBeNull()
  })
})
