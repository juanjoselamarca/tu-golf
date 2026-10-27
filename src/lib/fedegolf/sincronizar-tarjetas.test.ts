import { describe, it, expect, vi } from 'vitest'
import { sincronizarTarjetas, SYNC_TARJETAS_COOLDOWN_MS, type DepsSyncTarjetas } from './sincronizar-tarjetas'
import { FedegolfError } from './http'
import type { FedegolfTarjeta } from './types'

const AHORA = new Date('2026-10-19T12:00:00Z').getTime()
const creds = {
  rut_encrypted: 'r',
  password_encrypted: 'p',
  activo: true,
  ultimo_sync_tarjetas: new Date(AHORA - SYNC_TARJETAS_COOLDOWN_MS - 1).toISOString(),
}
const tarjeta = { ticket: 't1' } as FedegolfTarjeta

function deps(over: Partial<DepsSyncTarjetas> = {}) {
  const base = {
    leerCredenciales: vi.fn().mockResolvedValue(creds),
    decrypt: vi.fn((v: string) => v),
    sellarCooldown: vi.fn().mockResolvedValue(undefined),
    pageLogin: vi.fn().mockResolvedValue({ cookie: 'c' }),
    verificarClave: vi.fn().mockResolvedValue({ cookie: 'j' }),
    marcarClaveRechazada: vi.fn().mockResolvedValue(undefined),
    getTarjetas: vi.fn().mockResolvedValue([tarjeta]),
    capturar: vi.fn().mockResolvedValue(1),
    reportar: vi.fn(),
    ahora: () => AHORA,
  }
  return { ...base, ...over } as typeof base
}

describe('sincronizarTarjetas', () => {
  it('camino feliz → sella el cooldown antes de FedeGolf y captura', async () => {
    const orden: string[] = []
    const d = deps({
      sellarCooldown: vi.fn(async () => { orden.push('sello') }),
      pageLogin: vi.fn(async () => { orden.push('login'); return { cookie: 'c' } }),
    })
    expect(await sincronizarTarjetas(d)).toEqual({ estado: 'capturadas', total: 1 })
    expect(orden).toEqual(['sello', 'login'])
    expect(d.capturar).toHaveBeenCalledWith([tarjeta])
    expect(d.verificarClave).not.toHaveBeenCalled()
  })

  it('sin fila → no_vinculado', async () => {
    expect(await sincronizarTarjetas(deps({ leerCredenciales: vi.fn().mockResolvedValue(null) }))).toEqual({ estado: 'no_vinculado' })
  })

  it('activo=false → requiere_reconexion sin tocar FedeGolf (no se martilla una clave rota)', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ ...creds, activo: false }) })
    expect(await sincronizarTarjetas(d)).toEqual({ estado: 'requiere_reconexion' })
    expect(d.pageLogin).not.toHaveBeenCalled()
    expect(d.sellarCooldown).not.toHaveBeenCalled()
  })

  it('dentro del cooldown → cacheado', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ ...creds, ultimo_sync_tarjetas: new Date(AHORA - 1000).toISOString() }) })
    expect(await sincronizarTarjetas(d)).toEqual({ estado: 'cacheado' })
    expect(d.pageLogin).not.toHaveBeenCalled()
  })

  it('login de página falla y el login JSON rechaza la clave → marca activo=false (CAS por la clave) y pide reconectar', async () => {
    const d = deps({
      pageLogin: vi.fn().mockRejectedValue(new FedegolfError('respuesta_inesperada', 'sin lva')),
      verificarClave: vi.fn().mockRejectedValue(new FedegolfError('credenciales', 'rechazada')),
    })
    expect(await sincronizarTarjetas(d)).toEqual({ estado: 'requiere_reconexion' })
    expect(d.marcarClaveRechazada).toHaveBeenCalledWith('p')
  })

  it('sesión de página no autenticada (listado vuelve con el form) + clave rechazada → también detecta', async () => {
    const d = deps({
      getTarjetas: vi.fn().mockRejectedValue(new FedegolfError('respuesta_inesperada', 'form de login')),
      verificarClave: vi.fn().mockRejectedValue(new FedegolfError('credenciales', 'rechazada')),
    })
    expect(await sincronizarTarjetas(d)).toEqual({ estado: 'requiere_reconexion' })
    expect(d.marcarClaveRechazada).toHaveBeenCalledTimes(1)
  })

  it('login de página falla pero la clave sirve → login_fallido, NO desvincula', async () => {
    const d = deps({ pageLogin: vi.fn().mockRejectedValue(new Error('cambió el HTML')) })
    expect(await sincronizarTarjetas(d)).toEqual({ estado: 'login_fallido' })
    expect(d.marcarClaveRechazada).not.toHaveBeenCalled()
    expect(d.reportar).toHaveBeenCalledWith(expect.any(Error), 'pagina_tarjetas')
  })

  it('FedeGolf caído en ambos logins → login_fallido, NO desvincula (regresión Fase 0)', async () => {
    const d = deps({
      pageLogin: vi.fn().mockRejectedValue(new FedegolfError('no_disponible', 'timeout')),
      verificarClave: vi.fn().mockRejectedValue(new FedegolfError('no_disponible', 'timeout')),
    })
    expect(await sincronizarTarjetas(d)).toEqual({ estado: 'login_fallido' })
    expect(d.marcarClaveRechazada).not.toHaveBeenCalled()
  })

  it('no se puede descifrar → credenciales_almacenadas, sin sellar ni desvincular', async () => {
    const d = deps({ decrypt: vi.fn(() => { throw new Error('bad') }) })
    expect(await sincronizarTarjetas(d)).toEqual({ estado: 'credenciales_almacenadas' })
    expect(d.sellarCooldown).not.toHaveBeenCalled()
    expect(d.marcarClaveRechazada).not.toHaveBeenCalled()
  })
})
