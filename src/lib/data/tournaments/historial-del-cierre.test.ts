import { describe, it, expect, vi, beforeEach } from 'vitest'
import { guardarRondasDelCierre, historialDelCierre } from './historial-del-cierre'
import { guardarRonda, recalcularIndice, rondasPorGuardar, reportarFallaDelHistorial } from './historial-del-cierre-pasos'

vi.mock('./historial-del-cierre-pasos', () => ({
  rondasPorGuardar: vi.fn(),
  guardarRonda: vi.fn(),
  recalcularIndice: vi.fn(async () => undefined),
  reportarFallaDelHistorial: vi.fn(async () => undefined),
}))

beforeEach(() => {
  vi.mocked(rondasPorGuardar).mockReset().mockImplementation(async (_, cerradas) => cerradas)
  vi.mocked(guardarRonda).mockReset().mockResolvedValue([])
  vi.mocked(recalcularIndice).mockReset().mockResolvedValue(undefined)
  vi.mocked(reportarFallaDelHistorial).mockClear()
})

describe('guardarRondasDelCierre', () => {
  it('guarda las pendientes de a una: la siguiente empieza cuando terminó la anterior', async () => {
    vi.mocked(rondasPorGuardar).mockResolvedValue(['a', 'b'])
    let terminarA!: () => void
    vi.mocked(guardarRonda).mockImplementationOnce(() => new Promise<string[]>(ok => { terminarA = () => ok([]) }))
    const guardado = guardarRondasDelCierre('t1', ['a'])
    await vi.waitFor(() => expect(guardarRonda).toHaveBeenCalledWith('a'))
    expect(guardarRonda).not.toHaveBeenCalledWith('b')
    terminarA()
    await guardado
    expect(vi.mocked(guardarRonda).mock.calls).toEqual([['a'], ['b']])
    expect(rondasPorGuardar).toHaveBeenCalledWith('t1', ['a'])
  })

  it('una ronda que falla se reporta y no corta las demás', async () => {
    vi.mocked(guardarRonda).mockImplementation(async id => { if (id === 'a') throw new Error('lectura fallida'); return [] })
    await expect(guardarRondasDelCierre('t1', ['a', 'b'])).resolves.toBeUndefined()
    expect(reportarFallaDelHistorial).toHaveBeenCalledWith('Error: lectura fallida', { roundId: 'a' })
    expect(guardarRonda).toHaveBeenCalledWith('b')
  })

  it('recalcula el índice de las cuentas de cada ronda antes de guardar la siguiente', async () => {
    const orden: string[] = []
    vi.mocked(guardarRonda).mockImplementation(async id => { orden.push(`guardar ${id}`); return id === 'a' ? ['u1', 'u0'] : ['u2'] })
    vi.mocked(recalcularIndice).mockImplementation(async userId => { orden.push(`índice ${userId}`) })
    await guardarRondasDelCierre('t1', ['a', 'b'])
    expect(orden).toEqual(['guardar a', 'índice u1', 'índice u0', 'guardar b', 'índice u2'])
  })

  it('un índice que no se recalcula se reporta con su ronda y su cuenta, y no corta las demás cuentas ni rondas', async () => {
    vi.mocked(guardarRonda).mockImplementation(async id => (id === 'a' ? ['u1', 'u0'] : ['u2']))
    vi.mocked(recalcularIndice).mockImplementation(async userId => { if (userId === 'u1') throw new Error('No se recalculó el índice del jugador') })
    await guardarRondasDelCierre('t1', ['a', 'b'])
    expect(reportarFallaDelHistorial).toHaveBeenCalledWith('Error: No se recalculó el índice del jugador', { roundId: 'a', userId: 'u1' })
    expect(vi.mocked(recalcularIndice).mock.calls).toEqual([['u1'], ['u0'], ['u2']])
  })

  it('si la lectura de las pendientes falla, lo reporta y guarda las que cerró el cierre', async () => {
    vi.mocked(rondasPorGuardar).mockRejectedValue(new Error('timeout'))
    await guardarRondasDelCierre('t1', ['a', 'b'])
    expect(reportarFallaDelHistorial).toHaveBeenCalledWith('Error: timeout', { tournamentId: 't1' })
    expect(vi.mocked(guardarRonda).mock.calls).toEqual([['a'], ['b']])
  })
})

describe('historialDelCierre', () => {
  it('guarda las rondas del cierre', async () => {
    await historialDelCierre('t1', ['a'])
    expect(guardarRonda).toHaveBeenCalledWith('a')
  })
})
