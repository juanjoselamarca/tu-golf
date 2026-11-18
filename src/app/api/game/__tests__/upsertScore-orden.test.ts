// @vitest-environment node
// Residual de #754: dos POST del mismo hoyo que el servidor procesa en desorden. El jugador anota 5, corrige a 4, y
// el POST del 5 llega después: quedaba guardado el 5. Con `seq`/`dispositivo`, upsertScore escribe por la función
// `guardar_hole_score`, que descarta el más viejo (la semántica SQL se probó en golfersplus-test, ver el PR). Sin la
// función todavía (código en prod antes de aprobar la migración) cae al upsert de siempre: nunca deja de guardar.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))

import { upsertScore } from '../actions'

const ROUND = '6f1c2a9e-3b4d-4e5f-8a7b-1c2d3e4f5a6b'
const HOLE_SCORE = '0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d'
const USER = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const DISPOSITIVO = '3d7a1f6e-2b8c-4d9e-a0f1-5c6b7a8d9e0f'

type Res = { data: unknown; error: unknown }
type RpcArgs = { p_fila: Record<string, unknown>; p_seq: number; p_dispositivo: string }

/** Una base de mentira con UN hoyo guardado y, si `conFuncion`, la semántica de guardar_hole_score. */
function base(opciones: { conFuncion?: boolean; errorRpc?: { code: string; message: string } } = {}) {
  const conFuncion = opciones.conFuncion ?? true
  const estado = { gross: null as number | null, marca: new Map<string, number>() }
  const llamadas = { rpc: [] as RpcArgs[], upsert: [] as Record<string, unknown>[], audit: 0, totales: 0 }

  function builder(single: () => Res, lista: () => Res = single) {
    const b: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'not']) b[m] = () => b
    b.update = () => { llamadas.totales++; return b }
    b.upsert = (fila: Record<string, unknown>) => { llamadas.upsert.push(fila); estado.gross = fila.gross_score as number; return b }
    b.single = () => Promise.resolve(single())
    b.then = (ok: (r: Res) => unknown) => Promise.resolve(lista()).then(ok)
    return b
  }

  const svc = {
    rpc: (fn: string, args: RpcArgs) => {
      llamadas.rpc.push(args)
      if (fn !== 'guardar_hole_score') throw new Error(`rpc inesperada: ${fn}`)
      if (opciones.errorRpc) return Promise.resolve({ data: null, error: opciones.errorRpc })
      if (!conFuncion) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } })
      const clave = `${args.p_fila.hole_number}:${args.p_dispositivo}`
      if ((estado.marca.get(clave) ?? 0) >= args.p_seq) return Promise.resolve({ data: { aplicado: false, id: HOLE_SCORE }, error: null })
      estado.marca.set(clave, args.p_seq)
      estado.gross = args.p_fila.gross_score as number
      return Promise.resolve({ data: { aplicado: true, id: HOLE_SCORE }, error: null })
    },
    from: (table: string) => {
      if (table === 'rounds') return builder(() => ({ data: { status: 'in_progress' }, error: null }))
      if (table === 'hole_scores') {
        return builder(
          () => ({ data: { id: HOLE_SCORE }, error: null }),
          () => ({ data: [{ gross_score: estado.gross, net_score: null, points: null }], error: null }),
        )
      }
      if (table === 'score_audit_log') return { insert: () => { llamadas.audit++; return Promise.resolve({ data: null, error: null }) } }
      throw new Error(`tabla inesperada: ${table}`)
    },
  }
  return { svc: svc as never, estado, llamadas }
}

const golpe = (gross: number, seq?: number, dispositivo: unknown = DISPOSITIVO) =>
  ({ round_id: ROUND, hole_number: 7, par: 4, gross_score: gross, ...(seq !== undefined ? { seq, dispositivo } : {}) })

// El reporte de la migración a medias tiene tope por minuto a nivel de módulo: cada test corre un reloj más
// adelante para no heredar el reporte del anterior.
let reloj = Date.UTC(2026, 10, 18)
beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime((reloj += 10 * 60_000))
})
afterEach(() => { vi.useRealTimers() })

