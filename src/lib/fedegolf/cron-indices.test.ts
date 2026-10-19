import { describe, it, expect, vi } from 'vitest'
import { correrCronIndices, ordenarParaCron, esFallaMasiva, type DepsCronIndices, type FilaCron } from './cron-indices'
import type { ResultadoSyncIndice } from './sincronizar-indice'

const fila = (id: string, ultimo_sync: string | null): FilaCron => ({ id, user_id: `u-${id}`, ultimo_sync })
const sync = (cambio: boolean): ResultadoSyncIndice =>
  ({ estado: 'sincronizado', indice: 8.1, indiceAnterior: 8.3, cambio, reconectar: false })
const sinIndice: ResultadoSyncIndice = { estado: 'sin_indice', indice: 8.3, reconectar: false }
const caido: ResultadoSyncIndice = { estado: 'degradado', indice: 8.3, motivo: 'no_disponible', reconectar: false }

function deps(filas: FilaCron[], over: Partial<DepsCronIndices> = {}) {
  let reloj = 0
  const base = {
    listarVinculados: vi.fn().mockResolvedValue(filas),
    sincronizarUsuario: vi.fn().mockResolvedValue(sync(false)),
    avisarCambio: vi.fn().mockResolvedValue(true),
    reportar: vi.fn(),
    reportarAviso: vi.fn(),
    ahora: () => reloj,
  }
  return { ...base, ...over, avanzar: (ms: number) => { reloj += ms } }
}

describe('ordenarParaCron', () => {
  it('nunca sincronizados primero, luego el más viejo; empate por id', () => {
    const r = ordenarParaCron([
      fila('c', '2026-10-18T00:00:00Z'), fila('b', null), fila('a', '2026-10-10T00:00:00Z'),
      fila('a2', null), fila('d', '2026-10-10T00:00:00Z'),
    ])
    expect(r.map(f => f.id)).toEqual(['a2', 'b', 'a', 'd', 'c'])
  })
})

describe('esFallaMasiva', () => {
  const r = (procesados: number, degradados: number, fallidos = 0, sin_indice = 0) =>
    ({ total: procesados, procesados, cambiados: 0, avisados: 0, degradados, sin_indice, fallidos, pendientes: 0, cortado_por_fedegolf: false })
  it.each([
    [r(10, 5), true],
    [r(10, 3, 2), true],
    [r(10, 4), false],
    [r(4, 4), true],
    [r(4, 3), false],
    [r(1, 1), true],
    [r(0, 0), false],
    // "sin índice": uno suelto es sano; en masa (o todos con N chico) es FedeGolf cambiando.
    [r(4, 3, 0, 1), true],
    [r(10, 0, 0, 10), true],
    [r(10, 0, 0, 4), false],
    [r(3, 0, 0, 3), true],
    [r(1, 0, 0, 1), false],
    [r(10, 3, 0, 3), true],
    [r(10, 4, 0, 2), true],
  ])('%o → %s', (resumen, esperado) => expect(esFallaMasiva(resumen)).toBe(esperado))
})

