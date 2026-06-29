import { describe, it, expect } from 'vitest'
import { shareableText, whatsappShareUrl } from './whatsapp'
import type { SharePayload } from './types'

/**
 * Dominio "compartir" · formato wa.me, fuente ÚNICA (un concepto, una fuente).
 * Antes vivía inline en runShareCascade (useShare); el ShareSheet también lo
 * necesita para su botón WhatsApp → se extrae aquí para no duplicarlo.
 */
const payload: SharePayload = {
  title: 'Mi ronda — Golfers+',
  text: 'Jugué 82 (+10) en Los Leones',
  url: 'https://golfersplus.vercel.app/tarjeta/abc',
}

describe('shareableText', () => {
  it('une texto y url separados por un espacio', () => {
    expect(shareableText(payload)).toBe(
      'Jugué 82 (+10) en Los Leones https://golfersplus.vercel.app/tarjeta/abc',
    )
  })

  it('sin url no deja espacio colgando', () => {
    expect(shareableText({ ...payload, url: '' })).toBe('Jugué 82 (+10) en Los Leones')
  })
})

describe('whatsappShareUrl', () => {
  it('construye wa.me con el texto+url url-encodeados', () => {
    const url = whatsappShareUrl(payload)
    expect(url.startsWith('https://wa.me/?text=')).toBe(true)
    expect(decodeURIComponent(url)).toContain(payload.text)
    expect(decodeURIComponent(url)).toContain(payload.url)
  })

  it('escapa caracteres especiales (no rompe el query)', () => {
    const url = whatsappShareUrl({ ...payload, text: 'a&b=c #1' })
    expect(url).not.toContain('a&b=c #1') // crudo no
    expect(url).toContain(encodeURIComponent('a&b=c #1'))
  })
})
