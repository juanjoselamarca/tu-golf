import { describe, it, expect, vi, afterEach } from 'vitest'
import { execSql } from './exec-sql.mjs'

const env = { NEXT_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc' }
const responde = (status, cuerpo, vistos = []) => async (url, init) => {
  vistos.push({ url: String(url), init })
  return new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status })
}

describe('execSql', () => {
  it('llama a exec_sql por PostgREST con la service key y devuelve las filas', async () => {
    const vistos = []
    const filas = await execSql('select 1 uno', { env, fetchImpl: responde(200, [{ uno: 1 }], vistos) })
    expect(filas).toEqual([{ uno: 1 }])
    expect(vistos[0].url).toBe('https://abc.supabase.co/rest/v1/rpc/exec_sql')
    expect(vistos[0].init.headers).toMatchObject({ apikey: 'svc', Authorization: 'Bearer svc' })
    expect(JSON.parse(vistos[0].init.body)).toEqual({ query: 'select 1 uno' })
  })

  it('el {error} de exec_sql (p. ej. una escritura en la transacción read-only) se lanza, no se devuelve como filas', async () => {
    const fetchImpl = responde(200, { error: 'cannot execute DELETE in a read-only transaction' })
    await expect(execSql('delete from x', { env, fetchImpl })).rejects.toThrow('cannot execute DELETE in a read-only transaction')
  })

  it('un HTTP de error se lanza con el status, sin reintentar si no es transitorio', async () => {
    const vistos = []
    await expect(execSql('select 1', { env, fetchImpl: responde(401, 'Invalid API key', vistos) })).rejects.toThrow('HTTP 401: Invalid API key')
    expect(vistos).toHaveLength(1)
  })

  describe('errores transitorios', () => {
    afterEach(() => { vi.useRealTimers() })

    it('un 503 se reintenta y la consulta sale con el siguiente intento', async () => {
      vi.useFakeTimers()
      const respuestas = [new Response('upstream', { status: 503 }), new Response('[{"uno":1}]', { status: 200 })]
      const filas = execSql('select 1 uno', { env, fetchImpl: async () => respuestas.shift() })
      await vi.advanceTimersByTimeAsync(3_000)
      expect(await filas).toEqual([{ uno: 1 }])
    })

    it('el {error} de Postgres no se reintenta', async () => {
      const vistos = []
      await expect(execSql('select x', { env, fetchImpl: responde(200, { error: 'column "x" does not exist' }, vistos) })).rejects.toThrow('does not exist')
      expect(vistos).toHaveLength(1)
    })
  })

  it('sin URL o sin service key no llama a la red', async () => {
    const vistos = []
    await expect(execSql('select 1', { env: { NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL }, fetchImpl: responde(200, [], vistos) }))
      .rejects.toThrow('SUPABASE_SERVICE_ROLE_KEY')
    expect(vistos).toHaveLength(0)
  })
})
