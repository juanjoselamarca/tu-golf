// Seguir una ronda sin cuenta — RLS real en prod.
//
// La identidad del espectador anónimo es su suscripción push (fila de
// push_subscriptions con user_id NULL, referenciada por round_watchers).
// Ninguna de esas filas puede ser leída, modificada ni borrada por un
// cliente con la anon key: sólo el backend (service role) las toca.
//
// Escribe filas temporales con un endpoint inventado e imposible de adivinar,
// y las borra al final (el borrado de la suscripción también prueba la
// cascada hacia round_watchers, que es lo que limpia un 410 Gone).
//
// Skipea sin credenciales, así el `vitest run` de pre-push lo saltea limpio.
// Correr: npm run test:integration

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const hasCreds = Boolean(supabaseUrl && serviceKey && anonKey)

const marker = randomUUID()
const ENDPOINT = `https://example.invalid/rls-test/${marker}`
const CODIGO = `RLS${marker.slice(0, 5).toUpperCase()}`

let subId: string | null = null

describe.skipIf(!hasCreds)('round_watchers anónimo — RLS real', () => {
  const admin = () => createClient(supabaseUrl as string, serviceKey as string)
  const anon = () => createClient(supabaseUrl as string, anonKey as string, { auth: { persistSession: false } })

  beforeAll(async () => {
    const sb = admin()
    const { data, error } = await sb
      .from('push_subscriptions')
      .insert({ endpoint: ENDPOINT, p256dh: 'test-p256dh', auth: 'test-auth' })
      .select('id')
      .single()
    if (error) throw new Error(`seed push_subscriptions: ${error.message}`)
    subId = data.id as string
    const { error: wErr } = await sb
      .from('round_watchers')
      .insert({ push_subscription_id: subId, ronda_codigo: CODIGO })
    if (wErr) throw new Error(`seed round_watchers: ${wErr.message}`)
  }, 30_000)

  afterAll(async () => {
    const sb = admin()
    await sb.from('round_watchers').delete().eq('ronda_codigo', CODIGO)
    await sb.from('push_subscriptions').delete().eq('endpoint', ENDPOINT)
  }, 30_000)

  it('el rol anon no lee suscripciones anónimas (antes: todas las user_id NULL eran públicas)', async () => {
    const { data } = await anon().from('push_subscriptions').select('id, endpoint').eq('endpoint', ENDPOINT)
    expect(data ?? []).toHaveLength(0)
  })

  it('el rol anon no lee watchers', async () => {
    const { data } = await anon().from('round_watchers').select('id').eq('ronda_codigo', CODIGO)
    expect(data ?? []).toHaveLength(0)
  })

  it('el rol anon no puede borrar ni modificar la suscripción de otro dispositivo', async () => {
    await anon().from('push_subscriptions').delete().eq('endpoint', ENDPOINT)
    await anon().from('push_subscriptions').update({ auth: 'hacked' }).eq('endpoint', ENDPOINT)
    const { data } = await admin().from('push_subscriptions').select('auth').eq('endpoint', ENDPOINT).single()
    expect(data?.auth).toBe('test-auth')
  })

  it('el rol anon no puede crear watchers ni suscripciones', async () => {
    const w = await anon().from('round_watchers').insert({ push_subscription_id: subId, ronda_codigo: CODIGO })
    expect(w.error).not.toBeNull()
    const s = await anon().from('push_subscriptions').insert({ endpoint: `${ENDPOINT}-2`, p256dh: 'x', auth: 'y' })
    expect(s.error).not.toBeNull()
  })

  it('un watcher necesita identidad (usuario o suscripción) — el CHECK lo impide', async () => {
    const { error } = await admin().from('round_watchers').insert({ ronda_codigo: CODIGO })
    expect(error).not.toBeNull()
  })

  it('borrar la suscripción (410 Gone) elimina el watcher en cascada', async () => {
    const sb = admin()
    const before = await sb.from('round_watchers').select('id').eq('ronda_codigo', CODIGO)
    expect(before.data).toHaveLength(1)
    await sb.from('push_subscriptions').delete().eq('endpoint', ENDPOINT)
    const after = await sb.from('round_watchers').select('id').eq('ronda_codigo', CODIGO)
    expect(after.data).toHaveLength(0)
  })
})
