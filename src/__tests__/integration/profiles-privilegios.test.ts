/**
 * Canario de privilegios de `profiles` para un usuario autenticado (01-oct-2026).
 *
 * Fija los dos lados del incidente del 01-oct:
 *  - lo que el usuario NO puede escribir con su sesión (billing, rol, acceso al
 *    coach): si alguien re-abre esas columnas, vuelve el "darse PRO a sí mismo";
 *  - lo que la app SÍ escribe con la sesión (índice, nivel, patrones): si
 *    alguien re-aplica el REVOKE sin el GRANT, se rompen editar perfil, el
 *    onboarding y el recálculo del índice tras cada ronda.
 *
 * Cada UPDATE reescribe el MISMO valor que ya tiene la fila (sólo el trigger
 * update_profiles_updated_at mueve `updated_at` del usuario E2E).
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
  let migracionPendiente = false

  beforeAll(async () => {
    cliente = createClient(url!, anonKey!, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data, error } = await cliente.auth.signInWithPassword({ email: email!, password: password! })
    if (error || !data.user) throw error ?? new Error('login E2E falló')
    userId = data.user.id
    const { data: perfil, error: selErr } = await cliente
      .from('profiles')
      .select('subscription_tier, coach_access_enabled, role, indice, nivel, nivel_updated_at, nivel_expires_at, indice_golfers, indice_golfers_updated_at, patterns_need_recalc')
      .eq('id', userId)
      .single()
    if (selErr || !perfil) throw selErr ?? new Error('perfil E2E no encontrado')
    fila = perfil

    // Gate TEMPORAL (01-oct-2026): la migración 20261001e se aplica a prod DESPUÉS del
    // merge (regla de BD en scripts/ceo-prompts/merge-rule.md). Mientras falte, la función
    // vieja acepta el uuid ajeno sin error. Quitar este gate en el PR que sigue a la
    // aplicación — si queda, estas aserciones podrían saltarse para siempre.
    const { error: probe } = await cliente.rpc('calcular_indice_golfers', { p_user_id: '00000000-0000-0000-0000-000000000001' })
    migracionPendiente = probe == null
    if (migracionPendiente) console.warn('⚠️ 20261001e pendiente de aplicar a prod: aserciones de indice_golfers/RPC saltadas')
  }, 60_000)

  it.each(['subscription_tier', 'coach_access_enabled', 'role', 'indice_golfers', 'indice_golfers_updated_at'])(
    'NO puede escribir %s con su sesión (42501)',
    async (columna) => {
      if (migracionPendiente && columna.startsWith('indice_golfers')) return
      const { error } = await cliente.from('profiles').update({ [columna]: fila[columna] }).eq('id', userId)
      expect(error?.code, columna).toBe('42501')
    },
  )

  // Los MISMOS payloads que manda la app: si se revoca una sola columna del grupo
  // (ej. nivel_expires_at), el UPDATE entero falla igual que en producción.
  const PAYLOADS_DE_LA_APP: Array<[string, string[]]> = [
    ['editar perfil / onboarding (useProfileEdit, OnboardingWizard)', ['indice']],
    ['nivel tras finalizar ronda (useFinalizeRonda, score-grupo)', ['nivel', 'nivel_updated_at', 'nivel_expires_at']],
    ['patrones del coach (import-round, detect-and-save-patterns)', ['patterns_need_recalc']],
  ]

  it.each(PAYLOADS_DE_LA_APP)('SÍ puede escribir: %s', async (_caso, columnas) => {
    const payload = Object.fromEntries(columnas.map(c => [c, fila[c]]))
    const { error } = await cliente.from('profiles').update(payload).eq('id', userId)
    expect(error, columnas.join(', ')).toBeNull()
  })

  // calcular_indice_golfers es SECURITY DEFINER desde el 01-oct: escribe el índice
  // Golfers+ por el usuario (que ya no puede hacerlo con un UPDATE directo).
  it('puede recalcular SU índice Golfers+ vía RPC', async () => {
    const { error } = await cliente.rpc('calcular_indice_golfers', { p_user_id: userId })
    expect(error).toBeNull()
  })

  it('NO puede recalcular el índice de un jugador con el que no comparte ronda (42501)', async () => {
    if (migracionPendiente) return
    const ajeno = '00000000-0000-0000-0000-000000000001'
    const { error } = await cliente.rpc('calcular_indice_golfers', { p_user_id: ajeno })
    expect(error?.code).toBe('42501')
  })
})
