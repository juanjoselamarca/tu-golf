import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

const auth = vi.hoisted(() => ({ user: null as null | { id: string; user_metadata: Record<string, unknown> } }))
const nav = vi.hoisted(() => ({ pathname: '/dashboard' }))

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: auth.user }) }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

import { AvisoVincularFedegolf } from './AvisoVincularFedegolf'
import { _reiniciarAperturaEnMemoria, CLAVE_EXPERIENCIA_VISTA, tomarApertura } from '@/lib/avisos/aviso-de-apertura'
import { AVISO_VINCULAR_FEDEGOLF_VISTO } from '@/lib/fedegolf/aviso-vincular'

const USER = { id: 'u1', user_metadata: {} }
let fetchMock: ReturnType<typeof vi.fn>

function respuestaGet(mostrar: boolean) {
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(init?.method === 'POST' ? { ok: true } : { mostrar }) }),
  )
}

const llamadasGet = () => fetchMock.mock.calls.filter(([, init]) => !init?.method).length
const llamadasPost = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST').length

describe('AvisoVincularFedegolf', () => {
  beforeEach(() => {
    _reiniciarAperturaEnMemoria()
    sessionStorage.clear()
    localStorage.clear()
    localStorage.setItem(CLAVE_EXPERIENCIA_VISTA, '1')
    auth.user = USER
    nav.pathname = '/dashboard'
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('se muestra cuando el server lo confirma, con logo, nombre accesible y botones', async () => {
    respuestaGet(true)
    render(<AvisoVincularFedegolf />)
    const dialogo = await screen.findByRole('dialog', { name: 'Vincula tu cuenta FedeGolf' })
    expect(dialogo.getAttribute('aria-modal')).toBe('true')
    expect(screen.getByRole('img', { name: 'FedeGolf' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Vincular' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'No vincular' })).toBeTruthy()
    // Queda visto para siempre al mostrarse: en el server y en el dispositivo.
    await waitFor(() => expect(llamadasPost()).toBe(1))
    expect(localStorage.getItem('gp:fedegolf-aviso-vincular-visto:u1')).toBe('1')
  })

  it('«No vincular» lo cierra', async () => {
    respuestaGet(true)
    render(<AvisoVincularFedegolf />)
    fireEvent.click(await screen.findByRole('button', { name: 'No vincular' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape lo cierra', async () => {
    respuestaGet(true)
    render(<AvisoVincularFedegolf />)
    const dialogo = await screen.findByRole('dialog')
    fireEvent.keyDown(dialogo, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Vincula tu cuenta FedeGolf' })).toBeNull())
  })

  it('«Vincular» abre el formulario de vinculación de siempre', async () => {
    respuestaGet(true)
    render(<AvisoVincularFedegolf />)
    fireEvent.click(await screen.findByRole('button', { name: 'Vincular' }))
    expect(screen.queryByRole('dialog', { name: 'Vincula tu cuenta FedeGolf' })).toBeNull()
    expect(await screen.findByLabelText(/RUT/i)).toBeTruthy()
  })

  it('no se muestra si el server dice que no', async () => {
    respuestaGet(false)
    render(<AvisoVincularFedegolf />)
    await waitFor(() => expect(llamadasGet()).toBe(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(llamadasPost()).toBe(0)
  })

  it.each(['/ronda-libre/ABC/score', '/torneo/copa/score', '/ronda-libre/ABC', '/perfil'])(
    'ni pregunta al server en %s',
    async (ruta) => {
      nav.pathname = ruta
      respuestaGet(true)
      render(<AvisoVincularFedegolf />)
      await act(async () => {})
      expect(fetchMock).not.toHaveBeenCalled()
    },
  )

  it('sin sesión no pregunta', async () => {
    auth.user = null
    render(<AvisoVincularFedegolf />)
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('si la sesión ya dice que se vio, no pregunta', async () => {
    auth.user = { id: 'u1', user_metadata: { [AVISO_VINCULAR_FEDEGOLF_VISTO]: '2026-11-27T00:00:00Z' } }
    render(<AvisoVincularFedegolf />)
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('«Personaliza tu experiencia» pendiente va primero: este espera', async () => {
    localStorage.removeItem(CLAVE_EXPERIENCIA_VISTA)
    respuestaGet(true)
    render(<AvisoVincularFedegolf />)
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('si en esta apertura ya salió otro aviso, espera a la próxima', async () => {
    tomarApertura('experiencia')
    respuestaGet(true)
    render(<AvisoVincularFedegolf />)
    await act(async () => {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('si mientras respondía el server el usuario entró a una ronda, no se muestra', async () => {
    let responder: (v: unknown) => void = () => {}
    fetchMock.mockImplementation(() => new Promise((r) => { responder = r }))
    const { rerender } = render(<AvisoVincularFedegolf />)
    nav.pathname = '/ronda-libre/ABC/score'
    rerender(<AvisoVincularFedegolf />)
    await act(async () => { responder({ ok: true, json: () => Promise.resolve({ mostrar: true }) }) })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(llamadasPost()).toBe(0)
  })

  it('si el server falla, no se muestra (fail-closed)', async () => {
    fetchMock.mockRejectedValue(new Error('sin red'))
    render(<AvisoVincularFedegolf />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await act(async () => {})
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
