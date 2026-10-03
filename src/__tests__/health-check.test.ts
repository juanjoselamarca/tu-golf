import { describe, it, expect, beforeEach, vi } from 'vitest'
import { saludDeLaBase, _resetSaludCache, HEALTH_TTL_MS } from '@/lib/health-check'

describe('saludDeLaBase — caché para no martillar la base (incidente 02-oct-2026)', () => {
  beforeEach(() => _resetSaludCache())

  it('N chequeos dentro del TTL → 1 sola consulta a la base', async () => {
    const consultar = vi.fn(async () => true)
    let t = 1_000
    const ahora = () => t
    const r1 = await saludDeLaBase(consultar, ahora)
    t += 10_000
    const r2 = await saludDeLaBase(consultar, ahora)
    t += 40_000
    const r3 = await saludDeLaBase(consultar, ahora)
    expect(consultar).toHaveBeenCalledTimes(1)
    expect(r1).toMatchObject({ ok: true, cached: false })
    expect([r2.cached, r3.cached]).toEqual([true, true])
  })

  it('vencido el TTL vuelve a consultar', async () => {
    const consultar = vi.fn(async () => true)
    let t = 0
    await saludDeLaBase(consultar, () => t)
    t += HEALTH_TTL_MS
    await saludDeLaBase(consultar, () => t)
    expect(consultar).toHaveBeenCalledTimes(2)
  })

  it('una consulta que lanza = base caída (no revienta el endpoint) y también se cachea', async () => {
    const consultar = vi.fn(async () => { throw new Error('timeout') })
    const r = await saludDeLaBase(consultar, () => 0)
    expect(r.ok).toBe(false)
    const r2 = await saludDeLaBase(consultar, () => 5_000)
    expect(r2).toMatchObject({ ok: false, cached: true })
    expect(consultar).toHaveBeenCalledTimes(1)
  })

  it('base colgada: llamadas concurrentes comparten UNA consulta en vuelo', async () => {
    let soltar: (v: boolean) => void = () => {}
    const consultar = vi.fn(() => new Promise<boolean>(r => { soltar = r }))
    const a = saludDeLaBase(consultar, () => 0)
    const b = saludDeLaBase(consultar, () => 0)
    const c = saludDeLaBase(consultar, () => 0)
    soltar(false)
    const [ra, rb, rc] = await Promise.all([a, b, c])
    expect(consultar).toHaveBeenCalledTimes(1)
    expect([ra.ok, rb.ok, rc.ok]).toEqual([false, false, false])
    expect([ra.cached, rb.cached, rc.cached]).toEqual([false, true, true])
  })
})
