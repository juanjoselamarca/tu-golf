import { describe, it, expect, vi } from 'vitest'
import { sincronizarIndice, type DepsSyncIndice, type CredencialesFedegolf } from './sincronizar-indice'
import { FedegolfError } from './http'

const AHORA = new Date('2026-10-19T12:00:00Z').getTime()
const credsBase: CredencialesFedegolf = {
  rut_encrypted: 'r',
  password_encrypted: 'p',
  activo: true,
  ultimo_sync: '2026-10-17T12:00:00Z',
  ultimo_indice: 8.3,
}

function deps(over: Partial<DepsSyncIndice> = {}) {
  const base = {
    leerCredenciales: vi.fn().mockResolvedValue(credsBase),
    puedeConsultarFedegolf: vi.fn(() => true),
    decrypt: vi.fn((v: string) => v),
    login: vi.fn().mockResolvedValue({ cookie: 'PHPSESSID=x' }),
    getIndice: vi.fn().mockResolvedValue({ rut: 'r', indice: 8.1 }),
    marcarInactiva: vi.fn().mockResolvedValue(undefined),
    guardarSync: vi.fn().mockResolvedValue(undefined),
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

  it('activo=false → requiere_reconexion, sin tocar FedeGolf', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ ...credsBase, activo: false }) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'requiere_reconexion' })
    expect(d.login).not.toHaveBeenCalled()
  })

  it('dentro del cooldown → cacheado, sin tocar FedeGolf', async () => {
    const d = deps({
      leerCredenciales: vi.fn().mockResolvedValue({ ...credsBase, ultimo_sync: '2026-10-19T08:00:00Z' }),
    })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'cacheado', indice: 8.3 })
    expect(d.login).not.toHaveBeenCalled()
  })

  it('REGRESIÓN B1: FedeGolf caído en el login → degradado y NUNCA marca inactiva', async () => {
    const d = deps({ login: vi.fn().mockRejectedValue(new FedegolfError('no_disponible', 'timeout')) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'degradado', indice: 8.3, motivo: 'no_disponible' })
    expect(d.marcarInactiva).not.toHaveBeenCalled()
    expect(d.guardarSync).not.toHaveBeenCalled()
  })

  it('respuesta inesperada en el login → degradado, no marca inactiva', async () => {
    const d = deps({ login: vi.fn().mockRejectedValue(new FedegolfError('respuesta_inesperada', '200')) })
    expect((await sincronizarIndice(d)).estado).toBe('degradado')
    expect(d.marcarInactiva).not.toHaveBeenCalled()
  })

  it('error desconocido (no FedegolfError) en el login → degradado, no marca inactiva', async () => {
    const d = deps({ login: vi.fn().mockRejectedValue(new Error('boom')) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'degradado', indice: 8.3, motivo: 'respuesta_inesperada' })
    expect(d.marcarInactiva).not.toHaveBeenCalled()
  })

  it('clave rechazada → marca inactiva y requiere_reconexion', async () => {
    const d = deps({
      login: vi.fn().mockRejectedValue(new FedegolfError('credenciales', 'Usuario o contraseña incorrectos')),
    })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'requiere_reconexion' })
    expect(d.marcarInactiva).toHaveBeenCalledOnce()
  })

  it('REGRESIÓN B2: falla del índice → degradado (antes 500)', async () => {
    const d = deps({ getIndice: vi.fn().mockRejectedValue(new FedegolfError('respuesta_inesperada', 'json')) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'degradado', indice: 8.3, motivo: 'respuesta_inesperada' })
    expect(d.guardarSync).not.toHaveBeenCalled()
  })

  it('decrypt falla (clave de cifrado ausente/rotada) → degradado, NO desvincula', async () => {
    const d = deps({
      decrypt: vi.fn(() => {
        throw new Error('FEDEGOLF_ENCRYPTION_KEY no configurada')
      }),
    })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'degradado', indice: 8.3, motivo: 'credenciales_almacenadas' })
    expect(d.marcarInactiva).not.toHaveBeenCalled()
    expect(d.reportar).toHaveBeenCalled()
  })

  it('índice cambió → guarda, registra historial, informa anterior', async () => {
    const d = deps()
    expect(await sincronizarIndice(d)).toEqual({ estado: 'sincronizado', indice: 8.1, indiceAnterior: 8.3, cambio: true })
    expect(d.guardarSync).toHaveBeenCalledWith(8.1)
    expect(d.registrarIndice).toHaveBeenCalledWith(8.1)
  })

  it('índice igual → guarda sync pero no registra historial', async () => {
    const d = deps({ getIndice: vi.fn().mockResolvedValue({ rut: 'r', indice: 8.3 }) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'sincronizado', indice: 8.3, indiceAnterior: 8.3, cambio: false })
    expect(d.registrarIndice).not.toHaveBeenCalled()
  })

  it('FedeGolf devuelve índice null con caché → degradado, NO pisa el último índice', async () => {
    const d = deps({ getIndice: vi.fn().mockResolvedValue({ rut: 'r', indice: null }) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'degradado', indice: 8.3, motivo: 'respuesta_inesperada' })
    expect(d.guardarSync).not.toHaveBeenCalled()
    expect(d.registrarIndice).not.toHaveBeenCalled()
  })

  it('índice null sin caché previo → sincronizado sin cambio (nada que perder)', async () => {
    const d = deps({
      leerCredenciales: vi.fn().mockResolvedValue({ ...credsBase, ultimo_indice: null }),
      getIndice: vi.fn().mockResolvedValue({ rut: 'r', indice: null }),
    })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'sincronizado', indice: null, indiceAnterior: null, cambio: false })
    expect(d.registrarIndice).not.toHaveBeenCalled()
  })

  it('freno de reintentos activo → cacheado sin tocar FedeGolf', async () => {
    const d = deps({ puedeConsultarFedegolf: vi.fn(() => false) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'cacheado', indice: 8.3 })
    expect(d.decrypt).not.toHaveBeenCalled()
    expect(d.login).not.toHaveBeenCalled()
  })

  it('dentro del cooldown no consume el freno de reintentos', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ ...credsBase, ultimo_sync: '2026-10-19T11:00:00Z' }) })
    expect(await sincronizarIndice(d)).toEqual({ estado: 'cacheado', indice: 8.3 })
    expect(d.puedeConsultarFedegolf).not.toHaveBeenCalled()
  })
})
