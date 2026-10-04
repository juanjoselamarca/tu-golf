import { describe, it, expect } from 'vitest'
import { sesionDelScorer } from './sesion-del-scorer'

const fake = (r: { session?: unknown; error?: unknown; lanza?: boolean }) => ({
  auth: {
    getSession: async () => {
      if (r.lanza) throw new TypeError('Failed to fetch')
      return { data: { session: r.session ?? null }, error: r.error ?? null }
    },
  },
})

describe('sesionDelScorer — identidad sin depender del servidor de login', () => {
  it('ok con la sesión guardada en el teléfono', async () => {
    const s = await sesionDelScorer(fake({ session: { user: { id: 'u1', email: 'a@b.cl' } } }) as never)
    expect(s).toEqual({ estado: 'ok', userId: 'u1', email: 'a@b.cl' })
  })
  it('sin_sesion sólo si no hay sesión Y no hubo error (de verdad no inició sesión)', async () => {
    expect((await sesionDelScorer(fake({}) as never)).estado).toBe('sin_sesion')
  })
  it('sin_conexion si renovar la sesión falló por red/5xx (caída 04-oct): NO es "sin sesión"', async () => {
    const s = await sesionDelScorer(fake({ error: { name: 'AuthRetryableFetchError', status: 503 } }) as never)
    expect(s.estado).toBe('sin_conexion')
  })
  it('sin_conexion si getSession revienta', async () => {
    expect((await sesionDelScorer(fake({ lanza: true }) as never)).estado).toBe('sin_conexion')
  })
})
