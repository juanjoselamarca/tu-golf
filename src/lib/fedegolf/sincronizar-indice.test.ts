import { describe, it, expect, vi } from 'vitest'
import {
  sincronizarIndice,
  esCambioDeIndice,
  type DepsSyncIndice,
  type CredencialesFedegolf,
} from './sincronizar-indice'
import { FedegolfError } from './http'

const AHORA = new Date('2026-10-19T12:00:00Z').getTime()
const credsBase: CredencialesFedegolf = {
  rut_encrypted: 'r',
  activo: true,
  ultimo_sync: '2026-10-17T12:00:00Z',
  ultimo_indice: 8.3,
}

function deps(over: Partial<DepsSyncIndice> = {}) {
  const base = {
    leerCredenciales: vi.fn().mockResolvedValue(credsBase),
    puedeConsultarFedegolf: vi.fn(() => true),
    decrypt: vi.fn((v: string) => v),
    getIndice: vi.fn().mockResolvedValue({ rut: 'r', indice: 8.1 }),
    guardarSync: vi.fn().mockResolvedValue(true),
    registrarIndice: vi.fn().mockResolvedValue(undefined),
    reportar: vi.fn(),
    ahora: () => AHORA,
  }
  return { ...base, ...over } as typeof base
}

describe('sincronizarIndice', () => {
  it('sin fila → no_vinculado', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue(null) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'no_vinculado' })
  })

  it('cambio de índice → guarda (compare-and-set contra el anterior) y registra historial', async () => {
    const d = deps()
    expect(await sincronizarIndice(d)).toEqual({
      estado: 'sincronizado', indice: 8.1, indiceAnterior: 8.3, cambio: true, reconectar: false,
    })
    expect(d.guardarSync).toHaveBeenCalledWith(8.1, 8.3)
    expect(d.registrarIndice).toHaveBeenCalledWith(8.1)
  })

  it('el índice es público por RUT: solo descifra el RUT, nunca la clave', async () => {
    const d = deps()
    await sincronizarIndice(d)
    expect(d.decrypt).toHaveBeenCalledTimes(1)
    expect(d.decrypt).toHaveBeenCalledWith('r')
    expect(d.getIndice).toHaveBeenCalledWith('r')
  })

  it('activo=false (clave cambiada) → el índice SIGUE sincronizando, con reconectar:true', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ ...credsBase, activo: false }) })
    expect(await sincronizarIndice(d)).toMatchObject({ estado: 'sincronizado', indice: 8.1, reconectar: true })
  })

  it('índice igual → guarda sync pero no registra historial', async () => {
    const d = deps({ getIndice: vi.fn().mockResolvedValue({ rut: 'r', indice: 8.3 }) })
    expect(await sincronizarIndice(d)).toMatchObject({ estado: 'sincronizado', cambio: false })
    expect(d.guardarSync).toHaveBeenCalledWith(8.3, 8.3)
    expect(d.registrarIndice).not.toHaveBeenCalled()
  })

  it('carrera: otro proceso ya escribió (compare-and-set falla) → sin historial duplicado', async () => {
    const d = deps({ guardarSync: vi.fn().mockResolvedValue(false) })
    expect(await sincronizarIndice(d)).toMatchObject({ estado: 'sincronizado', indice: 8.1, cambio: false })
    expect(d.registrarIndice).not.toHaveBeenCalled()
  })

  it('dentro del cooldown → cacheado sin tocar FedeGolf ni consumir el freno', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ ...credsBase, ultimo_sync: '2026-10-19T11:00:00Z' }) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'cacheado', indice: 8.3, reconectar: false })
    expect(d.getIndice).not.toHaveBeenCalled()
    expect(d.puedeConsultarFedegolf).not.toHaveBeenCalled()
  })

  it('freno de reintentos activo → degradado (no "ya está actualizado") sin tocar FedeGolf', async () => {
    const d = deps({ puedeConsultarFedegolf: vi.fn(() => false) })
    expect(await sincronizarIndice(d)).toEqual({
      estado: 'degradado', indice: 8.3, motivo: 'no_disponible', reconectar: false,
    })
    expect(d.decrypt).not.toHaveBeenCalled()
    expect(d.getIndice).not.toHaveBeenCalled()
  })

  it('forzar (cron) ignora cooldown y freno', async () => {
    const d = deps({
      leerCredenciales: vi.fn().mockResolvedValue({ ...credsBase, ultimo_sync: '2026-10-19T11:00:00Z' }),
      puedeConsultarFedegolf: vi.fn(() => false),
    })
    expect(await sincronizarIndice(d, { forzar: true })).toMatchObject({ estado: 'sincronizado', indice: 8.1 })
    expect(d.puedeConsultarFedegolf).not.toHaveBeenCalled()
  })

  it('regresión B1: FedeGolf caído → degradado con el último índice, sin persistir', async () => {
    const d = deps({ getIndice: vi.fn().mockRejectedValue(new FedegolfError('no_disponible', 'timeout')) })
    expect(await sincronizarIndice(d)).toEqual({
      estado: 'degradado', indice: 8.3, motivo: 'no_disponible', reconectar: false,
    })
    expect(d.guardarSync).not.toHaveBeenCalled()
    expect(d.reportar).toHaveBeenCalledWith(expect.any(FedegolfError), 'get_indice')
  })

  it('error no tipado al leer el índice → degradado respuesta_inesperada', async () => {
    const d = deps({ getIndice: vi.fn().mockRejectedValue(new Error('boom')) })
    expect(await sincronizarIndice(d)).toMatchObject({ estado: 'degradado', motivo: 'respuesta_inesperada' })
  })

  it('no se puede descifrar (clave de cifrado mal configurada) → degradado, sin desvincular', async () => {
    const d = deps({ decrypt: vi.fn(() => { throw new Error('bad decrypt') }) })
    expect(await sincronizarIndice(d)).toEqual({
      estado: 'degradado', indice: 8.3, motivo: 'credenciales_almacenadas', reconectar: false,
    })
    expect(d.reportar).toHaveBeenCalledWith(expect.any(Error), 'decrypt_credenciales')
    expect(d.getIndice).not.toHaveBeenCalled()
  })

  it('FedeGolf devuelve índice null con caché → degradado, NO pisa el último índice', async () => {
    const d = deps({ getIndice: vi.fn().mockResolvedValue({ rut: 'r', indice: null }) })
    expect(await sincronizarIndice(d)).toEqual({
      estado: 'degradado', indice: 8.3, motivo: 'respuesta_inesperada', reconectar: false,
    })
    expect(d.guardarSync).not.toHaveBeenCalled()
    expect(d.registrarIndice).not.toHaveBeenCalled()
  })

  it('índice null sin caché previo → degradado y NO sella el cooldown', async () => {
    const d = deps({
      leerCredenciales: vi.fn().mockResolvedValue({ ...credsBase, ultimo_indice: null }),
      getIndice: vi.fn().mockResolvedValue({ rut: 'r', indice: null }),
    })
    expect(await sincronizarIndice(d)).toEqual({
      estado: 'degradado', indice: null, motivo: 'respuesta_inesperada', reconectar: false,
    })
    expect(d.guardarSync).not.toHaveBeenCalled()
  })

  it('primer índice (sin caché) → cambio y registra', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ ...credsBase, ultimo_indice: null, ultimo_sync: null }) })
    expect(await sincronizarIndice(d)).toMatchObject({ estado: 'sincronizado', indice: 8.1, indiceAnterior: null, cambio: true })
    expect(d.registrarIndice).toHaveBeenCalledWith(8.1)
  })
})

describe('esCambioDeIndice', () => {
  it.each([
    [8.1, 8.3, true],
    [8.3, 8.3, false],
    [null, 8.3, false],
    [8.1, null, true],
    [null, null, false],
  ])('%s vs %s → %s', (nuevo, anterior, esperado) => {
    expect(esCambioDeIndice(nuevo, anterior)).toBe(esperado)
  })
})
