/**
 * Slug de torneo: el generador y el validador de las rutas del en vivo deben
 * hablar el mismo alfabeto. Si el generador produce un slug que el validador
 * rechaza, /torneo/<slug>/en-vivo, /live y /neto dan 404 en pleno torneo.
 */
import { describe, it, expect } from 'vitest'
import { genTournamentSlug } from './createTournament'
import { SLUG_TORNEO_VALIDO } from './en-vivo-servidor'

const AHORA = Date.UTC(2026, 10, 28, 12, 0, 0)
const TS = AHORA.toString(36)

describe('genTournamentSlug ↔ SLUG_TORNEO_VALIDO', () => {
  it.each([
    'Copa Verano',
    '🏆 Copa',
    ' Copa',
    '🏆🏆',
    '-Copa',
    '¡ Copa!',
    'Copa -',
    '',
    '   ',
    'Ñandú Club de Golf — Abierto Otoño 2026',
    'x'.repeat(300),
    'a '.repeat(200),
    'İstanbul Open',
    'Copa\u00a0Verano',
    'Copa\tVerano\nFinal',
    'Copa_Verano',
    'Copa.2026',
  ])('«%s» genera un slug que las rutas del en vivo aceptan', (nombre) => {
    const slug = genTournamentSlug(nombre, AHORA)
    expect(slug).toMatch(SLUG_TORNEO_VALIDO)
    expect(slug.length).toBeGreaterThan(0)
    expect(slug.length).toBeLessThanOrEqual(120)
  })

  it('no deja guiones al inicio ni al final, ni dobles', () => {
    for (const nombre of ['🏆 Copa Verano', ' Copa', '¡ Copa!', '-Copa-', 'Copa -', 'x'.repeat(49) + ' y']) {
      const slug = genTournamentSlug(nombre, AHORA)
      expect(slug, nombre).not.toMatch(/^-|-$|--/)
    }
  })

  it('con un nombre sin letras ni dígitos queda solo el sufijo temporal', () => {
    expect(genTournamentSlug('🏆🏆', AHORA)).toBe(TS)
    expect(genTournamentSlug('', AHORA)).toBe(TS)
  })

  it('el caso normal no cambia', () => {
    expect(genTournamentSlug('Copa Verano', AHORA)).toBe(`copa-verano-${TS}`)
    expect(genTournamentSlug('🏆 Copa Verano', AHORA)).toBe(`copa-verano-${TS}`)
  })
})

describe('SLUG_TORNEO_VALIDO', () => {
  it('acepta slugs ya existentes que empiezan con guion (generados antes del 24-nov-2026)', () => {
    expect(SLUG_TORNEO_VALIDO.test(`-copa-verano-${TS}`)).toBe(true)
    expect(SLUG_TORNEO_VALIDO.test(`-${TS}`)).toBe(true)
  })

  it.each(['copa#x', 'copa?next=/x', 'Copa-Verano', 'copa%2F..', 'copa/x', '', 'a'.repeat(121)])('rechaza «%s»', (slug) => {
    expect(SLUG_TORNEO_VALIDO.test(slug)).toBe(false)
  })
})
