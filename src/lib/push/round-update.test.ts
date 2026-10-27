/**
 * pushRoundUpdate — limpieza de watchers y señal de reintento (review #449 M1).
 */
import { describe, it, expect } from 'vitest'
import { pushRoundUpdate, needsRetry } from './round-update'
import type { RoundPushSnapshot } from './round-snapshot'
import type { PushSender } from './deliver'
import { createFakeAdmin, filterValue, opsOf, type FakeOp } from './__tests__/fake-admin'

const CODIGO = 'ABC123'
const EP = 'https://fcm.googleapis.com/fcm/send/dev-1'

function snapshot(estado: 'en_curso' | 'finalizada'): RoundPushSnapshot {
  return {
    codigo: CODIGO, courseName: 'Los Leones', holes: 18, estado,
    // Ana ya terminó 3 hoyos: con cero hoyos terminados el push en curso no sale (shouldNotifySpectators).
    players: [{ nombre: 'Ana', vsPar: 1, holesCompleted: 3, totalHoles: 18 }],
    participants: { creadorId: 'u9', adminUserId: null, playerUserIds: [], playerIds: ['j1'] },
  }
}

/** Un usuario u1 sigue la ronda con un solo dispositivo (endpoint EP). */
function adminWithOneUserWatcher() {
  return createFakeAdmin((op: FakeOp) => {
    if (op.table === 'round_watchers' && op.verb === 'select') return { data: [{ user_id: 'u1', push_subscription_id: null }] }
    if (op.table === 'push_subscriptions' && op.verb === 'select') {
      return { data: [{ id: 's1', user_id: 'u1', endpoint: EP, p256dh: 'p', auth: 'a' }] }
    }
    return undefined
  })
}

const gone: PushSender = async () => { throw Object.assign(new Error('Gone'), { statusCode: 410 }) }
const transient: PushSender = async () => { throw Object.assign(new Error('Service Unavailable'), { statusCode: 503 }) }
const ok: PushSender = async () => {}

describe('pushRoundUpdate — ronda en curso, la única suscripción del usuario murió (410)', () => {
  it('borra la suscripción Y el watcher del usuario: no queda una fila de round_watchers sin destino', async () => {
    const { admin, ops } = adminWithOneUserWatcher()
    const result = await pushRoundUpdate(admin, CODIGO, gone, snapshot('en_curso'))
    expect(result).toEqual({ status: 'sent', sent: 0, failed: 1, transientFailed: 0, cleaned: 1, finished: false })

    const subDeletes = opsOf(ops, 'push_subscriptions', 'delete')
    expect(subDeletes).toHaveLength(1)
    expect(filterValue(subDeletes[0], 'endpoint')).toEqual([EP])

    const watcherDeletes = opsOf(ops, 'round_watchers', 'delete')
    expect(watcherDeletes).toHaveLength(1)
    expect(filterValue(watcherDeletes[0], 'ronda_codigo')).toBe(CODIGO)
    expect(filterValue(watcherDeletes[0], 'user_id')).toEqual(['u1'])
  })

  it('un fallo transitorio no borra nada', async () => {
    const { admin, ops } = adminWithOneUserWatcher()
    const result = await pushRoundUpdate(admin, CODIGO, transient, snapshot('en_curso'))
    expect(result).toEqual({ status: 'sent', sent: 0, failed: 1, transientFailed: 1, cleaned: 0, finished: false })
    expect(opsOf(ops, 'push_subscriptions', 'delete')).toHaveLength(0)
    expect(opsOf(ops, 'round_watchers', 'delete')).toHaveLength(0)
  })
})

