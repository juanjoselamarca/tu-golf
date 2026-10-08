/**
 * GET /api/ronda-libre/[codigo]/hcp — el course handicap de jugadores con cuenta
 * (del que se despeja el índice) sólo para visores con sesión (decisión de Juanjo,
 * 08-oct-2026). Privada, no-store, nunca al CDN.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fakeSupabase } from '../gwi-server/fake-supabase'

let cliente: ReturnType<typeof fakeSupabase>
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn(async () => cliente) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/golf/core/course-handicap', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/golf/core/course-handicap')>()
  return { ...real, resolverCourseData: vi.fn(async () => null) }
})

import { GET } from '@/app/api/ronda-libre/[codigo]/hcp/route'

const RONDA = {
  id: 'r1', codigo: 'ABC123', course_name: 'X', course_id: null, tees: 'azul', holes: 18, hoyo_inicio: 1,
  fecha: '2026-10-08', estado: 'en_curso', modo_juego: 'neto', formato_juego: 'stroke_play', admin_mode: false,
  admin_user_id: null, creador_id: 'u1', recorridos: null,
  ronda_libre_jugadores: [{ id: 'j1', nombre: 'Ana', user_id: 'u1', scores: {}, handicap: null, tees: null }],
}
const pedir = (codigo = 'ABC123') => GET(new Request(`http://localhost/api/ronda-libre/${codigo}/hcp`), { params: Promise.resolve({ codigo }) })

beforeEach(() => { vi.clearAllMocks() })

describe('GET /api/ronda-libre/[codigo]/hcp', () => {
  it('anónimo → 401 sin leer la ronda ni perfiles', async () => {
    cliente = fakeSupabase({ rondas_libres: RONDA, profiles: [{ id: 'u1', indice: 9.6 }] }, null)
    const res = await pedir()
    expect(res.status).toBe(401)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(cliente.consultas).toEqual([])
  })

  it('con sesión → course handicap con el índice de perfil, privado y no-store', async () => {
    cliente = fakeSupabase({ rondas_libres: RONDA, profiles: [{ id: 'u1', indice: 9.6 }] }, 'u-visor')
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const json = await res.json()
    expect(Object.keys(json).sort()).toEqual(['courseHcpMap', 'displayHcpMap', 'sinIndice'])
    expect(json.courseHcpMap.j1).toBe(10)
    expect(json.sinIndice).toEqual([])
  })
})
