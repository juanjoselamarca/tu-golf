/**
 * FollowRoundButton en iPhone — crítica visual del PR #449 (V1 / V2).
 *
 * V1: en Safari sin la app instalada, "Seguir" abre EL banner de instalación
 * (PWAInstallBanner) con contexto; nunca un segundo aviso encimado.
 * V2: el aviso propio (iOS < 16.4 / errores) respeta la zona segura inferior y
 * nunca excede el viewport.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-vapid-key')

const supportStatus = { value: { supported: false, reason: 'ios_not_pwa' } as { supported: boolean; reason?: string } }
vi.mock('@/lib/push-notifications', () => ({
  getPushSupportStatus: () => supportStatus.value,
}))
vi.mock('@/lib/round-notifications', () => ({
  followRound: vi.fn(async () => 'ok'),
  unfollowRound: vi.fn(async () => true),
  isFollowingRound: vi.fn(() => false),
  showSpectatorNotification: vi.fn(async () => {}),
}))
const requestPwaInstall = vi.fn()
vi.mock('@/components/PWAInstallBanner', () => ({ requestPwaInstall: (r: string) => requestPwaInstall(r) }))

import { FollowRoundButton, IOS_INSTALL_REASON, IOS_TOO_OLD_COPY, bottomNoticeStyle } from './FollowRoundButton'

const props = { codigo: '4YDC3G', courseName: 'Los Leones', players: [], totalHoles: 9 }

/**
 * La barra inferior fija de Navbar (sólo con sesión) tal como llega al DOM:
 * <nav> fixed, bottom 0, zIndex 100, 52px + zona segura. jsdom no calcula
 * layout: el alto se fija en getBoundingClientRect.
 */
function mountBottomNav({ height = 68, zIndex = 100 } = {}) {
  const nav = document.createElement('nav')
  nav.setAttribute('data-test', 'bottom-nav')
  nav.style.position = 'fixed'
  nav.style.bottom = '0px'
  nav.style.left = '0px'
  nav.style.right = '0px'
  nav.style.zIndex = String(zIndex)
  nav.getBoundingClientRect = () => ({ x: 0, y: 844 - height, width: 390, height, top: 844 - height, bottom: 844, left: 0, right: 390, toJSON: () => ({}) })
  document.body.appendChild(nav)
  return nav
}

beforeEach(() => {
  vi.clearAllMocks()
  document.querySelectorAll('[data-test="bottom-nav"]').forEach(n => n.remove())
})

describe('FollowRoundButton — iPhone sin la app instalada (V1)', () => {
  it('"Seguir" abre el banner de instalación con contexto y NO monta un segundo aviso', () => {
    supportStatus.value = { supported: false, reason: 'ios_not_pwa' }
    render(<FollowRoundButton {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /seguir/i }))
    expect(requestPwaInstall).toHaveBeenCalledWith(IOS_INSTALL_REASON)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText(/Agregar a pantalla de inicio/)).toBeNull()
  })

  it('el botón se ve igual que en Android (mismo copy "Seguir", campana)', () => {
    supportStatus.value = { supported: false, reason: 'ios_not_pwa' }
    render(<FollowRoundButton {...props} />)
    expect(screen.getByRole('button', { name: /seguir/i }).textContent).toContain('Seguir')
  })
})

describe('FollowRoundButton — iOS < 16.4 y avisos propios (V2)', () => {
  it('iOS viejo: dice que no hay push, sin sugerir instalar, y el aviso respeta la zona segura', () => {
    supportStatus.value = { supported: false, reason: 'ios_too_old' }
    render(<FollowRoundButton {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /seguir/i }))
    expect(requestPwaInstall).not.toHaveBeenCalled()
    const notice = screen.getByRole('status')
    expect(notice.textContent).toContain(IOS_TOO_OLD_COPY)
    expect(notice.textContent).not.toMatch(/instala/i)
    // jsdom descarta max()/env(): se verifica la fuente del estilo y el portal.
    const style = bottomNoticeStyle(null)
    expect(style.bottom).toBe('max(16px, env(safe-area-inset-bottom, 0px))')
    expect(style.maxHeight).toContain('100dvh')
    expect(style.overflowY).toBe('auto')
    // Portal a <body>: fuera de cualquier ancestro con transform del marcador (review V2).
    expect(notice.parentElement).toBe(document.body)
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('con sesión (barra inferior fija de Navbar) el aviso se apoya SOBRE la barra y queda por encima en el apilado (review C-A)', () => {
    supportStatus.value = { supported: false, reason: 'ios_too_old' }
    const nav = mountBottomNav({ height: 68, zIndex: 100 })
    render(<FollowRoundButton {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /seguir/i }))
    const notice = screen.getByRole('status')
    // Apoyado sobre la barra medida del DOM (68px) + 16px de aire: nada de "52px" copiado de Navbar.
    expect(notice.style.bottom).toBe('84px')
    // Por encima de la barra en el orden de apilado, si no "Entendido" no se puede tocar.
    expect(Number(notice.style.zIndex)).toBeGreaterThan(Number(getComputedStyle(nav).zIndex))
    expect(notice.style.maxHeight).toBe('calc(100dvh - 100px)')
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('la barra inferior aparece DESPUÉS del aviso (la sesión se resuelve tarde) y el aviso se acomoda', async () => {
    supportStatus.value = { supported: false, reason: 'ios_too_old' }
    render(<FollowRoundButton {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /seguir/i }))
    const notice = screen.getByRole('status')
    expect(notice.style.zIndex).toBe('90')
    mountBottomNav({ height: 68, zIndex: 100 })
    await waitFor(() => expect(notice.style.bottom).toBe('84px'))
    expect(Number(notice.style.zIndex)).toBe(101)
  })

  it('sin soporte de push en el navegador no se muestra nada', () => {
    supportStatus.value = { supported: false, reason: 'no_browser_api' }
    const { container } = render(<FollowRoundButton {...props} />)
    expect(container.querySelector('button')).toBeNull()
  })
})