describe('pushRoundUpdate — resultado final', () => {
  it('entregado: se retira el watcher del usuario y no hace falta reintentar', async () => {
    const { admin, ops } = adminWithOneUserWatcher()
    const result = await pushRoundUpdate(admin, CODIGO, ok, snapshot('finalizada'))
    expect(result).toEqual({ status: 'sent', sent: 1, failed: 0, transientFailed: 0, cleaned: 0, finished: true })
    expect(needsRetry(result)).toBe(false)
    // Se retira por las dos vías: el dispositivo que recibió y el usuario dueño.
    const watcherDeletes = opsOf(ops, 'round_watchers', 'delete')
    expect(watcherDeletes.map(o => filterValue(o, 'push_subscription_id') ?? filterValue(o, 'user_id'))).toEqual([['s1'], ['u1']])
  })

  it('fallo transitorio: el watcher queda en pie y el resultado pide reintento (502 en la ruta)', async () => {
    const { admin, ops } = adminWithOneUserWatcher()
    const result = await pushRoundUpdate(admin, CODIGO, transient, snapshot('finalizada'))
    expect(result).toEqual({ status: 'sent', sent: 0, failed: 1, transientFailed: 1, cleaned: 0, finished: true })
    expect(needsRetry(result)).toBe(true)
    expect(opsOf(ops, 'round_watchers', 'delete')).toHaveLength(0)
  })

  it('sólo suscripciones muertas (410): se limpian, el watcher se va y NO se reintenta (review 5, I-2)', async () => {
    const { admin, ops } = adminWithOneUserWatcher()
    const result = await pushRoundUpdate(admin, CODIGO, gone, snapshot('finalizada'))
    expect(result).toEqual({ status: 'sent', sent: 0, failed: 1, transientFailed: 0, cleaned: 1, finished: true })
    expect(needsRetry(result)).toBe(false)
    expect(opsOf(ops, 'push_subscriptions', 'delete')).toHaveLength(1)
    expect(opsOf(ops, 'round_watchers', 'delete').map(o => filterValue(o, 'push_subscription_id') ?? filterValue(o, 'user_id'))).toEqual([['s1'], ['u1']])
  })

  it('un DELETE de round_watchers que falla se lanza, no se traga (review 5, M-a)', async () => {
    const { admin } = createFakeAdmin((op: FakeOp) => {
      if (op.table === 'round_watchers' && op.verb === 'select') return { data: [{ user_id: 'u1', push_subscription_id: null }] }
      if (op.table === 'push_subscriptions' && op.verb === 'select') return { data: [{ id: 's1', user_id: 'u1', endpoint: EP, p256dh: 'p', auth: 'a' }] }
      if (op.table === 'round_watchers' && op.verb === 'delete') return { error: { message: 'permission denied' } }
      return undefined
    })
    await expect(pushRoundUpdate(admin, CODIGO, ok, snapshot('finalizada'))).rejects.toThrow(/round_watchers delete/)
  })

  it('sin seguidores no hay nada que reintentar', () => {
    expect(needsRetry({ status: 'sent', sent: 0, failed: 0, transientFailed: 0, cleaned: 0, finished: true })).toBe(false)
    expect(needsRetry({ status: 'not_found' })).toBe(false)
  })

  it('en curso con fallos no pide reintento (el próximo guardado trae el estado nuevo)', () => {
    expect(needsRetry({ status: 'sent', sent: 2, failed: 1, transientFailed: 1, cleaned: 0, finished: false })).toBe(false)
  })
})

describe('pushRoundUpdate — ronda en curso sin ningún hoyo terminado (primer aviso con el primer puntaje, 23-oct-2026)', () => {
  const sinPuntajes = (estado: 'en_curso' | 'finalizada'): RoundPushSnapshot => ({
    ...snapshot(estado),
    players: [
      { nombre: 'Alberto Chadwick', vsPar: 0, holesCompleted: 0, totalHoles: 9 },
      { nombre: 'Papa', vsPar: 0, holesCompleted: 0, totalHoles: 9 },
    ],
  })

  it('no empuja nada, no lee watchers ni suscripciones y no toca la BD', async () => {
    const { admin, ops } = adminWithOneUserWatcher()
    let sends = 0
    const counting: PushSender = async () => { sends++ }
    const result = await pushRoundUpdate(admin, CODIGO, counting, sinPuntajes('en_curso'))
    expect(result).toEqual({ status: 'skipped', reason: 'sin_puntajes' })
    expect(sends).toBe(0)
    expect(ops).toHaveLength(0)
    expect(needsRetry(result)).toBe(false)
  })

  it('con un hoyo terminado por UN jugador sí empuja', async () => {
    const { admin } = adminWithOneUserWatcher()
    let sends = 0
    const counting: PushSender = async () => { sends++ }
    const snap = sinPuntajes('en_curso')
    snap.players[0].holesCompleted = 1
    const result = await pushRoundUpdate(admin, CODIGO, counting, snap)
    expect(result).toMatchObject({ status: 'sent', sent: 1 })
    expect(sends).toBe(1)
  })

  it('finalizada sin puntajes: el resultado final sale igual y retira el watcher', async () => {
    const { admin, ops } = adminWithOneUserWatcher()
    const result = await pushRoundUpdate(admin, CODIGO, ok, sinPuntajes('finalizada'))
    expect(result).toEqual({ status: 'sent', sent: 1, failed: 0, transientFailed: 0, cleaned: 0, finished: true })
    expect(opsOf(ops, 'round_watchers', 'delete').length).toBeGreaterThan(0)
  })
})
