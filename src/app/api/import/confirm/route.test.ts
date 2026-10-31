import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'
import { leerResultadoConfirmacion } from '@/hooks/useConfirmarImportacion'
import { actualizacionGarmin } from '@/lib/data/import-garmin'
import { importRound } from '@/lib/import-round'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '33333333-3333-4333-8333-333333333333'

type Llamada = { tabla: string; op: string; payload?: unknown }
let llamadas: Llamada[] = []
let job: Record<string, unknown> = {}

/** Builder encadenable y "thenable" como el de PostgREST que registra cada escritura. */
function builder(tabla: string) {
  let op = 'select'
  const resultado = () => {
    if (tabla === 'import_jobs' && op === 'select') return { data: job, error: null }
    if (tabla === 'historical_rounds' && op === 'update') return { data: [{ id: 'ronda-garmin' }], error: null }
    if (tabla === 'historical_rounds' && op === 'select') return { data: [], error: null, count: 0 }
    return { data: null, error: null }
  }
  const b: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'order', 'limit']) b[m] = vi.fn(() => b)
  for (const m of ['insert', 'update', 'delete']) {
    b[m] = vi.fn((p?: unknown) => {
      op = m
      llamadas.push({ tabla, op: m, payload: p })
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

import { POST } from './route'

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

beforeEach(() => {
  llamadas = []
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
  it('guarda las re-escritas en total_updated, aparte de las nuevas, y lo que no se guardó', async () => {
    job = { id: JOB_ID, user_id: USER_ID, status: 'review_required' }
    const res = await confirmar()
    expect(res.status).toBe(200)
    const cierre = llamadas.find(l => l.tabla === 'import_jobs' && l.op === 'update')
    expect(cierre?.payload).toMatchObject({
      status: 'completed', total_imported: 0, total_updated: 1, unsaved_rounds: { errors: [], duplicates: [] },
    })
  })
})
