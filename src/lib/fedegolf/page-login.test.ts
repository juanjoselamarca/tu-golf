import { describe, it, expect, vi, afterEach } from 'vitest'
import { fedegolfPageLogin } from './page-login'

function mockRes({
  html = '',
  setCookie = null,
  status = 200,
}: {
  html?: string
  setCookie?: string | null
  status?: number
}) {
  return {
    status,
    headers: {
      getSetCookie: () => (setCookie ? [setCookie] : []),
      get: (k: string) => (k.toLowerCase() === 'set-cookie' ? setCookie : null),
    },
    text: async () => html,
  } as unknown as Response
}

describe('fedegolfPageLogin', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hace GET / para PHPSESSID+lva y POST / con el form de login', async () => {
    const lva = 'a0329906383471798d4e5f633c66a848'
    const loginHtml = `<form id="contacto" method="post"><input type="hidden" name="lva" value="${lva}"><input name="rut"><input name="pass" type="password"></form>`
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockRes({ html: loginHtml, setCookie: 'PHPSESSID=sess123; path=/' }))
      .mockResolvedValueOnce(mockRes({ status: 200, setCookie: null }))
    vi.stubGlobal('fetch', fetchMock)

    const session = await fedegolfPageLogin('19686463-6', 'secret')

    expect(session.cookie).toBe('PHPSESSID=sess123')
    expect(fetchMock.mock.calls[0][0]).toBe('https://www.fedegolf.cl/')
    const [url, opts] = fetchMock.mock.calls[1]
    expect(url).toBe('https://www.fedegolf.cl/')
    expect(opts.method).toBe('POST')
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(opts.headers.Cookie).toBe('PHPSESSID=sess123')
    const body = String(opts.body)
    expect(body).toContain(`lva=${lva}`)
    expect(body).toContain('rut=19686463-6')
    expect(body).toContain('pass=secret')
    expect(body).toContain('aceptar=Ingresar')
  })

  it('usa el nuevo PHPSESSID si el POST devuelve uno', async () => {
    const loginHtml = `<input name="lva" value="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa">`
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockRes({ html: loginHtml, setCookie: 'PHPSESSID=old; path=/' }))
      .mockResolvedValueOnce(mockRes({ status: 200, setCookie: 'PHPSESSID=new; path=/' }))
    vi.stubGlobal('fetch', fetchMock)
    const session = await fedegolfPageLogin('1-9', 'x')
    expect(session.cookie).toBe('PHPSESSID=new')
  })

  it('lanza si falta el token lva', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(mockRes({ html: '<form>sin token</form>', setCookie: 'PHPSESSID=x' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fedegolfPageLogin('1-9', 'x')).rejects.toThrow(/lva/i)
  })
})
