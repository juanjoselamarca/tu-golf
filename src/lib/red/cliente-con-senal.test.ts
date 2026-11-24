import { describe, it, expect, vi } from 'vitest'
import { clienteConSenal } from './cliente-con-senal'

/** Builder de PostgREST mínimo: registra a qué señal se ató. */
function builder(senales: AbortSignal[]) {
  const b: Record<string, unknown> = {}
  b.eq = () => b
  b.abortSignal = (s: AbortSignal) => { senales.push(s); return b }
  return b
}

describe('clienteConSenal', () => {
  it('ata la señal a cada consulta de from(...) y a rpc', () => {
    const senales: AbortSignal[] = []
    const cliente = {
      from: vi.fn(() => ({ select: () => builder(senales), insert: () => builder(senales), update: () => builder(senales), upsert: () => builder(senales), delete: () => builder(senales) })),
      rpc: vi.fn(() => builder(senales)),
    }
    const control = new AbortController()
    const c = clienteConSenal(cliente as never, control.signal) as unknown as typeof cliente
    c.from().select()
    c.from().insert()
    c.from().update()
    c.from().upsert()
    c.from().delete()
    c.rpc()
    expect(senales).toHaveLength(6)
    expect(senales.every(s => s === control.signal)).toBe(true)
  })
  it('deja pasar tal cual auth y lo que no es consulta, ligado a su objeto', async () => {
    const cliente = {
      from: () => ({}), rpc: () => ({}),
      auth: { getSession: async () => 'sesion' },
      canal: function (this: { nombre: string }) { return this.nombre },
      nombre: 'cliente',
    }
    const c = clienteConSenal(cliente as never, new AbortController().signal) as unknown as typeof cliente
    expect(c.auth).toBe(cliente.auth)
    expect(c.canal()).toBe('cliente')
  })
  it('tolera un cliente sin from/rpc (dobles que solo traen auth) y builders sin abortSignal', () => {
    const soloAuth = { auth: {} }
    expect(clienteConSenal(soloAuth as never, new AbortController().signal)).toMatchObject({ auth: {} })
    const sinAbort = { from: () => ({ select: () => ({ marca: 1 }) }), rpc: () => ({ marca: 2 }) }
    const c = clienteConSenal(sinAbort as never, new AbortController().signal) as unknown as typeof sinAbort
    expect(c.from().select()).toEqual({ marca: 1 })
    expect(c.rpc()).toEqual({ marca: 2 })
  })
})
