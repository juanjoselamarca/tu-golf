import { describe, it, expect } from 'vitest'
import { OR_EXCLUDE_FEDEGOLF, masRecientePrimero, rondasDelCoach } from './historical-rounds-filters'

function recorder() {
  const orders: Array<[string, { ascending: boolean; nullsFirst?: boolean }]> = []
  const ors: string[] = []
  const q = {
    order(c: string, o: { ascending: boolean; nullsFirst?: boolean }) { orders.push([c, o]); return q },
    or(filtros: string) { ors.push(filtros); return q },
  }
  return { q, orders, ors }
}

describe('masRecientePrimero', () => {
  // 25-oct: played_at es DATE; con dos rondas el mismo día la intro del coach tomaba la
  // equivocada ("jugaste 44") mientras /coach mostraba la de 37, cargada después.
  it('ordena por fecha y desempata por la ronda cargada última', () => {
    const { q, orders } = recorder()
    expect(masRecientePrimero(q)).toBe(q)
    expect(orders).toEqual([
      ['played_at', { ascending: false }],
      ['created_at', { ascending: false, nullsFirst: false }],
    ])
  })
})

describe('rondasDelCoach', () => {
  // El par filtro+orden vivía repetido en los cuatro caminos del coach y en dos venía
  // solo el orden: /coach traía las últimas 10 rondas CON las tarjetas FedeGolf, que no
  // tienen hoyo-a-hoyo, y ocupaban lugar entre las 5 que mide el Costo Psicológico.
  it('excluye las tarjetas FedeGolf y ordena la más reciente primero', () => {
    const { q, orders, ors } = recorder()
    expect(rondasDelCoach(q)).toBe(q)
    expect(ors).toEqual([OR_EXCLUDE_FEDEGOLF])
    expect(orders).toEqual([
      ['played_at', { ascending: false }],
      ['created_at', { ascending: false, nullsFirst: false }],
    ])
  })
})
