import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import type { NextRequest } from 'next/server'

// Transferir un borrador: cuerpo inválido → 400 sin tocar la base; si el UPDATE de owner_id
// falla o no toca filas (RLS, trigger), la ruta lo dice en vez de responder ok:true.

const OWNER = '11111111-1111-4111-8111-111111111111'
const NUEVO = '33333333-3333-4333-8333-333333333333'
const DRAFT = '22222222-2222-4222-8222-222222222222'

let resultadoUpdate: { data: unknown; error: unknown }
const updates: Array<{ tabla: string; valores: unknown; filtros: unknown[][] }> = []
const from = vi.fn((tabla: string) => {
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.eq = () => q
  q.single = async () =>
    tabla === 'tournament_drafts' ? { data: { owner_id: OWNER } } : { data: { role: 'collaborator' } }
  q.update = (valores: unknown) => {
    const filtros: unknown[][] = []
    updates.push({ tabla, valores, filtros })
    const u: Record<string, unknown> = {}
    u.eq = (...a: unknown[]) => {
      filtros.push(a)
      return u
    }
    u.select = async () => resultadoUpdate
    return u
  }
  return q
})

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: OWNER } } }) },
    from: (t: string) => from(t),
  }),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { POST } from './route'

const ctx = { params: Promise.resolve({ id: DRAFT }) }
const pedido = (body: string) =>
  new Request('http://localhost/x', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } }) as unknown as NextRequest

describe('POST /api/torneos/draft/[id]/transfer-ownership', () => {
  beforeEach(() => {
    from.mockClear()
    updates.length = 0
    resultadoUpdate = { data: [{ id: DRAFT }], error: null }
  })

  for (const cuerpo of ['{no es json', 'null', '[]', '"texto"']) {
    it(`con ${cuerpo} → 400 sin tocar la base`, async () => {
      const res = await POST(pedido(cuerpo), ctx)
      expect(res.status).toBe(400)
      expect(from).not.toHaveBeenCalled()
    })
  }

  it('transferirse a sí mismo → 400', async () => {
    const res = await POST(pedido(JSON.stringify({ new_owner_id: OWNER })), ctx)
    expect(res.status).toBe(400)
    expect(updates).toHaveLength(0)
  })

  it('caso feliz: solo cambia owner_id (los roles los deja el trigger)', async () => {
    const res = await POST(pedido(JSON.stringify({ new_owner_id: NUEVO })), ctx)
    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
    expect(updates[0].tabla).toBe('tournament_drafts')
    expect(updates[0].valores).toEqual({ owner_id: NUEVO })
    // El UPDATE va acotado al borrador Y a que quien llama siga siendo el dueño (carrera con otra transferencia).
    expect(updates[0].filtros).toEqual(expect.arrayContaining([['id', DRAFT], ['owner_id', OWNER]]))
  })

  it('UPDATE con error → 500, no ok:true', async () => {
    resultadoUpdate = { data: null, error: { message: 'FORBIDDEN', code: '42501' } }
    const res = await POST(pedido(JSON.stringify({ new_owner_id: NUEVO })), ctx)
    expect(res.status).toBe(500)
  })

  it('UPDATE que no toca filas → 500, no ok:true', async () => {
    resultadoUpdate = { data: [], error: null }
    const res = await POST(pedido(JSON.stringify({ new_owner_id: NUEVO })), ctx)
    expect(res.status).toBe(500)
  })
})

describe('migración: solo el dueño cambia owner_id de un borrador', () => {
  const sql = readFileSync('supabase/migrations/20261026000000_tournament_drafts_owner_solo_lo_cambia_el_dueno.sql', 'utf8')

  it('el trigger corre antes de cada UPDATE de owner_id', () => {
    expect(sql).toMatch(/BEFORE UPDATE OF owner_id ON public\.tournament_drafts/)
  })

  it('rechaza a quien no es el dueño actual y exige que el nuevo sea colaborador', () => {
    expect(sql).toMatch(/v_uid IS DISTINCT FROM OLD\.owner_id/)
    expect(sql).toMatch(/WHERE draft_id = NEW\.id AND user_id = NEW\.owner_id/)
  })

  it('antes del trigger, cada dueño tiene su fila de colaborador (si no, no podría transferir)', () => {
    const backfill = sql.indexOf("SELECT d.id, d.owner_id, 'owner', d.owner_id")
    expect(backfill).toBeGreaterThan(-1)
    expect(backfill).toBeLessThan(sql.indexOf('CREATE TRIGGER'))
  })

  it('deja los roles en la misma transacción', () => {
    expect(sql).toMatch(/SET role = 'collaborator'[\s\S]*user_id = OLD\.owner_id/)
    expect(sql).toMatch(/ON CONFLICT \(draft_id, user_id\) DO UPDATE SET role = 'owner'/)
  })
})
