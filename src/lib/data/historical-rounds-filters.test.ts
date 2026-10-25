import { describe, it, expect } from 'vitest'
import { masRecientePrimero } from './historical-rounds-filters'

function recorder() {
  const orders: Array<[string, { ascending: boolean }]> = []
  const q = { order(c: string, o: { ascending: boolean }) { orders.push([c, o]); return q } }
  return { q, orders }
}

describe('masRecientePrimero', () => {
  // 25-oct: played_at es DATE; con dos rondas el mismo día la intro del coach tomaba la
  // equivocada ("jugaste 44") mientras /coach mostraba la de 37, cargada después.
  it('ordena por fecha y desempata por la ronda cargada última', () => {
    const { q, orders } = recorder()
    expect(masRecientePrimero(q)).toBe(q)
    expect(orders).toEqual([
      ['played_at', { ascending: false }],
      ['created_at', { ascending: false }],
    ])
  })
})