describe('correrCronIndices', () => {
  it('procesa a todos y cuenta cambios', async () => {
    const d = deps([fila('a', null), fila('b', null), fila('c', null)], {
      sincronizarUsuario: vi.fn()
        .mockResolvedValueOnce(sync(true)).mockResolvedValueOnce(sync(false)).mockResolvedValueOnce(sync(true)),
    })
    expect(await correrCronIndices(d)).toEqual({
      total: 3, procesados: 3, cambiados: 2, avisados: 2, degradados: 0, sin_indice: 0, fallidos: 0, pendientes: 0,
      cortado_por_fedegolf: false,
    })
    // Solo los cambios avisan, con el índice nuevo y el anterior.
    expect(d.avisarCambio).toHaveBeenCalledTimes(2)
    expect(d.avisarCambio).toHaveBeenCalledWith('u-a', 8.1, 8.3)
  })

  it('un push que falla no es un sync fallido: se reporta aparte y sigue', async () => {
    const d = deps([fila('a', null), fila('b', null)], {
      sincronizarUsuario: vi.fn().mockResolvedValue(sync(true)),
      avisarCambio: vi.fn().mockRejectedValueOnce(new Error('push caído')).mockResolvedValueOnce(false),
    })
    const r = await correrCronIndices(d, { concurrencia: 1 })
    expect(r).toMatchObject({ procesados: 2, cambiados: 2, avisados: 0, fallidos: 0 })
    expect(d.reportarAviso).toHaveBeenCalledWith(expect.any(Error), 'u-a')
    expect(d.reportar).not.toHaveBeenCalled()
  })

  it('un usuario que lanza no frena al resto', async () => {
    const d = deps([fila('a', null), fila('b', null)], {
      sincronizarUsuario: vi.fn().mockRejectedValueOnce(new Error('fila rota')).mockResolvedValueOnce(sync(true)),
    })
    const r = await correrCronIndices(d, { concurrencia: 1 })
    expect(r).toMatchObject({ procesados: 2, fallidos: 1, cambiados: 1 })
    expect(d.reportar).toHaveBeenCalledWith(expect.any(Error), 'u-a')
  })

  it('presupuesto de tiempo agotado → corta y deja pendientes', async () => {
    const d = deps([fila('a', null), fila('b', null), fila('c', null)])
    d.sincronizarUsuario = vi.fn(async () => { d.avanzar(100); return sync(false) })
    const r = await correrCronIndices(d, { concurrencia: 1, presupuestoMs: 150 })
    expect(r).toMatchObject({ procesados: 2, pendientes: 1 })
  })

  it('FedeGolf caído N veces seguidas → deja de martillarlo', async () => {
    const filas = Array.from({ length: 20 }, (_, i) => fila(String(i).padStart(2, '0'), null))
    const d = deps(filas, { sincronizarUsuario: vi.fn().mockResolvedValue(caido) })
    const r = await correrCronIndices(d, { concurrencia: 1, maxCaidasSeguidas: 5 })
    expect(r).toMatchObject({ procesados: 5, degradados: 5, pendientes: 15, cortado_por_fedegolf: true })
  })

  it('una caída suelta entre éxitos no corta', async () => {
    const d = deps(Array.from({ length: 6 }, (_, i) => fila(String(i), null)), {
      sincronizarUsuario: vi.fn()
        .mockResolvedValueOnce(caido).mockResolvedValueOnce(caido).mockResolvedValueOnce(sync(false))
        .mockResolvedValue(caido),
    })
    const r = await correrCronIndices(d, { concurrencia: 1, maxCaidasSeguidas: 3 })
    expect(r).toMatchObject({ procesados: 6, cortado_por_fedegolf: true, pendientes: 0 })
  })

  it('concurrencia: cada usuario se procesa una sola vez', async () => {
    const filas = Array.from({ length: 10 }, (_, i) => fila(String(i), null))
    const sincronizarUsuario = vi.fn().mockResolvedValue(sync(false))
    await correrCronIndices(deps(filas, { sincronizarUsuario }), { concurrencia: 3 })
    const llamados = sincronizarUsuario.mock.calls.map(c => c[0] as string).sort()
    expect(llamados).toEqual(filas.map(f => f.user_id).sort())
  })

  it('"sin índice" cuenta aparte y corta la racha de caídas', async () => {
    const d = deps([fila('a', null), fila('b', null), fila('c', null)], {
      sincronizarUsuario: vi.fn()
        .mockResolvedValueOnce(caido).mockResolvedValueOnce(sinIndice).mockResolvedValueOnce(caido),
    })
    expect(await correrCronIndices(d, { concurrencia: 1, maxCaidasSeguidas: 2 })).toMatchObject({
      procesados: 3, degradados: 2, sin_indice: 1, cortado_por_fedegolf: false,
    })
  })

  it('sin vinculados → resumen vacío', async () => {
    expect(await correrCronIndices(deps([]))).toMatchObject({ total: 0, procesados: 0, pendientes: 0 })
  })
})
