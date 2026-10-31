import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { leerResultadoConfirmacion } from '@/hooks/useConfirmarImportacion'
import { actualizacionGarmin, fetchFilasGarminExistentes } from '@/lib/data/import-garmin'
import { ESPERA_CONFIRM_EN_CURSO_MS, PLAZO_RECLAMO_CONFIRM_MS } from '@/lib/data/import-jobs'
import { importRound } from '@/lib/import-round'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '33333333-3333-4333-8333-333333333333'

type Llamada = { tabla: string; op: string; payload?: unknown; filtros?: unknown[][] }
let llamadas: Llamada[] = []
let job: Record<string, unknown> = {}
/** Cómo leen el job las lecturas siguientes a la primera (mientras otro confirm guarda). */
let jobsSiguientes: Record<string, unknown>[] = []
/** Resultado de cada intento de reclamar el job; el último se repite. */
let reclamos: boolean[] = []
let fallaCompletar = false

/** Builder encadenable y "thenable" como el de PostgREST que registra cada escritura. */
function builder(tabla: string) {
  let op = 'select'
  let payload: unknown
  const resultado = () => {
    if (tabla === 'import_jobs' && op === 'select') {
      const leido = job
      if (jobsSiguientes.length > 0) job = jobsSiguientes.shift()!
      return { data: leido, error: null }
    }
    if (tabla === 'import_jobs' && op === 'update' && (payload as { status?: string }).status === 'confirming') {
      const tomado = reclamos.length > 1 ? reclamos.shift()! : (reclamos[0] ?? true)
      return { data: tomado ? [{ id: JOB_ID }] : [], error: null }
    }
    if (tabla === 'import_jobs' && op === 'update' && (payload as { status?: string }).status === 'completed' && fallaCompletar) {
      return { data: null, error: { message: 'caída' } }
    }
    if (tabla === 'historical_rounds' && op === 'update') return { data: [{ id: 'ronda-garmin' }], error: null }
    if (tabla === 'historical_rounds' && op === 'select') return { data: [], error: null, count: 0 }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  let escritura: Llamada | undefined
  for (const m of ['select', 'gte', 'order', 'limit']) b[m] = vi.fn(() => b)
  for (const m of ['eq', 'neq', 'or']) {
    b[m] = vi.fn((...args: unknown[]) => {
      escritura?.filtros?.push([m, ...args])
      return b
    })
  }
  for (const m of ['insert', 'update', 'delete']) {
    b[m] = vi.fn((p?: unknown) => {
      op = m
      payload = p
      escritura = { tabla, op: m, payload: p, filtros: [] }
      llamadas.push(escritura)
      return b
    })
  }
  b.single = vi.fn(() => Promise.resolve(resultado()))
  b.maybeSingle = vi.fn(() => Promise.resolve(resultado()))
  b.then = (res: (v: unknown) => void, rej?: (e: unknown) => void) => Promise.resolve(resultado()).then(res, rej)
  return b
}

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }) },
    from: (tabla: string) => builder(tabla),
    rpc: () => Promise.resolve({ data: null, error: null }),
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/data/import-garmin', () => ({
  fetchFilasGarminExistentes: vi.fn(async () => new Map([['g-1', {}]])),
  actualizacionGarmin: vi.fn(async () => ({})),
}))
vi.mock('@/lib/import-round', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/import-round')>()),
  importRound: vi.fn(),
}))
vi.mock('@/lib/data/perfil', () => ({ fetchRondasCPI: vi.fn(async () => null) }))
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/ai', () => ({ callLLM: vi.fn(async () => ({ text: '' })), AllProvidersFailedError: class extends Error {} }))
vi.mock('@/golf/coach/detect-and-save-patterns', () => ({ detectAndSavePatterns: vi.fn(async () => undefined) }))

import { maxDuration, POST } from './route'

const scores = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), 5]))
const rondaGarmin = {
  tempId: 't-1',
  played_at: '2026-10-01',
  course_name: 'Club de prueba',
  total_gross: 45,
  holes_played: 9,
  scores,
  metadata: { garmin_scorecard_id: 'g-1', import_source: 'garmin_zip' },
  import_confidence: 1,
  validation: { valid: true, holesPlayed: 9, issues: [] },
}

