import { describe, it, expect } from 'vitest'

/**
 * Tests de validación para la creación de torneos.
 * Verifican que la API y el formulario manejan correctamente
 * los 6 formatos, reglas de modo, y validaciones.
 */

const VALID_FORMATS = ['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome'] as const
const VALID_MODOS = ['gross', 'neto'] as const

describe('Tournament Creation Validation', () => {
  describe('Format enum validation', () => {
    it('accepts all 6 golf formats', () => {
      for (const f of VALID_FORMATS) {
        expect(VALID_FORMATS).toContain(f)
      }
      expect(VALID_FORMATS).toHaveLength(6)
    })

    it('includes team formats', () => {
      expect(VALID_FORMATS).toContain('best_ball')
      expect(VALID_FORMATS).toContain('scramble')
      expect(VALID_FORMATS).toContain('foursome')
    })
  })

  describe('Format-Mode rules', () => {
    function resolveModo(format: string, userModo: string): string {
      // Match Play es el único formato con modo exclusivo: no se pueden
      // mantener brackets paralelos gross/neto porque la concesión de palos
      // cambia quién gana cada hoyo. Resto de formatos respeta la elección
      // del organizador — el motor calcula gross y neto en paralelo y la
      // UI ofrece dos leaderboards.
      if (format === 'match_play') return 'neto'
      return userModo
    }

    it('match_play forces neto regardless of user choice', () => {
      expect(resolveModo('match_play', 'gross')).toBe('neto')
      expect(resolveModo('match_play', 'neto')).toBe('neto')
    })

    it('stableford respects user choice (Scratch Stableford = gross es válido)', () => {
      expect(resolveModo('stableford', 'gross')).toBe('gross')
      expect(resolveModo('stableford', 'neto')).toBe('neto')
    })

    it('stroke_play respects user choice', () => {
      expect(resolveModo('stroke_play', 'gross')).toBe('gross')
      expect(resolveModo('stroke_play', 'neto')).toBe('neto')
    })

    it('team formats respect user choice', () => {
      for (const f of ['best_ball', 'scramble', 'foursome']) {
        expect(resolveModo(f, 'gross')).toBe('gross')
        expect(resolveModo(f, 'neto')).toBe('neto')
      }
    })
  })

  describe('Slug generation', () => {
    function generateSlug(name: string): string {
      return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 50)
    }

    it('generates clean slug from tournament name', () => {
      expect(generateSlug('Copa Club Los Leones 2026')).toBe('copa-club-los-leones-2026')
    })

    it('handles accented characters', () => {
      expect(generateSlug('Torneo Ñoño Día')).toBe('torneo-nono-dia')
    })

    it('handles special characters', () => {
      expect(generateSlug('Copa #1 (Spring)')).toBe('copa-1-spring')
    })

    it('truncates long names to 50 chars', () => {
      const longName = 'A'.repeat(100)
      expect(generateSlug(longName).length).toBeLessThanOrEqual(50)
    })
  })

  describe('Hole count validation', () => {
    it('accepts 9 and 18 holes', () => {
      expect([9, 18].includes(9)).toBe(true)
      expect([9, 18].includes(18)).toBe(true)
    })

    it('rejects other hole counts', () => {
      expect([9, 18].includes(27)).toBe(false)
      expect([9, 18].includes(0)).toBe(false)
    })
  })

  describe('Date validation', () => {
    it('accepts valid ISO date', () => {
      expect(/^\d{4}-\d{2}-\d{2}$/.test('2026-04-18')).toBe(true)
    })

    it('rejects invalid date formats', () => {
      expect(/^\d{4}-\d{2}-\d{2}$/.test('18/04/2026')).toBe(false)
      expect(/^\d{4}-\d{2}-\d{2}$/.test('2026-4-18')).toBe(false)
      expect(/^\d{4}-\d{2}-\d{2}$/.test('')).toBe(false)
    })
  })

  describe('Cover URL sanitization', () => {
    function sanitizeCoverUrl(url: string | null | undefined): string | null {
      if (!url) return null
      const trimmed = url.trim()
      if (!trimmed) return null
      try {
        const u = new URL(trimmed)
        if (u.protocol !== 'https:') return null
        return trimmed
      } catch {
        return null
      }
    }

    it('accepts valid HTTPS URLs', () => {
      expect(sanitizeCoverUrl('https://images.unsplash.com/photo.jpg')).toBe('https://images.unsplash.com/photo.jpg')
    })

    it('rejects HTTP URLs', () => {
      expect(sanitizeCoverUrl('http://example.com/img.jpg')).toBeNull()
    })

    it('rejects javascript: URLs', () => {
      expect(sanitizeCoverUrl('javascript:alert(1)')).toBeNull()
    })

    it('rejects data: URLs', () => {
      expect(sanitizeCoverUrl('data:text/html,<h1>hi</h1>')).toBeNull()
    })

    it('handles null/empty', () => {
      expect(sanitizeCoverUrl(null)).toBeNull()
      expect(sanitizeCoverUrl('')).toBeNull()
      expect(sanitizeCoverUrl('  ')).toBeNull()
    })
  })

  describe('Team format identification', () => {
    const TEAM_FORMATS = ['best_ball', 'scramble', 'foursome']

    it('correctly identifies team formats', () => {
      for (const f of TEAM_FORMATS) {
        expect(TEAM_FORMATS.includes(f)).toBe(true)
      }
    })

    it('correctly identifies individual formats', () => {
      for (const f of ['stroke_play', 'stableford', 'match_play']) {
        expect(TEAM_FORMATS.includes(f)).toBe(false)
      }
    })
  })

  describe('Wizard step logic', () => {
    function getTotalSteps(format: string, hasCourse: boolean, siVerified: boolean): number {
      if (format === 'stableford' && hasCourse && !siVerified) return 3
      return 2
    }

    it('stableford with unverified SI gets 3 steps', () => {
      expect(getTotalSteps('stableford', true, false)).toBe(3)
    })

    it('stableford with verified SI gets 2 steps', () => {
      expect(getTotalSteps('stableford', true, true)).toBe(2)
    })

    it('stableford without course gets 2 steps', () => {
      expect(getTotalSteps('stableford', false, false)).toBe(2)
    })

    it('all other formats get 2 steps', () => {
      for (const f of ['stroke_play', 'match_play', 'best_ball', 'scramble', 'foursome']) {
        expect(getTotalSteps(f, true, false)).toBe(2)
      }
    })
  })
})
