/**
 * FollowRoundButton en iPhone — crítica visual del PR #449 (V1 / V2).
 *
 * V1: en Safari sin la app instalada, "Seguir" abre EL banner de instalación
 * (PWAInstallBanner) con contexto; nunca un segundo aviso encimado.
 * V2: el aviso propio (iOS < 16.4 / errores) respeta la zona segura inferior y
 * nunca excede el viewport.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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

import { FollowRoundButton, IOS_INSTALL_REASON, IOS_TOO_OLD_COPY } from './FollowRoundButton'

const props = { codigo: '4YDC3G', courseName: 'Los Leones', players: [], totalHoles: 9 }

beforeEach(() => vi.clearAllMocks())

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
    // jsdom reordena los argumentos de env(); alcanza con ver que la zona segura está en el cálculo.
    expect(notice.style.bottom).toContain('env(')
    expect(notice.style.bottom).toContain('safe-area-inset-bottom')
    expect(notice.style.maxHeight).toContain('100dvh')
    expect(notice.style.overflowY).toBe('auto')
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('sin soporte de push en el navegador no se muestra nada', () => {
    supportStatus.value = { supported: false, reason: 'no_browser_api' }
    const { container } = render(<FollowRoundButton {...props} />)
    expect(container.querySelector('button')).toBeNull()
  })
})