describe('upsertScore · orden de los guardados de un hoyo', () => {
  it('el 5 (seq 1) que llega después del 4 (seq 2) se descarta: queda el 4, sin auditar ni recalcular totales', async () => {
    const { svc, estado, llamadas } = base()
    expect((await upsertScore(svc, USER, golpe(4, 2))).status).toBe(200)
    const tarde = await upsertScore(svc, USER, golpe(5, 1))
    expect(tarde.status).toBe(200)
    expect(await tarde.json()).toEqual({ success: true, descartado: true })
    expect(estado.gross).toBe(4)
    expect(llamadas.audit).toBe(1)
    expect(llamadas.totales).toBe(1)
    expect(llamadas.upsert).toHaveLength(0)
  })

  it('en orden (seq 1 y luego seq 2) se aplican los dos y queda el último', async () => {
    const { svc, estado, llamadas } = base()
    await upsertScore(svc, USER, golpe(5, 1))
    const res = await upsertScore(svc, USER, golpe(4, 2))
    expect(await res.json()).toMatchObject({ success: true, totalGross: 4 })
    expect(estado.gross).toBe(4)
    expect(llamadas.audit).toBe(2)
  })

  it('manda a la función la fila que armó el servidor, con la secuencia y el dispositivo', async () => {
    const { svc, llamadas } = base()
    await upsertScore(svc, USER, golpe(5, 3))
    expect(llamadas.rpc).toEqual([{
      p_fila: expect.objectContaining({ round_id: ROUND, hole_number: 7, gross_score: 5, source: 'manual_organizer', status: 'loaded', par: 4 }),
      p_seq: 3,
      p_dispositivo: DISPOSITIVO,
    }])
    // `seq` y `dispositivo` no son columnas de hole_scores.
    expect(llamadas.rpc[0].p_fila).not.toHaveProperty('seq')
    expect(llamadas.rpc[0].p_fila).not.toHaveProperty('dispositivo')
  })

  it('sin la función todavía (PGRST202): guarda con el upsert de antes, sin error', async () => {
    const { svc, estado, llamadas } = base({ conFuncion: false })
    const res = await upsertScore(svc, USER, golpe(5, 1))
    expect(res.status).toBe(200)
    expect(estado.gross).toBe(5)
    expect(llamadas.upsert).toHaveLength(1)
    expect(llamadas.audit).toBe(1)
    expect(captureError).not.toHaveBeenCalled()
  })

  it('42883 (función inexistente según Postgres) también cae al upsert', async () => {
    const { svc, llamadas } = base({ errorRpc: { code: '42883', message: 'function does not exist' } })
    expect((await upsertScore(svc, USER, golpe(5, 1))).status).toBe(200)
    expect(llamadas.upsert).toHaveLength(1)
  })

  // Revisión Fable v1: migración a medias (falta la tabla de marcas o el GRANT a service_role). Estado roto, no
  // transitorio: se guarda sin orden y se reporta, en vez de un 500 en cada golpe con secuencia.
  it.each([
    ['42P01', 'relation "public.hole_scores_orden" does not exist'],
    ['42501', 'permission denied for table hole_scores_orden'],
  ])('%s (migración incompleta): cae al upsert y se reporta', async (code, message) => {
    const { svc, estado, llamadas } = base({ errorRpc: { code, message } })
    const res = await upsertScore(svc, USER, golpe(5, 1))
    expect(res.status).toBe(200)
    expect(estado.gross).toBe(5)
    expect(llamadas.upsert).toHaveLength(1)
    expect(captureError).toHaveBeenCalledTimes(1)
    expect(captureError.mock.calls[0][1]).toMatchObject({ context: 'scoring.guardar_hole_score', meta: { code } })
  })

  // Revisión Fable de #832 (P2): la migración a medias se repite en CADA golpe. Sin tope, un torneo inundaba el
  // tracker con cientos de errores por minuto por la misma causa. El guardado de respaldo no cambia.
  it('migración incompleta: un reporte por minuto por instancia, y cada golpe se sigue guardando', async () => {
    const { svc, llamadas } = base({ errorRpc: { code: '42P01', message: 'relation does not exist' } })
    for (let seq = 1; seq <= 5; seq++) expect((await upsertScore(svc, USER, golpe(seq, seq))).status).toBe(200)
    expect(llamadas.upsert).toHaveLength(5)
    expect(captureError).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + 59_000)
    await upsertScore(svc, USER, golpe(6, 6))
    expect(captureError).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + 1_000)
    await upsertScore(svc, USER, golpe(7, 7))
    expect(captureError).toHaveBeenCalledTimes(2)
    expect(llamadas.upsert).toHaveLength(7)
  })

  // Revisión Fable de #834 (P2): el tope es por código. Falta la tabla y falta el permiso son arreglos distintos.
  it('el tope es por código: un 42501 dentro del minuto de un 42P01 se reporta igual', async () => {
    const tabla = base({ errorRpc: { code: '42P01', message: 'relation does not exist' } })
    await upsertScore(tabla.svc, USER, golpe(5, 1))
    const permiso = base({ errorRpc: { code: '42501', message: 'permission denied' } })
    await upsertScore(permiso.svc, USER, golpe(5, 2))
    await upsertScore(permiso.svc, USER, golpe(5, 3))
    expect(captureError).toHaveBeenCalledTimes(2)
    expect(captureError.mock.calls.map((c) => (c[1] as { meta: { code: string } }).meta.code)).toEqual(['42P01', '42501'])
  })

  it('otro error de la función NO cae al upsert sin orden: 500 y se reporta', async () => {
    const { svc, llamadas } = base({ errorRpc: { code: '57014', message: 'canceling statement due to statement timeout' } })
    const res = await upsertScore(svc, USER, golpe(5, 1))
    expect(res.status).toBe(500)
    expect(llamadas.upsert).toHaveLength(0)
    expect(captureError).toHaveBeenCalled()
  })

  it('sin secuencia (cliente viejo en caché): upsert directo, sin pasar por la función', async () => {
    const { svc, llamadas } = base()
    expect((await upsertScore(svc, USER, golpe(5))).status).toBe(200)
    expect(llamadas.rpc).toHaveLength(0)
    expect(llamadas.upsert).toHaveLength(1)
  })

  it('secuencia o dispositivo malformados: se guarda igual, sin orden', async () => {
    for (const [seq, disp] of [[0, DISPOSITIVO], [1.5, DISPOSITIVO], [1, 'no-es-uuid'], [1, null]] as const) {
      const { svc, llamadas } = base()
      expect((await upsertScore(svc, USER, golpe(5, seq, disp))).status).toBe(200)
      expect(llamadas.rpc).toHaveLength(0)
      expect(llamadas.upsert).toHaveLength(1)
    }
  })
})
