import { describe, it, expect, vi } from 'vitest'
import { vincularFedegolf, type DepsVincular } from './vincular'
import { FedegolfError } from './http'

const sesion = { cookie: 'PHPSESSID=x', perfil: { usuarioId: 1, nombreCompleto: 'Juan Pérez', genero: 'M' as const, sexoRaw: 'Varon', fechaNacimiento: null } }
const ENTRADA = { rut: '1-9', password: 'clave' }

function deps(over: Partial<DepsVincular> = {}) {
  const base = {
    login: vi.fn().mockResolvedValue(sesion),
    getIndice: vi.fn().mockResolvedValue({ rut: '1-9', indice: 8.1 }),
    getUsuario: vi.fn().mockResolvedValue({ ...sesion.perfil, fechaNacimiento: '1980-01-02' }),
    encrypt: vi.fn((v: string) => `enc(${v})`),
    leerCredenciales: vi.fn().mockResolvedValue(null),
    guardarCredenciales: vi.fn().mockResolvedValue(true),
    guardarSync: vi.fn().mockResolvedValue(true),
    registrarIndice: vi.fn().mockResolvedValue(undefined),
    sellarSinIndice: vi.fn().mockResolvedValue(undefined),
    completarPerfil: vi.fn().mockResolvedValue(undefined),
    reportar: vi.fn(),
  }
  return { ...base, ...over } as typeof base
}

