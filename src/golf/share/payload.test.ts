import { describe, it, expect } from 'vitest'
import { SHARE_TAGLINE, BRAND } from './copy'
import {
  buildRoundShare,
  buildResultShare,
  buildTournamentShare,
  buildLiveShare,
  buildOrganizerShare,
  buildInviteShare,
} from './payload'

/**
 * Builders de SharePayload (dominio puro del sistema "compartir"). Centralizan el
 * copy con tildes correctas y la tagline única (decisión C del spec), cerrando
 * los bugs de la auditoría: "gano"/"quedo" sin tilde y doble tagline.
 */

describe('copy — constantes de marca', () => {
  it('tagline única (decisión C): "El golf amateur en español"', () => {
    expect(SHARE_TAGLINE).toBe('El golf amateur en español')
  })
  it('marca = Golfers+', () => {
    expect(BRAND).toBe('Golfers+')
  })
})

describe('buildRoundShare — mi ronda (primera persona)', () => {
  const p = buildRoundShare({
    gross: 82,
    vsParLabel: '+10',
    courseName: 'Los Leones',
    url: 'https://golfersplus.vercel.app/tarjeta/abc',
  })
  it('texto en primera persona con gross + vs-par + cancha', () => {
    expect(p.text).toContain('Jugué 82 (+10) en Los Leones')
  })
  it('incluye marca y la url propagada', () => {
    expect(p.text).toContain(BRAND)
    expect(p.url).toBe('https://golfersplus.vercel.app/tarjeta/abc')
  })
  it('propaga la imagen si se entrega', () => {
    const img = { blob: new Blob(['x'], { type: 'image/png' }) }
    const withImg = buildRoundShare({ gross: 80, vsParLabel: 'Par', courseName: 'X', url: 'u', image: img })
    expect(withImg.image).toBe(img)
  })
})

describe('buildResultShare — resultado ronda libre (ganador / empate)', () => {
  it('ganador con tilde correcta ("ganó", NO "gano")', () => {
    const p = buildResultShare({ winnerName: 'Pedro Soto', isTie: false, courseName: 'Sport Francés', scoreText: '74 (+2)', url: 'u' })
    expect(p.text).toContain('Pedro Soto ganó')
    expect(p.text).not.toContain('Pedro Soto gano ')
    expect(p.text).toContain('Sport Francés')
    expect(p.text).toContain('74 (+2)')
  })
  it('empate', () => {
    const p = buildResultShare({ winnerName: null, isTie: true, courseName: 'Los Leones', scoreText: '80', url: 'u' })
    expect(p.text.toLowerCase()).toContain('empate')
  })
})

describe('buildTournamentShare — posición en torneo', () => {
  it('"quedó" con tilde (NO "quedo") + posición y torneo', () => {
    const p = buildTournamentShare({ playerName: 'Ana Díaz', position: 3, tournamentName: 'Copa Verano', gross: 79, url: 'u' })
    expect(p.text).toContain('Ana Díaz quedó #3 en Copa Verano')
    expect(p.text).not.toContain('quedo #')
    expect(p.text).toContain('79')
  })
})

describe('buildLiveShare / buildOrganizerShare / buildInviteShare', () => {
  it('live: invita a seguir la ronda en vivo', () => {
    const p = buildLiveShare({ url: 'https://golfersplus.vercel.app/torneo/x/en-vivo' })
    expect(p.text.toLowerCase()).toContain('en vivo')
    expect(p.url).toContain('en-vivo')
  })
  it('organizer: invita a unirse a jugar', () => {
    const p = buildOrganizerShare({ url: 'https://golfersplus.vercel.app/torneo/x/unirse' })
    expect(p.text.toLowerCase()).toMatch(/únete|unite|sumate|unirse/)
    expect(p.url).toContain('unirse')
  })
  it('invite: copy fijo con título y texto', () => {
    const p = buildInviteShare()
    expect(p.title).toContain(BRAND)
    expect(p.text.length).toBeGreaterThan(0)
    expect(p.url).toBeTruthy()
  })
})
