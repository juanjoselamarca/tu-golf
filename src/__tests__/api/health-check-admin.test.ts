/**
 * GET /api/admin/health-check — la ruta solo verifica admin; las 6 categorías viven en
 * `src/lib/data/health-check-admin/` (refactor «el que toca, ordena», 26-nov-2026).
 *
 * Fija lo que el refactor no puede perder: 403 sin admin, las 6 categorías en su orden,
 * los 25 checks, y que una base que no contesta se vea como FAIL (nunca como 500 ni como PASS).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const esAdmin = { valor: true }
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) } })),
}))
vi.mock('@/lib/admin', () => ({ isAdmin: vi.fn(async () => esAdmin.valor) }))

/** Cliente cuyo cada acceso a la base revienta (base caída o colgada). */
const clienteQueRevienta = () => {
  const boom = () => { throw new Error('base caída') }
  return { from: boom, rpc: boom, auth: { admin: { listUsers: boom } } } as unknown as SupabaseClient
}

/** Cliente sano y vacío: toda consulta encadenable responde sin filas ni error. */
const clienteVacio = () => {
  const respuesta = { data: [], count: 0, error: null }
  const cadena: unknown = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then'
      ? (ok: (v: unknown) => unknown) => Promise.resolve(respuesta).then(ok)
      : () => cadena),
    apply: () => cadena,
  })
  return cadena as SupabaseClient
}

const admin = { cliente: clienteQueRevienta() }
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: vi.fn(() => admin.cliente) }))

import { GET } from '@/app/api/admin/health-check/route'
import { correrHealthCheckAdmin } from '@/lib/data/health-check-admin'
import { resumirChecks } from '@/lib/data/health-check-admin/base'

const CATEGORIAS = [
  'Servicios',
  'Integridad de datos',
  'Integridad de rutas y roles',
  'Políticas RLS',
  'Validación de flujos',
  'Anti-regresión P0',
]

/** Los checks sin base (ESPN, clave de Claude, deploy) no dependen del cliente: se fijan aquí. */
const SIN_BASE = ['ESPN API', 'Claude API key', 'Vercel deploy info']

beforeEach(() => {
  // Sin red en los tests: ESPN contesta 503 (check en warn, sin salir a internet).
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
  esAdmin.valor = true
  admin.cliente = clienteQueRevienta()
})

describe('GET /api/admin/health-check', () => {
  it('sin admin responde 403 y no toca la base', async () => {
    esAdmin.valor = false
    const { createAdminClient } = await import('@/lib/supabaseAdmin')
    vi.mocked(createAdminClient).mockClear()
    const res = await GET()
    expect(res.status).toBe(403)
    expect(createAdminClient).not.toHaveBeenCalled()
  })

  it('con admin devuelve las 6 categorías en orden y el resumen cuadra', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.categories.map((c: { name: string }) => c.name)).toEqual(CATEGORIAS)
    const checks = body.categories.flatMap((c: { checks: unknown[] }) => c.checks)
    expect(body.summary.total).toBe(checks.length)
    expect(body.summary.passed + body.summary.warnings + body.summary.failed).toBe(body.summary.total)
    expect(typeof body.timestamp).toBe('string')
  })
})

describe('correrHealthCheckAdmin', () => {
  it('con la base caída cada check que la consulta sale FAIL (ninguno PASS) y no lanza', async () => {
    const r = await correrHealthCheckAdmin(clienteQueRevienta())
    expect(r.categories.map(c => c.name)).toEqual(CATEGORIAS)
    expect(r.summary.total).toBe(25)
    const deLaBase = r.categories.flatMap(c => c.checks).filter(k => !SIN_BASE.includes(k.name))
    expect(deLaBase).toHaveLength(22)
    expect(deLaBase.filter(k => k.status !== 'fail').map(k => k.name)).toEqual([])
  })

  it('con la base sana y vacía corre los 25 checks sin lanzar', async () => {
    const r = await correrHealthCheckAdmin(clienteVacio())
    expect(r.categories.map(c => c.name)).toEqual(CATEGORIAS)
    expect(r.summary.total).toBe(25)
  })
})

describe('resumirChecks', () => {
  it('cuenta pass, warn y fail de todas las categorías', () => {
    expect(resumirChecks([
      { name: 'a', checks: [{ name: '1', status: 'pass', message: '' }, { name: '2', status: 'warn', message: '' }] },
      { name: 'b', checks: [{ name: '3', status: 'fail', message: '' }, { name: '4', status: 'pass', message: '' }] },
    ])).toEqual({ total: 4, passed: 2, warnings: 1, failed: 1 })
    expect(resumirChecks([])).toEqual({ total: 0, passed: 0, warnings: 0, failed: 0 })
  })
})
