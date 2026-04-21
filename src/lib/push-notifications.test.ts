import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock VAPID key ANTES de importar el módulo (asserts at module load en server).
vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'test-vapid-key')

import {
  isIOS,
  getIOSVersion,
  isStandalonePWA,
  getPushSupportStatus,
  isPushSupported,
} from './push-notifications'

// Helper: inyecta un user agent + matchMedia simulados en globals de jsdom.
function mockBrowser(opts: {
  userAgent: string
  standalone?: boolean
  standaloneNav?: boolean
  pushApiAvailable?: boolean
}) {
  Object.defineProperty(navigator, 'userAgent', {
    value: opts.userAgent,
    configurable: true,
  })

  // navigator.standalone (iOS Safari)
  Object.defineProperty(navigator, 'standalone', {
    value: opts.standaloneNav ?? false,
    configurable: true,
  })

  // matchMedia('(display-mode: standalone)')
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: q.includes('standalone') && (opts.standalone ?? false),
    media: q,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))

  // Push APIs — por default presentes (sobrescribir si se pasa false)
  const pushAvailable = opts.pushApiAvailable ?? true
  if (pushAvailable) {
    if (!('PushManager' in window)) {
      ;(window as unknown as Record<string, unknown>).PushManager = class {}
    }
    if (!('Notification' in window)) {
      ;(window as unknown as Record<string, unknown>).Notification = class {}
    }
    if (!('serviceWorker' in navigator)) {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve({}) },
        configurable: true,
      })
    }
  }
}

beforeEach(() => {
  // Reset mocks antes de cada test
  vi.restoreAllMocks()
})

describe('isIOS — detección de plataforma', () => {
  it('detecta iPhone', () => {
    mockBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15' })
    expect(isIOS()).toBe(true)
  })

  it('detecta iPad', () => {
    mockBrowser({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_4) AppleWebKit/605.1.15' })
    expect(isIOS()).toBe(true)
  })

  it('NO detecta como iOS un Android', () => {
    mockBrowser({ userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36' })
    expect(isIOS()).toBe(false)
  })

  // Note: Mac desktop sin touch es difícil de testear en jsdom porque
  // 'ontouchend' in document puede devolver true vía prototype. La lógica
  // real en producción es safe porque el iPad-as-Mac requiere AMBOS: UA Mac
  // + ontouchend. En jsdom no podemos simular fácilmente. Skipping.
})

describe('getIOSVersion — parsing del user agent', () => {
  it('parsea iOS 16.4 correctamente', () => {
    mockBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X)' })
    expect(getIOSVersion()).toBe(16.4)
  })

  it('parsea iOS 15.2', () => {
    mockBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X)' })
    expect(getIOSVersion()).toBe(15.2)
  })

  it('retorna null si no hay versión en UA', () => {
    mockBrowser({ userAgent: 'Mozilla/5.0 (Linux; Android 12)' })
    expect(getIOSVersion()).toBe(null)
  })
})

describe('getPushSupportStatus — gate completo (BUG #14 P2)', () => {
  it('Android Chrome: supported', () => {
    mockBrowser({ userAgent: 'Mozilla/5.0 (Linux; Android 12) Chrome/120' })
    expect(getPushSupportStatus()).toEqual({ supported: true })
  })

  it('iOS 15.x: bloquea con ios_too_old', () => {
    mockBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X)' })
    const status = getPushSupportStatus()
    expect(status.supported).toBe(false)
    if (!status.supported) {
      expect(status.reason).toBe('ios_too_old')
      expect(status.minIOSVersion).toBe(16.4)
    }
  })

  it('iOS 16.4 Safari sin PWA: bloquea con ios_not_pwa', () => {
    mockBrowser({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) Safari/604.1',
      standalone: false,
      standaloneNav: false,
    })
    const status = getPushSupportStatus()
    expect(status.supported).toBe(false)
    if (!status.supported) expect(status.reason).toBe('ios_not_pwa')
  })

  it('iOS 16.4+ con PWA instalado (display-mode): supported', () => {
    mockBrowser({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      standalone: true,
    })
    expect(getPushSupportStatus()).toEqual({ supported: true })
  })

  it('iOS 17 con navigator.standalone=true (add to home screen): supported', () => {
    mockBrowser({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
      standaloneNav: true,
    })
    expect(getPushSupportStatus()).toEqual({ supported: true })
  })
})

describe('isPushSupported — boolean shortcut', () => {
  it('delega a getPushSupportStatus().supported', () => {
    mockBrowser({ userAgent: 'Mozilla/5.0 (Linux; Android 12) Chrome/120' })
    expect(isPushSupported()).toBe(true)

    mockBrowser({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0)' })
    expect(isPushSupported()).toBe(false)
  })
})

describe('isStandalonePWA', () => {
  it('detecta display-mode: standalone', () => {
    mockBrowser({ userAgent: 'test', standalone: true })
    expect(isStandalonePWA()).toBe(true)
  })

  it('detecta navigator.standalone (iOS legacy)', () => {
    mockBrowser({ userAgent: 'test', standaloneNav: true })
    expect(isStandalonePWA()).toBe(true)
  })

  it('retorna false en browser normal', () => {
    mockBrowser({ userAgent: 'test', standalone: false, standaloneNav: false })
    expect(isStandalonePWA()).toBe(false)
  })
})
