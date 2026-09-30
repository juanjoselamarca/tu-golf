import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { upsertPushSubscription, findOwnedSubscription, rotatePushSubscription, secretsMatch, SubscriptionOwnershipError } from './subscriptions'
import { addWatcher, MAX_WATCHERS_PER_ROUND, WatcherLimitError } from './watchers'
import { createFakeAdmin, filterValue, opsOf, type FakeOp } from './__tests__/fake-admin'

const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'BPUBLICKEYPUBLICKEY', auth: 'AUTHSECRET123' } }

/** Admin client falso: `existing` es la fila que devuelve la lectura por endpoint. */
function fakeAdmin(existing: { id: string; auth: string; user_id?: string | null } | null) {
  const upsert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: existing?.id ?? 'new-id' }, error: null }) }) }))
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing }) }) }),
      upsert,
    }),
  }
  return { admin: admin as unknown as SupabaseClient, upsert }
}

describe('upsertPushSubscription — prueba de posesión (review I1)', () => {
  it('endpoint nuevo → escribe', async () => {
    const { admin, upsert } = fakeAdmin(null)
    await expect(upsertPushSubscription(admin, { subscription: SUB })).resolves.toEqual({ id: 'new-id' })
    expect(upsert).toHaveBeenCalledTimes(1)
  })

  it('endpoint existente con el MISMO auth → escribe (puede reasignar user_id: el dispositivo es el mismo)', async () => {
    const { admin, upsert } = fakeAdmin({ id: 'sub-1', auth: SUB.keys.auth })
    await expect(upsertPushSubscription(admin, { subscription: SUB, userId: 'u-9' })).resolves.toEqual({ id: 'sub-1' })
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'u-9' }), { onConflict: 'endpoint' })
  })

  it('endpoint existente con OTRO auth → SubscriptionOwnershipError sin escribir', async () => {
    const { admin, upsert } = fakeAdmin({ id: 'sub-1', auth: 'OTRO-SECRETO' })
    await expect(upsertPushSubscription(admin, { subscription: SUB, userId: 'u-9' })).rejects.toBeInstanceOf(SubscriptionOwnershipError)
    expect(upsert).not.toHaveBeenCalled()
  })
})

describe('findOwnedSubscription', () => {
  it('sólo devuelve la fila si el auth coincide', async () => {
    const { admin } = fakeAdmin({ id: 'sub-1', auth: SUB.keys.auth, user_id: null })
    await expect(findOwnedSubscription(admin, SUB.endpoint, SUB.keys.auth)).resolves.toEqual({ id: 'sub-1', user_id: null })
    await expect(findOwnedSubscription(admin, SUB.endpoint, 'WRONG')).resolves.toBeNull()
  })
})

describe('rotatePushSubscription — pushsubscriptionchange conserva la identidad (watchers)', () => {
  const NEXT = { endpoint: 'https://fcm.googleapis.com/fcm/send/NUEVO', keys: { p256dh: 'BNEWKEYNEWKEYNEWKEY', auth: 'NEWAUTHSECRET' } }

  function fakeAdminForRotate(existing: { id: string; auth: string; user_id?: string | null } | null, clash: { id: string; auth: string } | null = null) {
    const update = vi.fn(() => ({ eq: async () => ({ error: null }) }))
    const del = vi.fn()
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({
          maybeSingle: async () => ({ data: existing }),
          neq: () => ({ maybeSingle: async () => ({ data: clash }) }),
        }) }),
        update,
        delete: del,
      }),
    }
    return { admin: admin as unknown as SupabaseClient, update, del }
  }

  it('con la prueba de posesión de la vieja, actualiza la MISMA fila (mismo id) con endpoint/keys nuevos', async () => {
    const { admin, update } = fakeAdminForRotate({ id: 'sub-1', auth: SUB.keys.auth, user_id: null })
    await expect(rotatePushSubscription(admin, { endpoint: SUB.endpoint, auth: SUB.keys.auth }, NEXT)).resolves.toEqual({ id: 'sub-1' })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ endpoint: NEXT.endpoint, p256dh: NEXT.keys.p256dh, auth: NEXT.keys.auth }))
  })

  it('con auth ajeno → null y no escribe', async () => {
    const { admin, update } = fakeAdminForRotate({ id: 'sub-1', auth: 'OTRO' })
    await expect(rotatePushSubscription(admin, { endpoint: SUB.endpoint, auth: SUB.keys.auth }, NEXT)).resolves.toBeNull()
    expect(update).not.toHaveBeenCalled()
  })

  it('el endpoint nuevo ya es de OTRA fila → SubscriptionOwnershipError (409), sin borrar ni escribir', async () => {
    const { admin, update, del } = fakeAdminForRotate({ id: 'sub-1', auth: SUB.keys.auth }, { id: 'sub-2', auth: 'DE-OTRO-DISPOSITIVO' })
    await expect(rotatePushSubscription(admin, { endpoint: SUB.endpoint, auth: SUB.keys.auth }, NEXT)).rejects.toBeInstanceOf(SubscriptionOwnershipError)
    expect(update).not.toHaveBeenCalled()
    expect(del).not.toHaveBeenCalled()
  })

  it('vieja inexistente → null', async () => {
    const { admin } = fakeAdminForRotate(null)
    await expect(rotatePushSubscription(admin, { endpoint: SUB.endpoint, auth: SUB.keys.auth }, NEXT)).resolves.toBeNull()
  })
})

