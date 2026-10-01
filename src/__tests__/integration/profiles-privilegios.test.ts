/**
 * Canario de privilegios de `profiles` para un usuario autenticado (01-oct-2026).
 *
 * Fija los dos lados del incidente del 01-oct:
 *  - lo que el usuario NO puede escribir con su sesión (billing, rol, acceso al
 *    coach): si alguien re-abre esas columnas, vuelve el "darse PRO a sí mismo";
 *  - lo que la app SÍ escribe con la sesión (índice, nivel, índice Golfers+): si
 *    alguien re-aplica el REVOKE sin el GRANT, se rompen editar perfil, el
 *    onboarding y el recálculo del índice tras cada ronda.
 *
 * Cada UPDATE reescribe el MISMO valor que ya tiene la fila: no muta datos.
 * Contra prod con el usuario E2E; se salta sin credenciales.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const email = process.env.E2E_TEST_USER_EMAIL
const password = process.env.E2E_TEST_USER_PASSWORD

const sinCredenciales = !url || !anonKey || !email || !password

describe.skipIf(sinCredenciales)('profiles — privilegios del usuario autenticado', () => {
  let cliente: SupabaseClient
  let userId: string
  let fila: Record<string, unknown>

  beforeAll(async () => {
    cliente = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await cliente.auth.signInWithPassword({ email: email!, password: password! })
    if (error || !data.user) throw error ?? new Error('login E2E falló')
    userId = data.user.id
    const { data: perfil, error: selErr } = await cliente
      .from('profiles')
      .select('subscription_tier, coach_access_enabled, role, indice, nivel, indice_golfers')
      .eq('id', userId)
      .single()
    if (selErr || !perfil) throw selErr ?? new Error('perfil E2E no encontrado')
    fila = perfil
  }, 60_000)

  it.each(['subscription_tier', 'coach_access_enabled', 'role'])(
    'NO puede escribir %s con su sesión (42501)',
    async (columna) => {
      const { error } = await cliente.from('profiles').update({ [columna]: fila[columna] }).eq('id', userId)
      expect(error?.code, columna).toBe('42501')
    },
  )

  it.each(['indice', 'nivel', 'indice_golfers'])(
    'SÍ puede escribir %s con su sesión (lo usa la app)',
    async (columna) => {
      const { error } = await cliente.from('profiles').update({ [columna]: fila[columna] }).eq('id', userId)
      expect(error, columna).toBeNull()
    },
  )
})
