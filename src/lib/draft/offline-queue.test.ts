// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { load, loadInvalid, persist, persistInvalid, clear } from './offline-queue'

beforeEach(() => window.localStorage.clear())

describe('offline-queue — datos corruptos nunca dejan el borrador inabrible', () => {
  it('load descarta entradas que no son objeto plano con partial objeto', () => {
    window.localStorage.setItem(
      'draft:d1:queue',
      JSON.stringify([
        { partial: { name: 'ok' }, source: 'manual', timestamp: 1 },
        null,
        'basura',
        [1, 2],
        { partial: 'no-objeto', source: 'manual', timestamp: 2 },
        { partial: [], source: 'manual', timestamp: 3 },
        { partial: { name: 'sin source' }, timestamp: 4 },
      ]),
    )
    expect(load('d1')).toEqual([{ partial: { name: 'ok' }, source: 'manual', timestamp: 1 }])
  })

  it('loadInvalid descarta lo que no es objeto plano y load tolera JSON roto', () => {
    window.localStorage.setItem('draft:d1:invalid', JSON.stringify([{ partial: { name: '' }, timestamp: 1 }, 7, { partial: null, timestamp: 2 }]))
    expect(loadInvalid('d1')).toEqual([{ partial: { name: '' }, timestamp: 1 }])
    window.localStorage.setItem('draft:d1:queue', '{no es json')
    expect(load('d1')).toEqual([])
  })

  it('persist/persistInvalid escriben y clear borra las dos keys', () => {
    persist('d1', [{ partial: { name: 'a' }, source: 'manual', timestamp: 1 }])
    persistInvalid('d1', [{ partial: { name: '' }, timestamp: 2 }])
    expect(load('d1')).toHaveLength(1)
    expect(loadInvalid('d1')).toHaveLength(1)
    clear('d1')
    expect(window.localStorage.getItem('draft:d1:queue')).toBeNull()
    expect(window.localStorage.getItem('draft:d1:invalid')).toBeNull()
  })
})
