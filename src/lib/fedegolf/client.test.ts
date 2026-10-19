import { describe, it, expect, vi, afterEach } from 'vitest'
import { fedegolfLogin, fedegolfGetIndice, parseIndiceFedegolf } from './client'
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

  it('400 con otro msg (ej. cuenta bloqueada) → respuesta_inesperada: no desvincula a nadie', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(res(200, null, 'PHPSESSID=a1; path=/'))
      .mockResolvedValueOnce(res(400, { service: 'login', msg: 'Demasiados intentos', data: null })))
    const err = await fedegolfLogin('1-9', 'x').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
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

  it('parsea el índice (302 real del endpoint público)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(302, { indice: '8.3' })))
    await expect(fedegolfGetIndice('1-9')).resolves.toEqual({ rut: '1-9', indice: 8.3 })
  })

  it('es público: no manda cookie de sesión', async () => {
    const f = vi.fn().mockResolvedValue(res(302, { indice: '8.3' }))
    vi.stubGlobal('fetch', f)
    await fedegolfGetIndice('1-9')
    expect((f.mock.calls[0][1] as RequestInit).headers).not.toHaveProperty('Cookie')
  })

  it('RUT no encontrado (400 real, body con el RUT) → respuesta_inesperada sin el RUT', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(400, { error: 'usario no encontrado para el rut: 12345678-5' })))
    const err = await fedegolfGetIndice('12345678-5').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
    expect(err.message).not.toContain('12345678')
  })

  it('JSON inválido → respuesta_inesperada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(200, '__invalid__')))
    const err = await fedegolfGetIndice('1-9').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
  })

  it('4xx → respuesta_inesperada sin RUT en el mensaje', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(res(400, null)))
    const err = await fedegolfGetIndice('12345678-9').catch((e) => e)
    expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
    expect(err.message).not.toContain('12345678')
  })
})

describe('parseIndiceFedegolf', () => {
  it.each([
    ['8.3', 8.3],
    ['100.0', 100],
    [' 12.4 ', 12.4],
    ['0', 0],
    ['-1.5', -1.5],
    [9.6, 9.6],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%o → %o', (valor, esperado) => expect(parseIndiceFedegolf(valor)).toBe(esperado))

  it.each(['12,3', '+2.0', 'N/A', '8.3.1', '1234.5', NaN, {}])(
    '%o → respuesta_inesperada (un formato nuevo nunca se persiste como índice)',
    (valor) => {
      let err: unknown
      try { parseIndiceFedegolf(valor) } catch (e) { err = e }
      expect(esFedegolfError(err, 'respuesta_inesperada')).toBe(true)
    },
  )
})