function confirmar() {
  return POST(new Request('http://test/api/import/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: JOB_ID, rounds: [rondaGarmin] }),
  }) as unknown as NextRequest)
}

const escrituras = () => llamadas.filter(l => l.op !== 'select')

const escriturasDelJob = () => escrituras().filter(l => l.tabla === 'import_jobs').map(l => l.payload)

beforeEach(() => {
  llamadas = []
  jobsSiguientes = []
  reclamos = []
  fallaCompletar = false
  vi.clearAllMocks()
})

describe('POST /api/import/confirm: reintento sobre un job ya completado', () => {
  it('responde 200 con lo que guardó el primer confirm y no vuelve a escribir', async () => {
    job = { id: JOB_ID, user_id: USER_ID, status: 'completed', total_imported: 3, total_updated: 2 }
    const res = await confirmar()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toEqual({ success: true, job_id: JOB_ID, total_imported: 3, total_updated: 2, total_errors: 0, total_duplicates: 0 })
    expect(leerResultadoConfirmacion(body)).toMatchObject({ importadas: 3, actualizadas: 2, noGuardadas: [] })
    expect(escrituras()).toEqual([])
    expect(importRound).not.toHaveBeenCalled()
    expect(actualizacionGarmin).not.toHaveBeenCalled()
  })

  it('devuelve también las tarjetas que el primer confirm no guardó', async () => {
    job = {
      id: JOB_ID, user_id: USER_ID, status: 'completed', total_imported: 2, total_updated: 0,
      unsaved_rounds: {
        errors: [{ tempId: 't-3', error: 'Tarjeta incompleta' }],
        duplicates: [{ tempId: 't-4', course: 'Club de prueba', date: '2026-09-01' }],
      },
    }
    const body = await (await confirmar()).json()
    expect(leerResultadoConfirmacion(body)).toMatchObject({
      importadas: 2, duplicadas: 1, fallidas: 1, noGuardadas: ['t-4', 't-3'],
    })
    expect(escrituras()).toEqual([])
  })

  it('un job completado antes de la columna total_updated responde 0 actualizadas', async () => {
    job = { id: JOB_ID, user_id: USER_ID, status: 'completed', total_imported: 4, total_updated: null }
    const body = await (await confirmar()).json()
    expect(body).toMatchObject({ total_imported: 4, total_updated: 0 })
  })
})

describe('POST /api/import/confirm: al completar el job', () => {
  it('lo reclama antes de guardar y al cerrar guarda las re-escritas aparte y lo que no se guardó', async () => {
    job = { id: JOB_ID, user_id: USER_ID, status: 'review_required' }
    const res = await confirmar()
    expect(res.status).toBe(200)
    expect(escriturasDelJob()).toEqual([
      expect.objectContaining({ status: 'confirming' }),
      expect.objectContaining({
        status: 'completed', total_imported: 0, total_updated: 1, unsaved_rounds: { errors: [], duplicates: [] },
      }),
    ])
  })

  it('con 0 guardadas lo devuelve a revisión para que el usuario corrija y reintente', async () => {
    job = { id: JOB_ID, user_id: USER_ID, status: 'review_required' }
    vi.mocked(fetchFilasGarminExistentes).mockResolvedValueOnce(new Map())
    vi.mocked(importRound).mockResolvedValueOnce({ success: false, warnings: ['sin cancha'] } as never)
    const res = await confirmar()
    expect(res.status).toBe(200)
    expect(escriturasDelJob()).toEqual([
      expect.objectContaining({ status: 'confirming' }),
      expect.objectContaining({ status: 'review_required' }),
    ])
  })

  it('si no puede marcarlo completado lo devuelve a revisión: el reintento no espera el plazo del reclamo', async () => {
    job = { id: JOB_ID, user_id: USER_ID, status: 'review_required' }
    fallaCompletar = true
    expect((await confirmar()).status).toBe(200)
    expect(escriturasDelJob()).toEqual([
      expect.objectContaining({ status: 'confirming' }),
      expect.objectContaining({ status: 'completed' }),
      expect.objectContaining({ status: 'review_required' }),
    ])
  })

  it('si no puede leer las tarjetas Garmin responde 503 y lo devuelve a revisión', async () => {
    job = { id: JOB_ID, user_id: USER_ID, status: 'review_required' }
    vi.mocked(fetchFilasGarminExistentes).mockRejectedValueOnce(new Error('caída'))
    const res = await confirmar()
    expect(res.status).toBe(503)
    expect(escriturasDelJob()).toEqual([
      expect.objectContaining({ status: 'confirming' }),
      expect.objectContaining({ status: 'review_required' }),
    ])
  })
})

