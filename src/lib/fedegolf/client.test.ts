import { describe, it, expect, vi, afterEach } from 'vitest'
import { fedegolfLogin, fedegolfGetIndice } from './client'
import { esFedegolfError } from './http'

function res(status: number, body: unknown = null, cookie: string | null = null): Response {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      getSetCookie: () => (cookie ? [cookie] : []),
      get: (k: string) => (k.toLowerCase() === 'set-cookie' ? cookie : null),
    },
    json: async () => {
      if (body === '__invalid__') throw new SyntaxError('Unexpected token')
      return body
    },
  } as unknown as Response
}

describe('fedegolfLogin', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('302 → sesión', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, null, 'PHPSESSID=a1; path=/'))
      .mockResolvedValueOnce(res(302, { data: null })))
    await expect(fedegolfLogin('1-9', 'x')).resolves.toMatchObject({ cookie: 'PHPSESSID=a1' })
  })

  it('400 con msg (respuesta real ante clave mala) → credenciales', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, null, 'PHPSESSID=a1; path=/'))
      .mockResolvedValueOnce(res(400, { service: 'login', msg: 'Usuario o contraseña incorrectos', data: null })))
    const err = await fedegolfLogin('1-9', 'x').catch((e) => e)
    expect(esFedegolfError(err, 'credenciales')).toBe(true)
  })

  it('400 sin msg → respuesta_inesperada (no se asume clave mala)', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, null, 'PHPSESSID=a1; path=/'))
      .mockResolvedValueOnce(res(400, '__invalid__')))
    const err = await fedegolfLogin('1-9', 'x').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
  })

  it('200 inesperado → respuesta_inesperada', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, null, 'PHPSESSID=a1; path=/'))
      .mockResolvedValueOnce(res(200, {})))
    const err = await fedegolfLogin('1-9', 'x').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
  })

  it('sin PHPSESSID inicial → no_disponible', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(res(200, null, null)))
    const err = await fedegolfLogin('1-9', 'x').catch((e) => e)
    expect(esFedegolfError(err, 'no_disponible')).toBe(true)
  })

  it('red caída → no_disponible (nunca credenciales)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    const err = await fedegolfLogin('1-9', 'x').catch((e) => e)
    expect(esFedegolfError(err, 'no_disponible')).toBe(true)
  })
})

describe('fedegolfGetIndice', () => {
  afterEach(() => vi.unstubAllGlobals())
  const session = { cookie: 'PHPSESSID=a1' }

  it('parsea el índice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, { indice: '8.3' })))
    await expect(fedegolfGetIndice(session, '1-9')).resolves.toEqual({ rut: '1-9', indice: 8.3 })
  })

  it('JSON inválido → respuesta_inesperada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, '__invalid__')))
    const err = await fedegolfGetIndice(session, '1-9').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
  })

  it('4xx → respuesta_inesperada sin RUT en el mensaje', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(400, null)))
    const err = await fedegolfGetIndice(session, '12345678-9').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
    expect(err.message).not.toContain('12345678')
  })
})
