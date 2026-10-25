/**
 * Canario: sin cuenta no se leen las notas privadas de una ronda compartida (25-oct-2026).
 *
 * Compartir deja la ronda en privacy='public' y RLS la abre a todos, pero RLS filtra filas, no
 * columnas: con la anon key (va en el bundle) `select=notes` devolvía las notas de todas las rondas
 * compartidas. Desde 20261025000000 anon sólo tiene SELECT sobre las columnas de la tarjeta pública.
 *
 * Fija los dos lados: anon NO lee `notes` (ni `*`), y SÍ lee exactamente lo que piden la tarjeta
 * pública y su preview (si alguien agrega una columna a esas listas sin su GRANT, la tarjeta sin
 * sesión se cae). El dueño, con su sesión, sigue leyendo sus notas.
 * Contra prod; se salta sin credenciales.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { COLUMNAS_PUBLICAS } from '@/lib/data/tarjeta-guardada'
import { COLUMNAS_OG } from '@/lib/data/tarjeta-og'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const email = process.env.E2E_TEST_USER_EMAIL
const password = process.env.E2E_TEST_USER_PASSWORD

const sinCredenciales = !url || !anonKey || !email || !password
const opciones = { auth: { autoRefreshToken: false, persistSession: false } }

describe.skipIf(sinCredenciales)('historical_rounds — columnas que lee un visitante sin cuenta', () => {
  let anon: SupabaseClient

  beforeAll(() => {
    anon = createClient(url!, anonKey!, opciones)
  })

  it.each([
    ['la tarjeta pública', COLUMNAS_PUBLICAS],
    ['el preview de WhatsApp', COLUMNAS_OG],
  ])('anon SÍ lee las columnas de %s', async (_camino, columnas) => {
    const { data, error } = await anon.from('historical_rounds').select(columnas).eq('privacy', 'public').limit(5)
    expect(error).toBeNull()
    // Sin filas públicas este test no prueba nada (el usuario E2E tiene una compartida).
    expect(data?.length ?? 0).toBeGreaterThan(0)
  })

  it.each(['notes', '*'])('anon NO lee %s de una ronda compartida (42501)', async (columnas) => {
    const { error } = await anon.from('historical_rounds').select(columnas).eq('privacy', 'public').limit(1)
    expect(error?.code).toBe('42501')
  })

  it('el dueño SÍ lee sus notas con su sesión', async () => {
    const dueño = createClient(url!, anonKey!, opciones)
    const { data: login, error: loginErr } = await dueño.auth.signInWithPassword({ email: email!, password: password! })
    if (loginErr || !login.user) throw loginErr ?? new Error('login E2E falló')
    const { data, error } = await dueño.from('historical_rounds').select('id, notes').eq('user_id', login.user.id).limit(1)
    expect(error).toBeNull()
    expect(data?.length ?? 0).toBeGreaterThan(0)
  })
})
