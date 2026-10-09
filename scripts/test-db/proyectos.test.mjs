import { describe, it, expect, vi } from 'vitest'

// apiGet NO debe llegar a llamarse en ninguno de estos casos: las guardas cortan antes de la red.
const apiGet = vi.fn(async () => { throw new Error('no debía llamar a la API') })
vi.mock('../lib/management-sql.mjs', () => ({ apiGet }))

const { resolverProyectos } = await import('./proyectos.mjs')
const { PROD_REF } = await import('../lib/supabase-ref.mjs')

const url = ref => `https://${ref}.supabase.co`
const PRUEBAS = 'qdrbjdfhqbotanocipxf'

describe('resolverProyectos — guardas antes de tocar la API', () => {
  it('NEXT_PUBLIC_SUPABASE_URL con otro ref que no es PROD_REF', async () => {
    await expect(resolverProyectos({ NEXT_PUBLIC_SUPABASE_URL: url('otroproyecto'), TEST_SUPABASE_URL: url(PRUEBAS), SUPABASE_ACCESS_TOKEN: 't' }))
      .rejects.toThrow(/no es PROD_REF/)
  })

  it('TEST_SUPABASE_URL apuntando a prod', async () => {
    await expect(resolverProyectos({ NEXT_PUBLIC_SUPABASE_URL: url(PROD_REF), TEST_SUPABASE_URL: url(PROD_REF), SUPABASE_ACCESS_TOKEN: 't' }))
      .rejects.toThrow(/PRODUCCIÓN/)
  })

  it('origen y destino iguales (aunque ninguno sea prod)', async () => {
    await expect(resolverProyectos({ NEXT_PUBLIC_SUPABASE_URL: url(PRUEBAS), TEST_SUPABASE_URL: url(PRUEBAS), SUPABASE_ACCESS_TOKEN: 't' }))
      .rejects.toThrow(/MISMO proyecto/)
  })

  it('falta el access token', async () => {
    await expect(resolverProyectos({ NEXT_PUBLIC_SUPABASE_URL: url(PROD_REF), TEST_SUPABASE_URL: url(PRUEBAS) }))
      .rejects.toThrow(/SUPABASE_ACCESS_TOKEN/)
  })

  it('ninguno llegó a la API', () => {
    expect(apiGet).not.toHaveBeenCalled()
  })
})
