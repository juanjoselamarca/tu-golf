/**
 * watchersToRemove — qué seguidores se retiran tras un envío (review #449 M1).
 */
import { describe, it, expect } from 'vitest'
import { watchersToRemove, type WatcherSubscriptionRow } from './watchers'

const row = (id: string, user_id: string | null): WatcherSubscriptionRow =>
  ({ id, user_id, endpoint: `https://push/${id}`, p256dh: 'p', auth: 'a' })
const ep = (id: string) => `https://push/${id}`

describe('watchersToRemove — ronda en curso', () => {
  it('un usuario con TODAS sus suscripciones muertas pierde el watcher (antes quedaba huérfano para siempre)', () => {
    const rows = [row('s1', 'u1'), row('s2', 'u1')]
    const out = watchersToRemove(rows, { deliveredEndpoints: [], staleEndpoints: [ep('s1'), ep('s2')] }, { finished: false })
    expect(out.userIds).toEqual(['u1'])
    expect(out.subscriptionIds).toEqual([])
  })

  it('un usuario con una suscripción muerta y otra viva sigue (la viva recibe)', () => {
    const rows = [row('s1', 'u1'), row('s2', 'u1')]
    const out = watchersToRemove(rows, { deliveredEndpoints: [ep('s2')], staleEndpoints: [ep('s1')] }, { finished: false })
    expect(out.userIds).toEqual([])
  })

  it('un fallo transitorio no retira a nadie', () => {
    const rows = [row('s1', 'u1'), row('s2', null)]
    const out = watchersToRemove(rows, { deliveredEndpoints: [], staleEndpoints: [] }, { finished: false })
    expect(out).toEqual({ subscriptionIds: [], userIds: [] })
  })

  it('un dispositivo anónimo muerto no se lista: su watcher cae en cascada con la suscripción', () => {
    const rows = [row('s1', null)]
    const out = watchersToRemove(rows, { deliveredEndpoints: [], staleEndpoints: [ep('s1')] }, { finished: false })
    expect(out).toEqual({ subscriptionIds: [], userIds: [] })
  })
})

describe('watchersToRemove — resultado final', () => {
  it('quien recibió (o está muerto) se retira; el fallo transitorio queda para el reintento', () => {
    const rows = [row('s1', null), row('s2', null), row('s3', null)]
    const out = watchersToRemove(rows, { deliveredEndpoints: [ep('s1')], staleEndpoints: [ep('s2')] }, { finished: true })
    expect(out.subscriptionIds).toEqual(['s1', 's2'])
    expect(out.userIds).toEqual([])
  })

  it('por usuario: basta que UN dispositivo suyo haya recibido el resultado', () => {
    const rows = [row('s1', 'u1'), row('s2', 'u1')]
    const out = watchersToRemove(rows, { deliveredEndpoints: [ep('s1')], staleEndpoints: [] }, { finished: true })
    expect(out.userIds).toEqual(['u1'])
  })

  it('por usuario: un dispositivo muerto y otro con fallo transitorio → sigue (el reintento lo alcanza)', () => {
    const rows = [row('s1', 'u1'), row('s2', 'u1')]
    const out = watchersToRemove(rows, { deliveredEndpoints: [], staleEndpoints: [ep('s1')] }, { finished: true })
    expect(out.userIds).toEqual([])
  })
})
