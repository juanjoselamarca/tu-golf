import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const cat = (name: string, statuses: Array<'pass' | 'warn' | 'fail'>) => ({
  name,
  checks: statuses.map((status, i) => ({ name: `${name}-${i}`, status, message: '' })),
})

vi.mock('../servicios', () => ({ checkServices: vi.fn(async () => cat('Servicios', ['pass', 'pass'])) }))
vi.mock('../integridad-datos', () => ({ checkDataIntegrity: vi.fn(async () => cat('Datos', ['pass', 'warn'])) }))
vi.mock('../rutas-y-roles', () => ({ checkRouteAndRoleIntegrity: vi.fn(async () => cat('Rutas', ['fail'])) }))
vi.mock('../politicas-rls', () => ({ checkRLSPolicies: vi.fn(async () => cat('RLS', ['pass'])) }))
vi.mock('../flujos', () => ({ checkFlows: vi.fn(async () => cat('Flujos', [])) }))
vi.mock('../anti-regresion-p0', () => ({ checkAntiRegresionP0: vi.fn(async () => cat('P0', ['warn', 'pass'])) }))

import { correrHealthCheckAdmin } from '../index'
import { safeCheck } from '../tipos'

describe('correrHealthCheckAdmin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('corre las 6 categorías en orden y cuenta pass/warn/fail', async () => {
    const r = await correrHealthCheckAdmin({} as SupabaseClient)
    expect(r.categories.map(c => c.name)).toEqual(['Servicios', 'Datos', 'Rutas', 'RLS', 'Flujos', 'P0'])
    expect(r.summary).toEqual({ total: 8, passed: 5, warnings: 2, failed: 1 })
    expect(typeof r.duration_ms).toBe('number')
    expect(Number.isNaN(Date.parse(r.timestamp))).toBe(false)
  })
})

describe('safeCheck', () => {
  it('convierte una excepción en un check fail con el mensaje', async () => {
    const c = await safeCheck('x', async () => { throw new Error('boom') })
    expect(c).toEqual({ name: 'x', status: 'fail', message: 'boom' })
  })
})