describe('secretsMatch', () => {
  it('compara en tiempo constante y no rompe con largos distintos', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true)
    expect(secretsMatch('abc', 'abd')).toBe(false)
    expect(secretsMatch('abc', 'abcd')).toBe(false)
    expect(secretsMatch('', '')).toBe(true)
  })
})

describe('addWatcher — tope de seguidores por ronda (review C3)', () => {
  function fakeAdminForWatchers(opts: { already: boolean; count: number }) {
    const upsert = vi.fn(async () => ({ error: null }))
    const admin = {
      from: () => ({
        select: (_cols: string, o?: { count?: string; head?: boolean }) => ({
          eq: () => o?.count
            ? Promise.resolve({ count: opts.count })
            : ({ eq: () => ({ maybeSingle: async () => ({ data: opts.already ? { id: 'w1' } : null }) }) }),
        }),
        upsert,
      }),
    }
    return { admin: admin as unknown as SupabaseClient, upsert }
  }

  it('con la ronda llena, un seguidor nuevo recibe WatcherLimitError', async () => {
    const { admin, upsert } = fakeAdminForWatchers({ already: false, count: MAX_WATCHERS_PER_ROUND })
    await expect(addWatcher(admin, 'ABC', { kind: 'device', subscriptionId: 's' })).rejects.toBeInstanceOf(WatcherLimitError)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('re-seguir no cuenta contra el tope', async () => {
    const { admin, upsert } = fakeAdminForWatchers({ already: true, count: MAX_WATCHERS_PER_ROUND })
    await expect(addWatcher(admin, 'ABC', { kind: 'user', userId: 'u' })).resolves.toBeUndefined()
    expect(upsert).toHaveBeenCalledWith({ user_id: 'u', ronda_codigo: 'ABC' }, { onConflict: 'user_id,ronda_codigo' })
  })

  it('con cupo, escribe por dispositivo', async () => {
    const { admin, upsert } = fakeAdminForWatchers({ already: false, count: 3 })
    await addWatcher(admin, 'ABC', { kind: 'device', subscriptionId: 's' })
    expect(upsert).toHaveBeenCalledWith({ push_subscription_id: 's', ronda_codigo: 'ABC' }, { onConflict: 'push_subscription_id,ronda_codigo' })
  })
})

describe('rotatePushSubscription — el endpoint nuevo ya es de ESTE dispositivo: se fusiona (review #449 M3)', () => {
  const NEXT = { endpoint: 'https://fcm.googleapis.com/fcm/send/NUEVO', keys: { p256dh: 'BNEWKEYNEWKEYNEWKEY', auth: 'NEWAUTHSECRET' } }
  const OLD = { endpoint: SUB.endpoint, auth: SUB.keys.auth }

  function adminForMerge(opts: { clashAuth: string; clashUserId?: string | null; ownedUserId?: string | null; clashFollows?: string[] }) {
    return createFakeAdmin((op: FakeOp) => {
      if (op.table === 'push_subscriptions' && op.verb === 'select') {
        const byEndpoint = filterValue(op, 'endpoint')
        if (byEndpoint === SUB.endpoint) return { data: { id: 'sub-1', auth: SUB.keys.auth, user_id: opts.ownedUserId ?? null } }
        if (byEndpoint === NEXT.endpoint) return { data: { id: 'sub-2', auth: opts.clashAuth, user_id: opts.clashUserId ?? null } }
      }
      if (op.table === 'round_watchers' && op.verb === 'select') {
        return { data: (opts.clashFollows ?? []).map(ronda_codigo => ({ ronda_codigo })) }
      }
      return undefined
    })
  }

  it('mismo auth → los watchers de la vieja pasan a la fila nueva, la vieja se borra y sobrevive el id nuevo', async () => {
    const { admin, ops } = adminForMerge({ clashAuth: NEXT.keys.auth, ownedUserId: 'u1', clashUserId: null, clashFollows: ['R1'] })
    await expect(rotatePushSubscription(admin, OLD, NEXT)).resolves.toEqual({ id: 'sub-2' })

    // Las rondas que la nueva ya sigue se descartan de la vieja (único por suscripción+ronda).
    const dedupe = opsOf(ops, 'round_watchers', 'delete')
    expect(dedupe).toHaveLength(1)
    expect(filterValue(dedupe[0], 'push_subscription_id')).toBe('sub-1')
    expect(filterValue(dedupe[0], 'ronda_codigo')).toEqual(['R1'])

    // El resto se mueve a la fila que sobrevive.
    const move = opsOf(ops, 'round_watchers', 'update')
    expect(move).toHaveLength(1)
    expect(move[0].payload).toEqual({ push_subscription_id: 'sub-2' })
    expect(filterValue(move[0], 'push_subscription_id')).toBe('sub-1')

    // La sobreviviente recibe las claves nuevas y hereda el usuario de la vieja.
    const keys = opsOf(ops, 'push_subscriptions', 'update')
    expect(keys).toHaveLength(1)
    expect(filterValue(keys[0], 'id')).toBe('sub-2')
    expect(keys[0].payload).toMatchObject({ p256dh: NEXT.keys.p256dh, auth: NEXT.keys.auth, user_id: 'u1' })

    // La vieja desaparece (sus watchers ya no están: se movieron).
    const drop = opsOf(ops, 'push_subscriptions', 'delete')
    expect(drop).toHaveLength(1)
    expect(filterValue(drop[0], 'id')).toBe('sub-1')
  })

  it('sin rondas repetidas no borra watchers, sólo los mueve; no pisa el usuario de la nueva', async () => {
    const { admin, ops } = adminForMerge({ clashAuth: NEXT.keys.auth, ownedUserId: 'u1', clashUserId: 'u2', clashFollows: [] })
    await expect(rotatePushSubscription(admin, OLD, NEXT)).resolves.toEqual({ id: 'sub-2' })
    expect(opsOf(ops, 'round_watchers', 'delete')).toHaveLength(0)
    expect(opsOf(ops, 'round_watchers', 'update')).toHaveLength(1)
    expect(opsOf(ops, 'push_subscriptions', 'update')[0].payload).not.toHaveProperty('user_id')
  })

  it('OTRO auth → sigue siendo conflicto (409): no se mueve ni se borra nada', async () => {
    const { admin, ops } = adminForMerge({ clashAuth: 'DE-OTRO-TELEFONO' })
    await expect(rotatePushSubscription(admin, OLD, NEXT)).rejects.toBeInstanceOf(SubscriptionOwnershipError)
    expect(opsOf(ops, 'round_watchers', 'update')).toHaveLength(0)
    expect(opsOf(ops, 'round_watchers', 'delete')).toHaveLength(0)
    expect(opsOf(ops, 'push_subscriptions', 'delete')).toHaveLength(0)
    expect(opsOf(ops, 'push_subscriptions', 'update')).toHaveLength(0)
  })
})
