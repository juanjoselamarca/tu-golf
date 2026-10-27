import { describe, it, expect, vi, beforeEach } from 'vitest'

const leer = vi.fn()
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/data/tarjeta-nombre-publico', () => ({
  leerNombreDelDueñoDeTarjetaPublica: (...a: unknown[]) => leer(...a),
}))

import { GET } from './route'

const llamar = () => GET(new Request('http://x/api/tarjeta/r1/jugador'), { params: Promise.resolve({ id: 'r1' }) })

beforeEach(() => leer.mockReset())

describe('GET /api/tarjeta/[id]/jugador', () => {
  it('responde SOLO { nombre } y se cachea en la CDN', async () => {
    leer.mockResolvedValue({ nombre: 'Juanjo' })
    const res = await llamar()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ nombre: 'Juanjo' })
    expect(res.headers.get('Cache-Control')).toContain('s-maxage')
    expect(leer).toHaveBeenCalledWith(expect.anything(), 'r1')
  })

  it('ronda privada o inexistente → { nombre: null } (respuesta firme, cacheable)', async () => {
    leer.mockResolvedValue({ nombre: null })
    const res = await llamar()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ nombre: null })
  })

  it('error de la base → 503 sin caché (no deja la tarjeta sin nombre por minutos)', async () => {
    leer.mockResolvedValue({ error: true })
    const res = await llamar()
    expect(res.status).toBe(503)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})