describe('POST /api/import/confirm: reintento mientras el primer confirm sigue guardando', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('espera a que el primero termine y responde lo que guardó, sin guardar de nuevo', async () => {
    job = { id: JOB_ID, user_id: USER_ID, status: 'confirming' }
    jobsSiguientes = [
      { id: JOB_ID, user_id: USER_ID, status: 'confirming' },
      { id: JOB_ID, user_id: USER_ID, status: 'completed', total_imported: 5, total_updated: 0 },
    ]
    reclamos = [false]
    const pendiente = confirmar()
    await vi.advanceTimersByTimeAsync(10_000)
    const res = await pendiente
    expect(res.status).toBe(200)
    expect(leerResultadoConfirmacion(await res.json())).toMatchObject({ importadas: 5 })
    expect(importRound).not.toHaveBeenCalled()
    expect(actualizacionGarmin).not.toHaveBeenCalled()
    expect(escriturasDelJob().every(p => (p as { status: string }).status === 'confirming')).toBe(true)
  })

  it('si el primero lo soltó sin guardar, lo reclama y guarda', async () => {
    job = { id: JOB_ID, user_id: USER_ID, status: 'confirming' }
    reclamos = [false, true]
    const pendiente = confirmar()
    await vi.advanceTimersByTimeAsync(10_000)
    expect((await pendiente).status).toBe(200)
    expect(actualizacionGarmin).toHaveBeenCalledTimes(1)
  })

  it('si el primero no termina dentro de la espera responde 409 sin guardar', async () => {
    job = { id: JOB_ID, user_id: USER_ID, status: 'confirming' }
    reclamos = [false]
    const pendiente = confirmar()
    await vi.advanceTimersByTimeAsync(ESPERA_CONFIRM_EN_CURSO_MS + 10_000)
    const res = await pendiente
    expect(res.status).toBe(409)
    expect(await res.json()).not.toHaveProperty('error')
    expect(importRound).not.toHaveBeenCalled()
    expect(actualizacionGarmin).not.toHaveBeenCalled()
  })
})

describe('POST /api/import/confirm: el reclamo del job', () => {
  afterEach(() => vi.useRealTimers())

  it('no toma un job completado ni uno que otro confirm reclamó hace menos de PLAZO_RECLAMO_CONFIRM_MS', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-31T12:00:00.000Z') })
    job = { id: JOB_ID, user_id: USER_ID, status: 'review_required' }
    await confirmar()
    const reclamo = llamadas.find(l => (l.payload as { status?: string })?.status === 'confirming')
    const vencido = new Date(Date.parse('2026-10-31T12:00:00.000Z') - PLAZO_RECLAMO_CONFIRM_MS).toISOString()
    expect(reclamo?.filtros).toEqual([
      ['eq', 'id', JOB_ID],
      ['eq', 'user_id', USER_ID],
      ['neq', 'status', 'completed'],
      ['or', `status.neq.confirming,updated_at.lt.${vencido}`],
    ])
  })
})

describe('PLAZO_RECLAMO_CONFIRM_MS', () => {
  it('vence después del maxDuration del confirm: nunca le quita el job a uno que sigue guardando', () => {
    expect(PLAZO_RECLAMO_CONFIRM_MS).toBeGreaterThan(maxDuration * 1000)
    expect(ESPERA_CONFIRM_EN_CURSO_MS).toBeLessThan(maxDuration * 1000)
  })
})
