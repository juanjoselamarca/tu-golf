import { describe, it, expect, beforeEach } from 'vitest'
import {
  _reiniciarAperturaEnMemoria,
  aperturaLibrePara,
  avisoDeEstaApertura,
  CLAVE_EXPERIENCIA_VISTA,
  experienciaPendiente,
  marcarExperienciaVista,
  tomarApertura,
} from './aviso-de-apertura'

function memoria(): Storage {
  const m = new Map<string, string>()
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v) },
    removeItem: (k) => { m.delete(k) },
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size },
  }
}

const roto: Storage = {
  getItem: () => { throw new Error('bloqueado') },
  setItem: () => { throw new Error('bloqueado') },
  removeItem: () => {}, clear: () => {}, key: () => null, length: 0,
}

describe('aviso-de-apertura — un solo aviso modal por apertura', () => {
  beforeEach(() => _reiniciarAperturaEnMemoria())

  it('el primero que se muestra se queda con la apertura; el segundo espera', () => {
    const s = memoria()
    expect(tomarApertura('experiencia', s)).toBe(true)
    expect(tomarApertura('vincular-fedegolf', s)).toBe(false)
    expect(aperturaLibrePara('permiso-push', s)).toBe(false)
    expect(avisoDeEstaApertura(s)).toBe('experiencia')
  })

  it('el mismo aviso puede volver a pedirla (re-render o recarga en la misma apertura)', () => {
    const s = memoria()
    expect(tomarApertura('vincular-fedegolf', s)).toBe(true)
    expect(tomarApertura('vincular-fedegolf', s)).toBe(true)
  })

  it('una apertura nueva (sessionStorage vacío) está libre', () => {
    const s = memoria()
    tomarApertura('experiencia', s)
    _reiniciarAperturaEnMemoria()
    expect(aperturaLibrePara('vincular-fedegolf', memoria())).toBe(true)
  })

  it('con el storage bloqueado, la memoria del módulo igual impide el segundo aviso', () => {
    expect(tomarApertura('experiencia', roto)).toBe(true)
    expect(tomarApertura('vincular-fedegolf', roto)).toBe(false)
  })

  it('«Personaliza tu experiencia» queda pendiente hasta marcarla, con su clave histórica', () => {
    const l = memoria()
    expect(experienciaPendiente(l)).toBe(true)
    marcarExperienciaVista(l)
    expect(l.getItem(CLAVE_EXPERIENCIA_VISTA)).toBe('1')
    expect(experienciaPendiente(l)).toBe(false)
  })

  it('sin storage no se da por pendiente (no bloquea a los demás para siempre)', () => {
    expect(experienciaPendiente(null)).toBe(false)
    expect(experienciaPendiente(roto)).toBe(false)
  })
})
