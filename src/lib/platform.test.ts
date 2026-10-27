import { describe, it, expect, vi, afterEach } from 'vitest'
import { sistemaMovilDeUA, detectarSistemaMovil } from './platform'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD_VIEJO = 'Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) AppleWebKit/605.1.15'
const IPADOS_COMO_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

describe('sistemaMovilDeUA', () => {
  it('iPhone y iPad → ios', () => {
    expect(sistemaMovilDeUA(IPHONE)).toBe('ios')
    expect(sistemaMovilDeUA(IPAD_VIEJO)).toBe('ios')
  })

  it('iPadOS que se presenta como Mac: ios sólo si hay pantalla táctil', () => {
    expect(sistemaMovilDeUA(IPADOS_COMO_MAC, true)).toBe('ios')
    // Un Mac de escritorio no es un teléfono: no se adivina.
    expect(sistemaMovilDeUA(IPADOS_COMO_MAC, false)).toBe('desconocido')
  })

  it('Android (Chrome y Samsung Internet) → android', () => {
    expect(sistemaMovilDeUA(ANDROID)).toBe('android')
    expect(sistemaMovilDeUA(SAMSUNG)).toBe('android')
  })

  it('escritorio o UA vacío → desconocido', () => {
    expect(sistemaMovilDeUA(WINDOWS)).toBe('desconocido')
    expect(sistemaMovilDeUA('')).toBe('desconocido')
  })
})

describe('detectarSistemaMovil', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lee navigator.userAgent', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID)
    expect(detectarSistemaMovil()).toBe('android')
  })

  it('si leer el navegador lanza, responde desconocido (nunca rompe la pantalla)', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockImplementation(() => { throw new Error('boom') })
    expect(detectarSistemaMovil()).toBe('desconocido')
  })
})