describe('vincularFedegolf', () => {
  it('primera vinculación → guarda cifrado, persiste el índice por CAS y registra historial', async () => {
    const d = deps()
    expect(await vincularFedegolf(d, ENTRADA)).toEqual({ estado: 'vinculado', indice: 8.1, sinIndice: false, sincronizado: true, nombre: 'Juan Pérez', genero: 'M' })
    expect(d.guardarCredenciales).toHaveBeenCalledWith({ rut_encrypted: 'enc(1-9)', password_encrypted: 'enc(clave)' })
    expect(d.guardarSync).toHaveBeenCalledWith(8.1, null)
    expect(d.registrarIndice).toHaveBeenCalledWith(8.1)
    expect(d.completarPerfil).toHaveBeenCalledWith({ genero: 'M', fechaNacimiento: '1980-01-02' })
  })

  it('re-vincular con el mismo índice → NO duplica historial (no hay aviso falso de cambio)', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ rut_encrypted: 'r', activo: false, ultimo_sync: null, ultimo_indice: 8.1 }) })
    await vincularFedegolf(d, ENTRADA)
    expect(d.guardarSync).toHaveBeenCalledWith(8.1, 8.1)
    expect(d.registrarIndice).not.toHaveBeenCalled()
  })

  it('re-vincular con índice distinto → registra el cambio', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ rut_encrypted: 'r', activo: false, ultimo_sync: null, ultimo_indice: 8.3 }) })
    await vincularFedegolf(d, ENTRADA)
    expect(d.guardarSync).toHaveBeenCalledWith(8.1, 8.3)
    expect(d.registrarIndice).toHaveBeenCalledWith(8.1)
  })

  it('el previo se lee ANTES del upsert (es el anterior del compare-and-set)', async () => {
    const orden: string[] = []
    const d = deps({
      leerCredenciales: vi.fn(async () => { orden.push('leer'); return null }),
      guardarCredenciales: vi.fn(async () => { orden.push('upsert'); return true }),
    })
    await vincularFedegolf(d, ENTRADA)
    expect(orden).toEqual(['leer', 'upsert'])
  })

  it('carrera con el cron (CAS falla) → sin historial', async () => {
    const d = deps({ guardarSync: vi.fn().mockResolvedValue(false) })
    await vincularFedegolf(d, ENTRADA)
    expect(d.registrarIndice).not.toHaveBeenCalled()
  })

  it('clave rechazada → credenciales_invalidas, sin guardar ni reportar', async () => {
    const d = deps({ login: vi.fn().mockRejectedValue(new FedegolfError('credenciales', 'login rechazado')) })
    expect(await vincularFedegolf(d, ENTRADA)).toEqual({ estado: 'credenciales_invalidas' })
    expect(d.guardarCredenciales).not.toHaveBeenCalled()
    expect(d.reportar).not.toHaveBeenCalled()
  })

  it('FedeGolf caído en el login → fedegolf_no_disponible y se reporta', async () => {
    const d = deps({ login: vi.fn().mockRejectedValue(new FedegolfError('no_disponible', 'timeout')) })
    expect(await vincularFedegolf(d, ENTRADA)).toEqual({ estado: 'fedegolf_no_disponible' })
    expect(d.reportar).toHaveBeenCalledWith(expect.any(FedegolfError), 'login_fedegolf')
    expect(d.guardarCredenciales).not.toHaveBeenCalled()
  })

  it('sin índice (get_indice_rut falla) → se vincula igual sin tocar el índice guardado', async () => {
    const d = deps({ getIndice: vi.fn().mockRejectedValue(new FedegolfError('no_disponible', 'timeout')) })
    expect(await vincularFedegolf(d, ENTRADA)).toMatchObject({ estado: 'vinculado', indice: null, sinIndice: false, sincronizado: false })
    expect(d.guardarSync).not.toHaveBeenCalled()
    expect(d.registrarIndice).not.toHaveBeenCalled()
    // No respondió: no se sabe si tiene índice, no se marca nada.
    expect(d.sellarSinIndice).not.toHaveBeenCalled()
  })

  it('get_indice_rut falla y ya estaba sin índice → sigue sin índice, sin re-sellar', async () => {
    const d = deps({
      getIndice: vi.fn().mockRejectedValue(new FedegolfError('no_disponible', 'timeout')),
      leerCredenciales: vi.fn().mockResolvedValue({ ultimo_indice: 9, sin_indice_desde: '2026-10-01T00:00:00Z' }),
    })
    expect(await vincularFedegolf(d, ENTRADA)).toMatchObject({ estado: 'vinculado', sinIndice: true })
    expect(d.sellarSinIndice).not.toHaveBeenCalled()
  })

  it('FedeGolf responde sin índice vigente → se sella conservando el desde previo', async () => {
    const d = deps({
      getIndice: vi.fn().mockResolvedValue({ rut: '1-9', indice: null }),
      leerCredenciales: vi.fn().mockResolvedValue({ ultimo_indice: 9, sin_indice_desde: '2026-10-01T00:00:00Z' }),
    })
    expect(await vincularFedegolf(d, ENTRADA)).toMatchObject({ estado: 'vinculado', indice: null, sinIndice: true, sincronizado: true })
    expect(d.sellarSinIndice).toHaveBeenCalledWith('2026-10-01T00:00:00Z')
    expect(d.guardarSync).not.toHaveBeenCalled()
  })

  it('FedeGolf responde sin índice (primera vez) → se sella desde ahora', async () => {
    const d = deps({ getIndice: vi.fn().mockResolvedValue({ rut: '1-9', indice: null }) })
    expect(await vincularFedegolf(d, ENTRADA)).toMatchObject({ sinIndice: true })
    expect(d.sellarSinIndice).toHaveBeenCalledWith(null)
  })

  it('con índice → guardarSync limpia la marca y no se sella', async () => {
    const d = deps({ leerCredenciales: vi.fn().mockResolvedValue({ ultimo_indice: 9, sin_indice_desde: '2026-10-01T00:00:00Z' }) })
    expect(await vincularFedegolf(d, ENTRADA)).toMatchObject({ estado: 'vinculado', indice: 8.1, sinIndice: false })
    expect(d.guardarSync).toHaveBeenCalledWith(8.1, 9)
    expect(d.sellarSinIndice).not.toHaveBeenCalled()
  })

  it('upsert falla → error_guardado, sin índice ni perfil', async () => {
    const d = deps({ guardarCredenciales: vi.fn().mockResolvedValue(false) })
    expect(await vincularFedegolf(d, ENTRADA)).toEqual({ estado: 'error_guardado' })
    expect(d.guardarSync).not.toHaveBeenCalled()
    expect(d.completarPerfil).not.toHaveBeenCalled()
  })

  it('getUsuario falla y sin género → no toca el perfil', async () => {
    const d = deps({
      login: vi.fn().mockResolvedValue({ cookie: 'c' }),
      getUsuario: vi.fn().mockRejectedValue(new Error('x')),
    })
    expect(await vincularFedegolf(d, ENTRADA)).toMatchObject({ estado: 'vinculado', nombre: '', genero: null })
    expect(d.completarPerfil).not.toHaveBeenCalled()
  })
})
